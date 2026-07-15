import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const registerPath = path.join(root, "data", "external-source-register.json");

const requiredSourceFields = [
  "id",
  "title",
  "url",
  "source_type",
  "content_type",
  "license_status",
  "import_status",
  "rights_evidence",
  "allowed_uses",
  "blocked_uses"
];

const allowedImportStatuses = new Set(["approved", "blocked", "research_only", "pending_permission"]);

function fail(message) {
  console.error(`Source register check failed: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(registerPath)) {
  fail("data/external-source-register.json is missing.");
}

let register;
try {
  register = JSON.parse(fs.readFileSync(registerPath, "utf8"));
} catch (error) {
  fail(`invalid JSON: ${error.message}`);
}

if (!Array.isArray(register.sources) || register.sources.length === 0) {
  fail("register must contain at least one source.");
}

const ids = new Set();
const errors = [];

for (const [index, source] of register.sources.entries()) {
  for (const field of requiredSourceFields) {
    if (!(field in source)) {
      errors.push(`source ${index + 1}: missing ${field}`);
    }
  }

  if (source.id) {
    if (ids.has(source.id)) {
      errors.push(`source ${source.id}: duplicate id`);
    }
    ids.add(source.id);
  }

  if (source.import_status && !allowedImportStatuses.has(source.import_status)) {
    errors.push(`source ${source.id || index + 1}: unknown import_status ${source.import_status}`);
  }

  if (!Array.isArray(source.rights_evidence)) {
    errors.push(`source ${source.id || index + 1}: rights_evidence must be an array`);
  }

  if (!Array.isArray(source.allowed_uses) || source.allowed_uses.length === 0) {
    errors.push(`source ${source.id || index + 1}: allowed_uses must be a non-empty array`);
  }

  if (!Array.isArray(source.blocked_uses) || source.blocked_uses.length === 0) {
    errors.push(`source ${source.id || index + 1}: blocked_uses must be a non-empty array`);
  }

  const isQuestionBank = source.content_type === "question_bank";
  const isApproved = source.import_status === "approved";
  const hasEvidence = Array.isArray(source.rights_evidence) && source.rights_evidence.length > 0;

  if (isQuestionBank && isApproved && !hasEvidence) {
    errors.push(`source ${source.id || index + 1}: approved question banks require rights_evidence`);
  }

  if (isQuestionBank && isApproved && /competitor|scrape|reddit|youtube/i.test(source.source_type)) {
    errors.push(`source ${source.id || index + 1}: high-risk source types cannot be approved automatically`);
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Source register OK: ${register.sources.length} sources checked.`);
