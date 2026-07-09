import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  requireAdmin,
  sendAdminError,
  writeAdminAuditLog,
} from "../../lib/admin.js";
import { readJsonBody } from "../../lib/auth.js";
import { withDb, withTransaction } from "../../lib/db.js";
import {
  getAuthServerEnv,
  safeErrorSummary,
  sendSafeConfigError,
} from "../../lib/server-env.js";

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), "..", "..");

const AI_TIMEOUT_MS = 20000;
const DUPLICATE_THRESHOLD = 0.72;
const MAX_DRAFT_COUNT = 10;
const MAX_SOURCE_LENGTH = 7000;
const MAX_SOURCE_CHUNK_LENGTH = 1800;
const ALLOWED_DIFFICULTIES = new Set(["easy", "medium", "hard", "mixed"]);
const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "if",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "the",
  "their",
  "they",
  "to",
  "when",
  "where",
  "while",
  "with",
  "you",
  "your",
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

    if (req.method === "GET") {
      const pipeline = await loadPipeline(env.databaseUrl, req.query || {});
      return res.status(200).json({ ok: true, ...pipeline });
    }

    const body = await readJsonBody(req);
    const action = cleanText(body.action, 80);

    if (action === "save_source_note") {
      const sourceDocument = await saveSourceNote(env.databaseUrl, admin, body);
      return res.status(200).json({ ok: true, sourceDocument });
    }

    if (action === "generate") {
      const result = await generateDraftQuestions(env.databaseUrl, admin, body);
      return res.status(200).json({ ok: true, ...result });
    }

    if (action === "review_generated_question") {
      const generatedQuestion = await reviewGeneratedQuestion(env.databaseUrl, admin, body);
      return res.status(200).json({ ok: true, generatedQuestion });
    }

    const error = new Error("Unsupported generation action.");
    error.statusCode = 400;
    throw error;
  } catch (error) {
    console.error("Admin question generation failed", safeErrorSummary(error));
    return sendAdminError(res, error);
  }
}

async function loadPipeline(databaseUrl, query) {
  const status = cleanText(query.status, 40);
  return withDb(databaseUrl, async (client) => {
    const [sources, generated] = await Promise.all([
      client.query(
        `
          select id,
                 title,
                 source_type,
                 topic,
                 category,
                 status,
                 created_by_email,
                 approved_by_email,
                 approved_at,
                 created_at,
                 updated_at
          from source_documents
          order by created_at desc
          limit 40
        `
      ),
      client.query(
        `
          select id,
                 source_ids,
                 category,
                 difficulty,
                 high_yield_tags,
                 question_text,
                 options_json,
                 correct_index,
                 explanation,
                 status,
                 duplicate_score,
                 duplicate_question_id,
                 duplicate_question_text,
                 provider,
                 model,
                 rejection_reason,
                 review_notes,
                 reviewed_by_email,
                 reviewed_at,
                 created_by_email,
                 created_at,
                 updated_at
          from generated_questions
          where ($1 = '' or status = $1)
          order by created_at desc
          limit 80
        `,
        [status]
      ),
    ]);

    return {
      sourceDocuments: sources.rows.map(formatSourceDocument),
      generatedQuestions: generated.rows.map(formatGeneratedQuestion),
    };
  });
}

async function saveSourceNote(databaseUrl, admin, body) {
  const title = cleanText(body.title, 180) || "Manual source note";
  const topic = cleanText(body.topic, 160);
  const category = cleanText(body.category, 160) || "Uncategorised";
  const note = cleanText(body.body || body.note || body.sourceText, MAX_SOURCE_LENGTH);

  if (note.length < 80) {
    const error = new Error("Source note is too short.");
    error.statusCode = 400;
    throw error;
  }

  const chunks = chunkSourceText(note);
  return withTransaction(databaseUrl, async (client) => {
    const sourceResult = await client.query(
      `
        insert into source_documents (
          title,
          source_type,
          topic,
          category,
          body,
          status,
          created_by,
          created_by_email,
          approved_by,
          approved_by_email,
          approved_at
        )
        values ($1, 'manual_note', $2, $3, $4, 'approved', $5, $6, $5, $6, now())
        returning id,
                  title,
                  source_type,
                  topic,
                  category,
                  status,
                  created_by_email,
                  approved_by_email,
                  approved_at,
                  created_at,
                  updated_at
      `,
      [title, topic, category, note, admin.userId, admin.email]
    );

    const source = sourceResult.rows[0];
    for (const [index, chunk] of chunks.entries()) {
      await client.query(
        `
          insert into source_chunks (
            source_document_id,
            chunk_index,
            content,
            token_estimate,
            metadata
          )
          values ($1, $2, $3, $4, $5::jsonb)
        `,
        [
          source.id,
          index,
          chunk,
          estimateTokens(chunk),
          JSON.stringify({ source: "manual_note" }),
        ]
      );
    }

    await writeAdminAuditLog(client, admin, {
      action: "source_document.create",
      targetType: "source_document",
      targetId: source.id,
      metadata: {
        category,
        topic,
        chunkCount: chunks.length,
      },
    });

    return formatSourceDocument(source);
  });
}

async function generateDraftQuestions(databaseUrl, admin, body) {
  const sourceDocumentId = cleanText(body.sourceDocumentId || body.source_document_id, 80);
  const requestedCount = clampInteger(body.count, 1, MAX_DRAFT_COUNT, 5);
  const requestedDifficulty = normalizeDifficulty(body.difficulty || "medium");

  if (!sourceDocumentId) {
    const error = new Error("Source document is required.");
    error.statusCode = 400;
    throw error;
  }

  const [sourceBundle, existingQuestions] = await Promise.all([
    loadApprovedSourceBundle(databaseUrl, sourceDocumentId),
    loadExistingQuestionCorpus(databaseUrl),
  ]);
  const providerEnv = getQuestionProviderEnv();
  const sourceContext = buildSourceContext(sourceBundle);
  const category = sourceBundle.document.category || cleanText(body.category, 160) || "Uncategorised";

  let candidates = [];
  let provider = "local-fallback";
  let model = "local-template";

  if (providerEnv.configured) {
    try {
      candidates = await generateWithAi({
        sourceContext,
        category,
        topic: sourceBundle.document.topic || category,
        count: requestedCount,
        difficulty: requestedDifficulty,
        env: providerEnv,
      });
      provider = providerEnv.provider;
      model = providerEnv.model;
    } catch (error) {
      console.error("AI draft generation provider failed", safeErrorSummary(error));
    }
  }

  if (!candidates.length) {
    candidates = buildLocalDraftQuestions({
      sourceText: sourceContext,
      category,
      topic: sourceBundle.document.topic || category,
      count: requestedCount,
      difficulty: requestedDifficulty,
    });
  }

  const normalized = candidates
    .map((candidate) => normalizeGeneratedCandidate(candidate, { category, difficulty: requestedDifficulty }))
    .filter(Boolean)
    .slice(0, requestedCount);

  const accepted = [];
  const rejectedDuplicates = [];
  const rollingCorpus = existingQuestions.slice();

  for (const candidate of normalized) {
    const nearest = findNearestExistingQuestion(candidate.questionText, rollingCorpus);
    if (nearest.score >= DUPLICATE_THRESHOLD || containsBlockedOfficialClaim(candidate)) {
      rejectedDuplicates.push({
        questionText: candidate.questionText,
        duplicateScore: nearest.score,
        duplicateQuestionId: nearest.questionId,
        duplicateQuestionText: nearest.questionText,
        reason: nearest.score >= DUPLICATE_THRESHOLD ? "near_duplicate" : "official_claim_wording",
      });
      continue;
    }

    accepted.push({
      ...candidate,
      duplicateScore: nearest.score,
      duplicateQuestionId: nearest.questionId,
      duplicateQuestionText: nearest.questionText,
    });
    rollingCorpus.push({ questionId: null, questionText: candidate.questionText });
  }

  const savedDrafts = await insertGeneratedDrafts(databaseUrl, admin, {
    sourceBundle,
    accepted,
    provider,
    model,
    promptHash: hashValue(sourceContext),
  });

  return {
    generatedQuestions: savedDrafts,
    rejectedDuplicates,
    provider,
    model,
  };
}

async function reviewGeneratedQuestion(databaseUrl, admin, body) {
  const id = cleanText(body.generatedQuestionId || body.generated_question_id, 80);
  const action = cleanText(body.reviewAction || body.actionValue || body.status, 40);
  const notes = cleanText(body.notes || body.reviewNotes, 2000);

  if (!id || !["approve", "reject"].includes(action)) {
    const error = new Error("Unsupported generated question review.");
    error.statusCode = 400;
    throw error;
  }

  const status = action === "approve" ? "approved" : "rejected";
  return withTransaction(databaseUrl, async (client) => {
    const result = await client.query(
      `
        update generated_questions
        set status = $1,
            review_notes = $2,
            rejection_reason = case when $1 = 'rejected' then coalesce(nullif($2, ''), 'admin_rejected') else null end,
            reviewed_by = $3,
            reviewed_by_email = $4,
            reviewed_at = now(),
            updated_at = now()
        where id = $5
        returning id,
                  source_ids,
                  category,
                  difficulty,
                  high_yield_tags,
                  question_text,
                  options_json,
                  correct_index,
                  explanation,
                  status,
                  duplicate_score,
                  duplicate_question_id,
                  duplicate_question_text,
                  provider,
                  model,
                  rejection_reason,
                  review_notes,
                  reviewed_by_email,
                  reviewed_at,
                  created_by_email,
                  created_at,
                  updated_at
      `,
      [status, notes, admin.userId, admin.email, id]
    );

    const row = result.rows[0];
    if (!row) {
      const error = new Error("Generated question not found.");
      error.statusCode = 404;
      throw error;
    }

    await writeAdminAuditLog(client, admin, {
      action: `generated_question.${status}`,
      targetType: "generated_question",
      targetId: row.id,
      metadata: {
        category: row.category,
        difficulty: row.difficulty,
        duplicateScore: Number(row.duplicate_score || 0),
      },
    });

    return formatGeneratedQuestion(row);
  });
}

async function loadApprovedSourceBundle(databaseUrl, sourceDocumentId) {
  return withDb(databaseUrl, async (client) => {
    const [documentResult, chunksResult] = await Promise.all([
      client.query(
        `
          select id,
                 title,
                 topic,
                 category,
                 body,
                 status
          from source_documents
          where id = $1
          limit 1
        `,
        [sourceDocumentId]
      ),
      client.query(
        `
          select id,
                 chunk_index,
                 content
          from source_chunks
          where source_document_id = $1
          order by chunk_index
        `,
        [sourceDocumentId]
      ),
    ]);

    const document = documentResult.rows[0];
    if (!document || document.status !== "approved") {
      const error = new Error("Approved source note not found.");
      error.statusCode = 404;
      throw error;
    }

    return {
      document,
      chunks: chunksResult.rows,
    };
  });
}

async function insertGeneratedDrafts(databaseUrl, admin, record) {
  if (!record.accepted.length) return [];

  return withTransaction(databaseUrl, async (client) => {
    const saved = [];
    const sourceIds = [record.sourceBundle.document.id];
    const sourceChunkIds = record.sourceBundle.chunks.map((chunk) => chunk.id);

    for (const draft of record.accepted) {
      const result = await client.query(
        `
          insert into generated_questions (
            source_ids,
            source_chunk_ids,
            category,
            difficulty,
            high_yield_tags,
            question_text,
            question_hash,
            options_json,
            correct_index,
            explanation,
            status,
            duplicate_score,
            duplicate_question_id,
            duplicate_question_text,
            provider,
            model,
            generation_prompt_hash,
            created_by,
            created_by_email
          )
          values ($1::uuid[], $2::uuid[], $3, $4, $5::jsonb, $6, $7, $8::jsonb, $9, $10, 'draft', $11, $12, $13, $14, $15, $16, $17, $18)
          returning id,
                    source_ids,
                    category,
                    difficulty,
                    high_yield_tags,
                    question_text,
                    options_json,
                    correct_index,
                    explanation,
                    status,
                    duplicate_score,
                    duplicate_question_id,
                    duplicate_question_text,
                    provider,
                    model,
                    rejection_reason,
                    review_notes,
                    reviewed_by_email,
                    reviewed_at,
                    created_by_email,
                    created_at,
                    updated_at
        `,
        [
          sourceIds,
          sourceChunkIds,
          draft.category,
          draft.difficulty,
          JSON.stringify(draft.highYieldTags),
          draft.questionText,
          hashValue(draft.questionText),
          JSON.stringify(draft.options),
          draft.correctIndex,
          draft.explanation,
          Number(draft.duplicateScore || 0),
          draft.duplicateQuestionId,
          draft.duplicateQuestionText,
          record.provider,
          record.model,
          record.promptHash,
          admin.userId,
          admin.email,
        ]
      );
      saved.push(formatGeneratedQuestion(result.rows[0]));
    }

    await writeAdminAuditLog(client, admin, {
      action: "generated_question.create_drafts",
      targetType: "source_document",
      targetId: record.sourceBundle.document.id,
      metadata: {
        draftCount: saved.length,
        provider: record.provider,
        model: record.model,
      },
    });

    return saved;
  });
}

async function generateWithAi({ sourceContext, category, topic, count, difficulty, env }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const response = await fetch(env.apiUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${env.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.model,
        temperature: 0.35,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "You generate original Irish Category B driving theory practice-question drafts for an independent practice app.",
              "Use the supplied source note only as study context.",
              "Do not copy or closely paraphrase competitor question text.",
              "Do not use the phrase official question, do not claim official exam prediction, and do not claim RSA or Prometric affiliation.",
              "Every question must be original, concise, and exam-style.",
              "Return JSON only with a questions array.",
            ].join(" "),
          },
          {
            role: "user",
            content: JSON.stringify({
              count,
              category,
              topic,
              difficulty,
              sourceNote: sourceContext,
              requiredShape: {
                category: "string",
                difficulty: "easy|medium|hard",
                high_yield_tags: ["string"],
                question: "string",
                options: ["string", "string", "string", "string"],
                correct_index: 0,
                explanation: "string",
              },
            }),
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error("AI provider rejected draft generation request.");
    }

    const payload = await response.json();
    const parsed = parseJsonObject(payload?.choices?.[0]?.message?.content);
    return Array.isArray(parsed?.questions) ? parsed.questions : [];
  } finally {
    clearTimeout(timeout);
  }
}

export function buildLocalDraftQuestions({ sourceText, category, topic, count = 5, difficulty = "medium" }) {
  const tags = buildHighYieldTags(sourceText, category, topic);
  const topicLabel = cleanText(topic || category || "safe driving", 80) || "safe driving";
  const categoryLabel = cleanText(category || "Uncategorised", 120) || "Uncategorised";
  const coreIdea = summariseSourceIdea(sourceText, topicLabel);
  const safeAction = inferSafeAction(sourceText, topicLabel);
  const drafts = [
    {
      question: `When dealing with ${topicLabel.toLowerCase()}, what should a learner driver do first?`,
      options: [
        safeAction,
        "Continue at the same speed and wait for other road users to react.",
        "Make the manoeuvre quickly so traffic is not delayed.",
        "Rely only on road markings and ignore changing conditions.",
      ],
      correct_index: 0,
      explanation: `The source note points to ${coreIdea}. The safest answer is to slow the decision down, observe, and act only when it is safe.`,
    },
    {
      question: `Why is ${topicLabel.toLowerCase()} important for safe driving?`,
      options: [
        "It helps the driver spot risk early and leave enough time to respond.",
        "It allows the driver to make progress regardless of the conditions.",
        "It removes the need to check mirrors before changing position.",
        "It means other road users must give way automatically.",
      ],
      correct_index: 0,
      explanation: `Good observation and early planning reduce last-second decisions. The note should be treated as a safety principle, not a speed advantage.`,
    },
    {
      question: `A driver is unsure how ${topicLabel.toLowerCase()} affects the road ahead. What is the safest response?`,
      options: [
        "Ease off, increase observation, and be prepared to stop if needed.",
        "Keep close to the vehicle in front to follow its path.",
        "Sound the horn continuously until the hazard is gone.",
        "Accelerate past the area before the situation changes.",
      ],
      correct_index: 0,
      explanation: `Uncertainty is a warning sign. A safer response gives the driver more time, space, and control.`,
    },
    {
      question: `Which habit best supports safe decisions about ${topicLabel.toLowerCase()}?`,
      options: [
        "Scanning ahead, checking mirrors, and adjusting speed early.",
        "Waiting until the last moment before choosing a position.",
        "Copying the behaviour of the fastest nearby driver.",
        "Assuming that the route will stay clear.",
      ],
      correct_index: 0,
      explanation: `The useful habit is early information gathering. Mirrors, scanning, and speed control work together before the hazard becomes urgent.`,
    },
    {
      question: `What mistake should a learner avoid when applying guidance on ${topicLabel.toLowerCase()}?`,
      options: [
        "Treating the rule as automatic without checking the actual road situation.",
        "Leaving extra space when visibility or road conditions are poor.",
        "Preparing early for hazards that may develop.",
        "Choosing a speed that allows time to react.",
      ],
      correct_index: 0,
      explanation: `Rules still need judgement. The driver must match the guidance to the live road conditions and other road users.`,
    },
    {
      question: `In the context of ${topicLabel.toLowerCase()}, what usually gives a driver the best safety margin?`,
      options: [
        "More time and space to observe, decide, and act.",
        "A quicker decision made without checking behind.",
        "Driving closer to other vehicles to prevent gaps.",
        "Assuming that other road users have seen the vehicle.",
      ],
      correct_index: 0,
      explanation: `A safety margin comes from time, space, and observation. That gives the driver room to correct a developing risk.`,
    },
  ];

  return drafts.slice(0, clampInteger(count, 1, MAX_DRAFT_COUNT, 5)).map((draft, index) => ({
    category: categoryLabel,
    difficulty: normalizeDifficulty(difficulty === "mixed" ? difficultyByIndex(index) : difficulty),
    high_yield_tags: tags,
    ...draft,
  }));
}

export function findNearestExistingQuestion(questionText, corpus) {
  let nearest = {
    score: 0,
    questionId: null,
    questionText: "",
  };

  for (const item of corpus) {
    const score = textSimilarity(questionText, item.questionText);
    if (score > nearest.score) {
      nearest = {
        score,
        questionId: item.questionId,
        questionText: item.questionText,
      };
    }
  }

  return nearest;
}

function normalizeGeneratedCandidate(candidate, defaults) {
  const category = cleanText(candidate.category || defaults.category, 160) || "Uncategorised";
  const difficulty = normalizeDifficulty(candidate.difficulty || defaults.difficulty);
  const highYieldTags = (candidate.high_yield_tags || candidate.highYieldTags || [])
    .map((tag) => cleanText(tag, 40))
    .filter(Boolean)
    .slice(0, 6);
  const questionText = cleanText(candidate.question || candidate.question_text || candidate.questionText, 700);
  const options = normalizeOptions(candidate.options);
  const providedCorrectIndex = Number(candidate.correct_index ?? candidate.correctIndex);
  const inferredCorrectIndex = options.findIndex((option) => option.is_correct);
  const correctIndex = Number.isInteger(providedCorrectIndex) ? providedCorrectIndex : inferredCorrectIndex;
  const explanation = cleanText(candidate.explanation, 1200);

  if (
    !questionText ||
    options.length < 3 ||
    !Number.isInteger(correctIndex) ||
    correctIndex < 0 ||
    correctIndex >= options.length ||
    !explanation
  ) {
    return null;
  }

  return {
    category,
    difficulty,
    highYieldTags: highYieldTags.length ? highYieldTags : buildHighYieldTags(questionText, category, category),
    questionText,
    options: options.map((option, index) => ({
      ...option,
      is_correct: index === correctIndex,
    })),
    correctIndex,
    explanation,
  };
}

function normalizeOptions(value) {
  const options = Array.isArray(value) ? value : [];
  return options
    .map((option, index) => {
      const text = typeof option === "string" ? option : option?.text || option?.label || option?.answer;
      return {
        index,
        text: cleanText(text, 260),
        is_correct: Boolean(option?.is_correct || option?.isCorrect),
      };
    })
    .filter((option) => option.text)
    .slice(0, 5);
}

async function loadExistingQuestionCorpus(databaseUrl) {
  const [publicQuestions, generatedQuestions] = await Promise.all([
    readQuestionsFromDisk(),
    withDb(databaseUrl, (client) =>
      client.query(
        `
          select id::text as id,
                 question_text
          from generated_questions
          where status in ('draft', 'approved')
          order by created_at desc
          limit 500
        `
      )
    ).catch(() => ({ rows: [] })),
  ]);

  return [
    ...publicQuestions.map((question) => ({
      questionId: Number.isInteger(question.id) ? question.id : null,
      questionText: cleanText(question.question, 700),
    })),
    ...generatedQuestions.rows.map((row) => ({
      questionId: row.id,
      questionText: cleanText(row.question_text, 700),
    })),
  ].filter((item) => item.questionText);
}

async function readQuestionsFromDisk() {
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

function getQuestionProviderEnv() {
  const apiKey = process.env.AI_QUESTION_API_KEY || process.env.AI_EXPLANATION_API_KEY || process.env.OPENAI_API_KEY || "";
  return {
    configured: Boolean(apiKey),
    provider: "openai-compatible",
    apiKey,
    apiUrl: process.env.AI_QUESTION_API_URL || process.env.AI_EXPLANATION_API_URL || "https://api.openai.com/v1/chat/completions",
    model: process.env.AI_QUESTION_MODEL || process.env.AI_EXPLANATION_MODEL || "gpt-4o-mini",
  };
}

function parseJsonObject(content) {
  if (!content || typeof content !== "string") {
    throw new Error("AI provider response was empty.");
  }

  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("AI provider response was not JSON.");
    return JSON.parse(match[0]);
  }
}

function containsBlockedOfficialClaim(candidate) {
  const haystack = [
    candidate.questionText,
    candidate.explanation,
    candidate.options.map((option) => option.text).join(" "),
  ].join(" ").toLowerCase();
  return /\bofficial\s+(rsa|prometric|exam|question)\b/.test(haystack) || /\brsa\s+affiliated\b/.test(haystack);
}

function buildSourceContext(sourceBundle) {
  const chunks = sourceBundle.chunks.map((chunk) => chunk.content).filter(Boolean);
  const text = chunks.length ? chunks.join("\n\n") : sourceBundle.document.body || "";
  return cleanText(text, MAX_SOURCE_LENGTH);
}

function chunkSourceText(text) {
  const chunks = [];
  const paragraphs = String(text || "").split(/\n{2,}/).map((item) => cleanText(item, MAX_SOURCE_CHUNK_LENGTH)).filter(Boolean);
  let current = "";

  for (const paragraph of paragraphs) {
    if ((current + "\n\n" + paragraph).trim().length > MAX_SOURCE_CHUNK_LENGTH && current) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = [current, paragraph].filter(Boolean).join("\n\n");
    }
  }

  if (current) chunks.push(current);
  if (!chunks.length) chunks.push(cleanText(text, MAX_SOURCE_CHUNK_LENGTH));
  return chunks.slice(0, 8);
}

function buildHighYieldTags(sourceText, category, topic) {
  const base = [category, topic];
  const keywords = tokens(sourceText)
    .filter((word) => word.length > 4)
    .slice(0, 12);
  return Array.from(new Set([...base, ...keywords]))
    .map((tag) => cleanText(tag, 40))
    .filter(Boolean)
    .slice(0, 5);
}

function summariseSourceIdea(sourceText, fallback) {
  const sentence = String(sourceText || "")
    .split(/[.!?]/)
    .map((item) => cleanText(item, 180))
    .find((item) => item.length > 30);
  return sentence || `safe decisions around ${fallback.toLowerCase()}`;
}

function inferSafeAction(sourceText, topic) {
  const lower = String(sourceText || "").toLowerCase();
  if (lower.includes("speed") || lower.includes("slow")) {
    return "Adjust speed early and keep enough space to react safely.";
  }
  if (lower.includes("mirror") || lower.includes("blind")) {
    return "Check mirrors and blind spots before changing speed or position.";
  }
  if (lower.includes("wet") || lower.includes("weather")) {
    return "Increase the safety margin and avoid sudden braking or steering.";
  }
  if (lower.includes("pedestrian") || lower.includes("cyclist") || lower.includes("motorcyclist")) {
    return "Watch carefully for vulnerable road users and allow extra room.";
  }
  return `Observe carefully and apply the ${topic.toLowerCase()} guidance only when it is safe.`;
}

function textSimilarity(left, right) {
  const leftText = normalizeComparableText(left);
  const rightText = normalizeComparableText(right);
  if (!leftText || !rightText) return 0;
  if (leftText === rightText) return 1;
  if (leftText.includes(rightText) || rightText.includes(leftText)) return 0.9;

  const leftTokens = new Set(tokens(leftText));
  const rightTokens = new Set(tokens(rightText));
  if (!leftTokens.size || !rightTokens.size) return 0;

  let intersection = 0;
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) intersection += 1;
  });

  return (2 * intersection) / (leftTokens.size + rightTokens.size);
}

function tokens(value) {
  return normalizeComparableText(value)
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function normalizeComparableText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatSourceDocument(row) {
  return {
    id: row.id,
    title: row.title,
    sourceType: row.source_type,
    topic: row.topic || "",
    category: row.category || "Uncategorised",
    status: row.status,
    createdByEmail: row.created_by_email || "",
    approvedByEmail: row.approved_by_email || "",
    approvedAt: row.approved_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function formatGeneratedQuestion(row) {
  return {
    id: row.id,
    sourceIds: row.source_ids || [],
    category: row.category,
    difficulty: row.difficulty,
    highYieldTags: Array.isArray(row.high_yield_tags) ? row.high_yield_tags : [],
    questionText: row.question_text,
    options: row.options_json || [],
    correctIndex: row.correct_index,
    explanation: row.explanation,
    status: row.status,
    duplicateScore: Number(row.duplicate_score || 0),
    duplicateQuestionId: row.duplicate_question_id || null,
    duplicateQuestionText: row.duplicate_question_text || "",
    provider: row.provider,
    model: row.model || "",
    rejectionReason: row.rejection_reason || "",
    reviewNotes: row.review_notes || "",
    reviewedByEmail: row.reviewed_by_email || "",
    reviewedAt: row.reviewed_at || null,
    createdByEmail: row.created_by_email || "",
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function normalizeDifficulty(value) {
  const difficulty = cleanText(value, 20).toLowerCase();
  return ALLOWED_DIFFICULTIES.has(difficulty) ? difficulty : "medium";
}

function difficultyByIndex(index) {
  return ["easy", "medium", "hard"][index % 3];
}

function estimateTokens(text) {
  return Math.ceil(String(text || "").split(/\s+/).filter(Boolean).length * 1.3);
}

function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function cleanText(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function hashValue(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}
