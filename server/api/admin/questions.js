import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  requireAdmin,
  sendAdminError,
  testAuthzOk,
  writeAdminAuditLog,
} from "../../../lib/admin.js";
import { readJsonBody } from "../../../lib/auth.js";
import { withDb, withTransaction } from "../../../lib/db.js";
import {
  getAuthServerEnv,
  sendSafeConfigError,
} from "../../../lib/server-env.js";

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), "..", "..", "..");

export default async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let env;
  try {
    env = getAuthServerEnv();
  } catch (error) {
    return sendSafeConfigError(res, error);
  }

  try {
    const admin = await requireAdmin(req, env.databaseUrl, { permission: req.method === "POST" ? "manage_content" : "view_content" });
    if (testAuthzOk(req, res, admin, req.method === "POST" ? "manage_content" : "view_content")) return;

    if (req.method === "POST") {
      const body = await readJsonBody(req);
      const question = await reviewQuestion(env.databaseUrl, admin, body);
      return res.status(200).json({ ok: true, question });
    }

    const questionId = Number(req.query.questionId || req.query.question_id || 0);
    if (Number.isInteger(questionId) && questionId > 0) {
      const detail = await loadQuestionDetail(env.databaseUrl, questionId);
      return res.status(200).json({ ok: true, ...detail });
    }

    const q = String(req.query.q || "").trim().toLowerCase();
    const category = String(req.query.category || "").trim();
    const status = String(req.query.status || "").trim();
    const review = String(req.query.review || "").trim();
    const highYield = String(req.query.highYield || "") === "1";
    const questions = await searchQuestions(env.databaseUrl, { q, category, status, review, highYield });
    return res.status(200).json({ ok: true, questions });
  } catch (error) {
    return sendAdminError(res, error, "Admin questions failed");
  }
}

async function searchQuestions(databaseUrl, { q, category, status, review, highYield }) {
  const questions = await readQuestions();
  const formatted = questions.map(formatQuestion);
  const reviewMap = await loadQuestionReviewOverlay(
    databaseUrl,
    formatted.map((question) => question.id)
  );

  return formatted
    .map((question) => applyReviewOverlay(question, reviewMap.get(question.id)))
    .filter((question) => {
      if (category && question.category !== category) return false;
      if (status && question.status !== status) return false;
      if (
        review === "unreviewed" &&
        !["unreviewed", "needs_official_cross_check"].includes(question.reviewedStatus)
      ) return false;
      if (review && review !== "unreviewed" && question.reviewedStatus !== review) return false;
      if (highYield && Number(question.priorityScore || 0) < 68) return false;
      if (!q) return true;
      return [
        question.id,
        question.category,
        question.status,
        question.reviewedStatus,
        question.sourceType,
        question.question,
        question.explanation,
        question.priorityLabel,
      ].join(" ").toLowerCase().includes(q);
    })
    .slice(0, 100);
}

async function loadQuestionDetail(databaseUrl, questionId) {
  const sourceQuestion = (await readQuestions()).find((question) => question.id === questionId);
  if (!sourceQuestion) {
    const error = new Error("Question not found.");
    error.statusCode = 404;
    throw error;
  }

  const formatted = formatQuestion(sourceQuestion);
  return withDb(databaseUrl, async (client) => {
    const [reviewMap, versions, reports] = await Promise.all([
      loadQuestionReviewOverlayWithClient(client, [questionId]),
      client.query(
        `
          select version_number,
                 question_text,
                 explanation,
                 reviewed_status,
                 safe_to_show,
                 changed_by_email,
                 change_note,
                 fields_changed,
                 reason,
                 created_at
          from question_versions
          where question_id = $1
          order by version_number desc
          limit 20
        `,
        [questionId]
      ),
      client.query(
        `
          select reason_category,
                 comment,
                 status,
                 app_version,
                 content_version,
                 created_at
          from question_problem_reports
          where question_id = $1
          order by created_at desc
          limit 20
        `,
        [questionId]
      ),
    ]);

    return {
      question: applyReviewOverlay(formatted, reviewMap.get(questionId)),
      versions: versions.rows,
      reports: reports.rows,
    };
  });
}

async function reviewQuestion(databaseUrl, admin, body) {
  const questionId = Number(body.questionId || body.question_id);
  const action = String(body.action || "").trim();
  const explanation = cleanOptionalText(body.explanation, 3000);
  const notes = cleanOptionalText(body.notes, 2000);

  if (!Number.isInteger(questionId)) {
    const error = new Error("Question ID is required.");
    error.statusCode = 400;
    throw error;
  }

  if (!["approve", "reject", "needs_official_cross_check", "publish", "archive"].includes(action)) {
    const error = new Error("Unsupported review action.");
    error.statusCode = 400;
    throw error;
  }

  if (action === "archive" && body.confirm !== true) {
    const error = new Error("Confirmation is required.");
    error.statusCode = 400;
    throw error;
  }

  const sourceQuestion = (await readQuestions()).find((question) => question.id === questionId);
  if (!sourceQuestion) {
    const error = new Error("Question not found.");
    error.statusCode = 404;
    throw error;
  }

  const reviewedStatus = action === "approve" || action === "publish"
    ? "approved"
    : action === "reject" || action === "archive"
      ? "rejected"
      : "needs_official_cross_check";
  const safeToShow = action === "archive"
    ? false
    : reviewedStatus === "approved" || (
    reviewedStatus === "needs_official_cross_check" &&
    sourceQuestion.source_type !== "ai_generated"
  );
  const publicationStatus = action === "archive" ? "archived" : "published";

  return withTransaction(databaseUrl, async (client) => {
    const beforeResult = await client.query(
      `
        select *
        from question_reviews
        where question_id = $1
        limit 1
      `,
      [questionId]
    );
    const beforeState = beforeResult.rows[0] || null;

    await client.query(
      `
        insert into question_sources (
          question_id,
          source_type,
          source_reference,
          archive_url,
          archive_timestamp,
          notes
        )
        values ($1, $2, $3, $4, $5, $6)
        on conflict (question_id, source_type, source_reference) do update
        set archive_url = excluded.archive_url,
            archive_timestamp = excluded.archive_timestamp,
            notes = excluded.notes
      `,
      [
        questionId,
        sourceQuestion.source_type || "recovered_archive",
        sourceQuestion.source_reference || sourceQuestion.source_url || null,
        sourceQuestion.archive_url || null,
        sourceQuestion.archive_timestamp || null,
        sourceQuestion.notes || null,
      ]
    );

    const latest = await client.query(
      `
        select coalesce(max(version_number), 0)::int as latest_version
        from question_versions
        where question_id = $1
      `,
      [questionId]
    );
    const versionNumber = latest.rows[0].latest_version + 1;

    await client.query(
      `
        insert into question_versions (
          question_id,
          version_number,
          question_text,
          explanation,
          options_json,
          correct_index,
          source_type,
          source_reference,
          reviewed_status,
          safe_to_show,
          changed_by,
          changed_by_email,
          change_note
        )
        values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12, $13)
      `,
      [
        questionId,
        versionNumber,
        sourceQuestion.question || "",
        explanation || sourceQuestion.explanation || "",
        JSON.stringify(sourceQuestion.options || []),
        sourceQuestion.correct_index ?? null,
        sourceQuestion.source_type || "recovered_archive",
        sourceQuestion.source_reference || sourceQuestion.source_url || null,
        reviewedStatus,
        safeToShow,
        admin.userId,
        admin.email,
        notes,
      ]
    );

    await client.query(
      `
        insert into question_reviews (
          question_id,
          reviewed_status,
          safe_to_show,
          reviewed_by,
          reviewed_by_email,
          reviewed_at,
          notes,
          publication_status,
          structural_status,
          factual_status,
          archived_at,
          updated_at
        )
        values ($1, $2, $3, $4, $5, now(), $6, $7, $8, $9, $10, now())
        on conflict (question_id) do update
        set reviewed_status = excluded.reviewed_status,
            safe_to_show = excluded.safe_to_show,
            reviewed_by = excluded.reviewed_by,
            reviewed_by_email = excluded.reviewed_by_email,
            reviewed_at = excluded.reviewed_at,
            notes = excluded.notes,
            publication_status = excluded.publication_status,
            structural_status = excluded.structural_status,
            factual_status = excluded.factual_status,
            archived_at = excluded.archived_at,
            updated_at = now()
      `,
      [
        questionId,
        reviewedStatus,
        safeToShow,
        admin.userId,
        admin.email,
        notes,
        publicationStatus,
        reviewedStatus === "approved" ? "reviewed" : "needs_review",
        reviewedStatus === "approved" ? "reviewed" : "needs_review",
        publicationStatus === "archived" ? new Date().toISOString() : null,
      ]
    );

    await writeAdminAuditLog(client, admin, {
      action: action === "archive" || action === "publish" ? `question.${action}` : `question.${reviewedStatus}`,
      targetType: "question",
      targetId: String(questionId),
      beforeState,
      afterState: {
        reviewedStatus,
        safeToShow,
        publicationStatus,
      },
      reason: notes || action,
      metadata: {
        versionNumber,
        reviewedStatus,
        safeToShow,
        publicationStatus,
        editedExplanation: Boolean(explanation && explanation !== sourceQuestion.explanation),
      },
    });

    const [reviewResult, versionResult] = await Promise.all([
      client.query(
        `
          select question_id,
                 reviewed_status,
                 safe_to_show,
                 reviewed_by_email,
                 reviewed_at,
                 notes,
                 publication_status,
                 canonical_question_id,
                 variant_group_id,
                 updated_at
          from question_reviews
          where question_id = $1
        `,
        [questionId]
      ),
      client.query(
        `
          select question_id,
                 version_number,
                 explanation,
                 change_note,
                 changed_by_email,
                 created_at
          from question_versions
          where question_id = $1
          order by version_number desc
          limit 1
        `,
        [questionId]
      ),
    ]);

    return applyReviewOverlay(formatQuestion(sourceQuestion), {
      review: reviewResult.rows[0],
      version: versionResult.rows[0],
    });
  });
}

async function loadQuestionReviewOverlay(databaseUrl, questionIds) {
  if (!questionIds.length) return new Map();

  return withDb(databaseUrl, (client) => loadQuestionReviewOverlayWithClient(client, questionIds));
}

async function loadQuestionReviewOverlayWithClient(client, questionIds) {
  if (!questionIds.length) return new Map();

    const [reviews, versions] = await Promise.all([
      client.query(
        `
          select question_id,
                 reviewed_status,
                 safe_to_show,
                 reviewed_by_email,
                 reviewed_at,
                 notes,
                 publication_status,
                 canonical_question_id,
                 variant_group_id,
                 updated_at
          from question_reviews
          where question_id = any($1::int[])
        `,
        [questionIds]
      ),
      client.query(
        `
          select distinct on (question_id)
                 question_id,
                 version_number,
                 explanation,
                 change_note,
                 changed_by_email,
                 created_at
          from question_versions
          where question_id = any($1::int[])
          order by question_id, version_number desc
        `,
        [questionIds]
      ),
    ]);

    const map = new Map();
    reviews.rows.forEach((row) => {
      map.set(row.question_id, { review: row });
    });
    versions.rows.forEach((row) => {
      const current = map.get(row.question_id) || {};
      current.version = row;
      map.set(row.question_id, current);
    });
    return map;
}

async function readQuestions() {
  const candidates = [
    path.join(root, "public", "data", "questions.enriched.json"),
    path.join(root, "data", "questions.enriched.json"),
    path.join(root, "public", "data", "questions.json"),
    path.join(root, "data", "questions.json"),
  ];

  for (const file of candidates) {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    }
  }

  return [];
}

function formatQuestion(question) {
  const images = Array.isArray(question.local_image_paths) ? question.local_image_paths : [];
  const sourceType = question.source_type || (question.source === "ai" ? "ai_generated" : "recovered_archive");
  const reviewedStatus = question.reviewed_status || (sourceType === "ai_generated" ? "unreviewed" : "needs_official_cross_check");
  const status = question.status || (sourceType === "ai_generated" && reviewedStatus !== "approved" ? "draft" : "published");
  return {
    id: question.id,
    category: question.category || "Uncategorised",
    status,
    source: question.source || sourceType,
    sourceType,
    sourceReference: question.source_reference || question.source_url || "",
    reviewedStatus,
    reviewedBy: question.reviewed_by || null,
    reviewedAt: question.reviewed_at || null,
    notes: question.notes || "",
    safeToShow: Boolean(question.safe_to_show ?? sourceType !== "ai_generated"),
    question: question.question || "",
    explanation: question.explanation || "",
    priorityLabel: question.priority_label || "",
    priorityScore: question.priority_score || null,
    hasImage: images.length > 0,
    optionsCount: Array.isArray(question.options) ? question.options.length : 0,
    generated: status === "draft" || sourceType === "ai_generated",
  };
}

function applyReviewOverlay(question, overlay) {
  if (!overlay) return question;
  const review = overlay.review;
  const version = overlay.version;
  return {
    ...question,
    reviewedStatus: review?.reviewed_status || question.reviewedStatus,
    reviewedBy: review?.reviewed_by_email || question.reviewedBy,
    reviewedAt: review?.reviewed_at || question.reviewedAt,
    notes: review?.notes || question.notes,
    safeToShow: review ? Boolean(review.safe_to_show) : question.safeToShow,
    status: review?.publication_status === "archived"
      ? "archived"
      : review?.publication_status === "published"
        ? "published"
        : question.status,
    canonicalQuestionId: review?.canonical_question_id || question.canonicalQuestionId || question.id,
    variantGroupId: review?.variant_group_id || question.variantGroupId || "",
    explanation: version?.explanation || question.explanation,
    latestVersion: version?.version_number || null,
    latestReviewUpdatedAt: review?.updated_at || version?.created_at || null,
  };
}

function cleanOptionalText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}
