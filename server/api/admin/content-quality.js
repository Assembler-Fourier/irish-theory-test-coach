import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  requireAdmin,
  sendAdminError,
  writeAdminAuditLog,
} from "../../../lib/admin.js";
import { readJsonBody } from "../../../lib/auth.js";
import { withDb, withTransaction } from "../../../lib/db.js";
import { analyzeContentQuality } from "../../../lib/content-quality.js";
import {
  getAuthServerEnv,
  safeErrorSummary,
  sendSafeConfigError,
} from "../../../lib/server-env.js";

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), "..", "..", "..");
const VALID_ACTIONS = new Set([
  "mark_legitimate_variant",
  "rewrite_stem",
  "change_category",
  "select_canonical",
  "merge_progress_history",
  "archive_redundant",
  "publish_decision",
]);

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
    const admin = await requireAdmin(req, env.databaseUrl);

    if (req.method === "POST") {
      const body = await readJsonBody(req);
      const decision = await saveQualityDecision(env.databaseUrl, admin, body);
      return res.status(200).json({ ok: true, decision });
    }

    const payload = await loadQualityDashboard(env.databaseUrl);
    return res.status(200).json({ ok: true, ...payload });
  } catch (error) {
    console.error("Admin content quality failed", safeErrorSummary(error));
    return sendAdminError(res, error);
  }
}

async function loadQualityDashboard(databaseUrl) {
  const questions = readQuestions();
  const analysis = analyzeContentQuality(questions);
  const decisions = await loadRecentDecisions(databaseUrl);
  const questionById = new Map(analysis.questions.map((question) => [question.id, question]));

  return {
    generatedAt: analysis.generatedAt,
    registryVersion: analysis.registryVersion,
    summary: analysis.summary,
    taxonomy: analysis.taxonomy,
    duplicateGroups: analysis.duplicateGroups.slice(0, 80).map((group) => formatGroup(group, questionById)),
    conflictingAnswerGroups: analysis.conflictingAnswerGroups.slice(0, 80).map((group) => formatGroup(group, questionById)),
    categoryMappings: analysis.categoryMappings,
    editorialBacklog: analysis.editorialBacklog.slice(0, 200),
    lintFindings: analysis.lintFindings.slice(0, 200),
    recentDecisions: decisions,
  };
}

async function saveQualityDecision(databaseUrl, admin, body) {
  const action = cleanText(body.action, 80);
  if (!VALID_ACTIONS.has(action)) {
    const error = new Error("Unsupported content-quality action.");
    error.statusCode = 400;
    throw error;
  }

  const questionIds = normalizeQuestionIds(body.questionIds || body.question_ids);
  const canonicalQuestionId = Number(body.canonicalQuestionId || body.canonical_question_id || questionIds[0]);
  const groupId = cleanText(body.groupId || body.group_id || `manual:${questionIds.join("-")}`, 180);
  const groupType = cleanText(body.groupType || body.group_type || "duplicate", 80);
  const reason = cleanText(body.reason, 500);
  const notes = cleanText(body.notes, 1500);
  const questionId = Number(body.questionId || body.question_id || canonicalQuestionId);
  const newQuestionText = cleanText(body.newQuestionText || body.new_question_text, 1000);
  const newCategory = cleanText(body.newCategory || body.new_category, 180);

  if (!questionIds.length || !Number.isInteger(canonicalQuestionId)) {
    const error = new Error("Question IDs and canonical question ID are required.");
    error.statusCode = 400;
    throw error;
  }

  if (action === "rewrite_stem" && (!Number.isInteger(questionId) || !newQuestionText)) {
    const error = new Error("A question ID and replacement stem are required.");
    error.statusCode = 400;
    throw error;
  }

  if (action === "change_category" && (!Number.isInteger(questionId) || !newCategory)) {
    const error = new Error("A question ID and category are required.");
    error.statusCode = 400;
    throw error;
  }

  const sourceQuestion = findSourceQuestion(questionId);
  const targetIds = action === "archive_redundant"
    ? questionIds.filter((id) => id !== canonicalQuestionId)
    : questionIds;
  const oldVersion = sourceQuestion ? sourceVersion(sourceQuestion) : null;
  const newVersion = buildNewVersion(oldVersion, { action, newQuestionText, newCategory });
  const fieldsChanged = changedFields(oldVersion, newVersion);

  return withTransaction(databaseUrl, async (client) => {
    if (action === "merge_progress_history") {
      await client.query(
        `
          update attempts
          set canonical_question_id = $1
          where question_id = any($2::int[])
        `,
        [canonicalQuestionId, questionIds]
      );
    }

    if (["rewrite_stem", "change_category"].includes(action) && oldVersion && fieldsChanged.length) {
      await insertQuestionVersion(client, admin, {
        questionId,
        oldVersion,
        newVersion,
        fieldsChanged,
        reason: reason || action,
      });
    }

    for (const targetQuestionId of targetIds) {
      await upsertReviewState(client, admin, {
        action,
        questionId: targetQuestionId,
        canonicalQuestionId,
        groupId,
        reason,
        notes,
      });
    }

    const decisionResult = await client.query(
      `
        insert into question_quality_decisions (
          group_id,
          group_type,
          question_ids,
          action,
          canonical_question_id,
          old_version_json,
          new_version_json,
          fields_changed,
          reason,
          notes,
          review_status,
          created_by,
          created_by_email
        )
        values ($1, $2, $3::int[], $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10, $11, $12, $13)
        returning id, group_id, group_type, question_ids, action, canonical_question_id,
                  fields_changed, reason, notes, review_status, created_by_email, created_at
      `,
      [
        groupId,
        groupType,
        questionIds,
        action,
        canonicalQuestionId,
        JSON.stringify(oldVersion),
        JSON.stringify(newVersion),
        JSON.stringify(fieldsChanged),
        reason || null,
        notes || null,
        reviewStatusForAction(action),
        admin.userId,
        admin.email,
      ]
    );

    await writeAdminAuditLog(client, admin, {
      action: `content_quality.${action}`,
      targetType: "question_quality",
      targetId: groupId,
      metadata: {
        questionIds,
        canonicalQuestionId,
        groupType,
        fieldsChanged,
      },
    });

    return formatDecision(decisionResult.rows[0]);
  });
}

async function loadRecentDecisions(databaseUrl) {
  return withDb(databaseUrl, async (client) => {
    const exists = await client.query("select to_regclass('public.question_quality_decisions') as table_name");
    if (!exists.rows[0]?.table_name) return [];

    const result = await client.query(
      `
        select id, group_id, group_type, question_ids, action, canonical_question_id,
               fields_changed, reason, notes, review_status, created_by_email, created_at
        from question_quality_decisions
        order by created_at desc
        limit 30
      `
    );
    return result.rows.map(formatDecision);
  });
}

async function insertQuestionVersion(client, admin, { questionId, oldVersion, newVersion, fieldsChanged, reason }) {
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
        change_note,
        old_version_json,
        new_version_json,
        fields_changed,
        reason
      )
      values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15::jsonb, $16::jsonb, $17)
    `,
    [
      questionId,
      versionNumber,
      newVersion.question,
      newVersion.explanation,
      JSON.stringify(newVersion.options || []),
      newVersion.correctIndex,
      newVersion.sourceType,
      newVersion.sourceReference,
      "needs_official_cross_check",
      true,
      admin.userId,
      admin.email,
      reason,
      JSON.stringify(oldVersion),
      JSON.stringify(newVersion),
      JSON.stringify(fieldsChanged),
      reason,
    ]
  );
}

async function upsertReviewState(client, admin, { action, questionId, canonicalQuestionId, groupId, reason, notes }) {
  const state = stateForAction(action);
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
        ownership_status,
        structural_status,
        factual_status,
        publication_status,
        canonical_question_id,
        variant_group_id,
        duplicate_reason,
        archived_at,
        updated_at
      )
      values ($1, $2, $3, $4, $5, now(), $6, $7, $8, $9, $10, $11, $12, $13, $14, now())
      on conflict (question_id) do update
      set reviewed_by = excluded.reviewed_by,
          reviewed_by_email = excluded.reviewed_by_email,
          reviewed_at = excluded.reviewed_at,
          notes = excluded.notes,
          ownership_status = excluded.ownership_status,
          structural_status = excluded.structural_status,
          factual_status = excluded.factual_status,
          publication_status = excluded.publication_status,
          canonical_question_id = excluded.canonical_question_id,
          variant_group_id = excluded.variant_group_id,
          duplicate_reason = excluded.duplicate_reason,
          archived_at = excluded.archived_at,
          updated_at = now()
    `,
    [
      questionId,
      state.reviewedStatus,
      state.safeToShow,
      admin.userId,
      admin.email,
      notes || reason || null,
      "owned_confirmed",
      state.structuralStatus,
      state.factualStatus,
      state.publicationStatus,
      canonicalQuestionId,
      groupId,
      reason || action,
      state.publicationStatus === "archived" ? new Date().toISOString() : null,
    ]
  );
}

function formatGroup(group, questionById) {
  return {
    ...group,
    variants: group.questionIds.map((questionId) => {
      const question = questionById.get(questionId);
      return {
        questionId,
        category: question?.category || "Uncategorised",
        originalCategory: question?.originalCategory || "",
        question: question?.question || "",
        explanation: question?.explanation || "",
        correctIndex: question?.correctIndex ?? null,
        correctAnswer: question?.correctAnswer || "",
        options: (question?.options || []).map((option) => ({
          index: option.index,
          text: option.text,
          isCorrect: option.isCorrect,
        })),
        imageKeys: question?.imageKeys || [],
      };
    }),
  };
}

function stateForAction(action) {
  if (action === "archive_redundant") {
    return {
      reviewedStatus: "rejected",
      safeToShow: false,
      structuralStatus: "reviewed",
      factualStatus: "needs_review",
      publicationStatus: "archived",
    };
  }
  if (action === "publish_decision") {
    return {
      reviewedStatus: "approved",
      safeToShow: true,
      structuralStatus: "reviewed",
      factualStatus: "reviewed",
      publicationStatus: "published",
    };
  }
  return {
    reviewedStatus: "needs_official_cross_check",
    safeToShow: true,
    structuralStatus: "reviewed",
    factualStatus: "needs_review",
    publicationStatus: "published",
  };
}

function reviewStatusForAction(action) {
  if (action === "archive_redundant") return "archived";
  if (action === "publish_decision") return "published";
  if (action === "mark_legitimate_variant") return "legitimate_variant";
  return "reviewed";
}

function buildNewVersion(oldVersion, { action, newQuestionText, newCategory }) {
  if (!oldVersion) return null;
  if (action === "rewrite_stem") return { ...oldVersion, question: newQuestionText };
  if (action === "change_category") return { ...oldVersion, category: newCategory };
  return oldVersion;
}

function changedFields(oldVersion, newVersion) {
  if (!oldVersion || !newVersion) return [];
  return ["question", "category", "explanation", "options", "correctIndex"]
    .filter((field) => JSON.stringify(oldVersion[field]) !== JSON.stringify(newVersion[field]));
}

function sourceVersion(question) {
  return {
    question: question.question || "",
    category: question.category || "Uncategorised",
    explanation: question.explanation || "",
    options: Array.isArray(question.options) ? question.options : [],
    correctIndex: Number.isInteger(question.correct_index) ? question.correct_index : null,
    sourceType: question.source_type || "recovered_archive",
    sourceReference: question.source_reference || question.source_url || "",
  };
}

function findSourceQuestion(questionId) {
  return readQuestions().find((question) => question.id === questionId) || null;
}

function readQuestions() {
  const candidates = [
    path.join(root, "data", "questions.enriched.json"),
    path.join(root, "data", "questions.json"),
  ];

  for (const file of candidates) {
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      return Array.isArray(parsed) ? parsed : parsed.questions || [];
    }
  }

  return [];
}

function normalizeQuestionIds(value) {
  const items = Array.isArray(value) ? value : [value];
  return Array.from(new Set(items.map(Number).filter(Number.isInteger))).sort((a, b) => a - b);
}

function formatDecision(row) {
  return {
    id: row.id,
    groupId: row.group_id,
    groupType: row.group_type,
    questionIds: row.question_ids || [],
    action: row.action,
    canonicalQuestionId: row.canonical_question_id,
    fieldsChanged: row.fields_changed || [],
    reason: row.reason || "",
    notes: row.notes || "",
    reviewStatus: row.review_status || "",
    createdByEmail: row.created_by_email || "",
    createdAt: row.created_at,
  };
}

function cleanText(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}
