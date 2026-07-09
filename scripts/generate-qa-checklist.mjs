import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), "..");
const dataPath = path.join(root, "data", "questions.enriched.json");
const outputDir = path.join(root, "reports", "content");
const outputPath = path.join(outputDir, "qa-checklist-high-yield.md");
const limit = Number(process.argv[2] || 40);

if (!fs.existsSync(dataPath)) {
  throw new Error("Missing data/questions.enriched.json. Run enrichment first.");
}

const questions = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const topQuestions = questions
  .slice()
  .sort((a, b) => Number(b.priority_score || 0) - Number(a.priority_score || 0) || a.id - b.id)
  .slice(0, limit);

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputPath, renderChecklist(topQuestions), "utf8");
console.log(`Wrote ${path.relative(root, outputPath)}`);

function renderChecklist(items) {
  const lines = [
    "# High-Yield Question QA Checklist",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "Purpose: review high-priority practice items for clarity, currentness, provenance, explanation quality, and non-affiliation-safe wording.",
    "",
    "Important: this is an independent practice product. Do not mark any item as official or claim official exam frequency.",
    "",
    "## Checklist",
    "",
  ];

  items.forEach((question, index) => {
    lines.push(`### ${index + 1}. Question ${question.id}`);
    lines.push("");
    lines.push(`- Category: ${question.category || "Uncategorised"}`);
    lines.push(`- Priority: ${question.priority_label || "n/a"} ${question.priority_score ?? "n/a"}`);
    lines.push(`- Review status: ${question.reviewed_status || "needs_official_cross_check"}`);
    lines.push(`- Source type: ${question.source_type || "recovered_archive"}`);
    lines.push(`- Source reference: ${question.source_reference || question.source_url || "n/a"}`);
    lines.push(`- Archive timestamp: ${question.archive_timestamp || "n/a"}`);
    lines.push(`- Has image: ${Array.isArray(question.local_image_paths) && question.local_image_paths.length ? "yes" : "no"}`);
    lines.push("");
    lines.push(`Question: ${cleanText(question.question || "")}`);
    lines.push("");
    lines.push(`Current explanation: ${cleanText(question.explanation || "None")}`);
    lines.push("");
    lines.push("- [ ] Source/provenance is documented.");
    lines.push("- [ ] Wording is suitable for independent practice and does not imply official affiliation.");
    lines.push("- [ ] Explanation is accurate, clear, and current.");
    lines.push("- [ ] Correct answer and distractors are sensible.");
    lines.push("- [ ] Image, if present, renders and matches the question.");
    lines.push("- [ ] Mark approved/rejected in admin review UI.");
    lines.push("");
  });

  return `${lines.join("\n")}\n`;
}

function cleanText(value) {
  return String(value)
    .replaceAll("–", "-")
    .replaceAll("—", "-")
    .replaceAll("‘", "'")
    .replaceAll("’", "'")
    .replaceAll("“", '"')
    .replaceAll("”", '"')
    .replaceAll("â€“", "-")
    .replaceAll("â€”", "-")
    .replaceAll("â€˜", "'")
    .replaceAll("â€™", "'")
    .replaceAll("â€œ", '"')
    .replaceAll("â€\u009d", '"')
    .replaceAll("Â", "")
    .replace(/\s+/g, " ")
    .trim();
}
