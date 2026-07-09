import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), "..");

const DATASETS = [
  path.join(root, "data", "questions.json"),
  path.join(root, "data", "questions.enriched.json"),
];

const DEFAULT_NOTE = [
  "Recovered archive item.",
  "Needs independent content review and cross-check against current Irish learning materials before being treated as verified.",
].join(" ");

for (const file of DATASETS) {
  if (!fs.existsSync(file)) continue;

  const questions = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(questions)) {
    throw new Error(`${path.relative(root, file)} must contain a question array.`);
  }

  const updated = questions.map(addProvenance);
  fs.writeFileSync(file, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
  console.log(`Updated ${path.relative(root, file)} with provenance fields.`);
}

function addProvenance(question) {
  const sourceType = question.source_type || sourceTypeFor(question);
  const reviewedStatus = question.reviewed_status || reviewedStatusFor(question, sourceType);
  const safeToShow = safeToShowFor(question, sourceType, reviewedStatus);

  return {
    ...question,
    source_type: sourceType,
    source_reference: question.source_reference || question.source_url || question.archive_url || `question:${question.id}`,
    reviewed_status: reviewedStatus,
    reviewed_by: question.reviewed_by || null,
    reviewed_at: question.reviewed_at || null,
    notes: question.notes || DEFAULT_NOTE,
    safe_to_show: safeToShow,
  };
}

function sourceTypeFor(question) {
  if (question.source === "ai" || question.source === "ai_generated") return "ai_generated";
  return "recovered_archive";
}

function reviewedStatusFor(question, sourceType) {
  if (question.verified === true || question.reviewed_at) return "approved";
  if (sourceType === "ai_generated") return "unreviewed";
  return "needs_official_cross_check";
}

function safeToShowFor(question, sourceType, reviewedStatus) {
  if (typeof question.safe_to_show === "boolean") return question.safe_to_show;
  if (reviewedStatus === "rejected") return false;
  if (sourceType === "ai_generated") return reviewedStatus === "approved";
  return true;
}
