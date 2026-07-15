import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  analyzeContentQuality,
  CONTENT_QUALITY_ALGORITHM_VERSION,
} from "../lib/content-quality.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const datasetPath = path.join(root, "data", "questions.enriched.json");
const indexPath = path.join(root, "data", "question-quality-index.json");
const datasetBytes = fs.readFileSync(datasetPath);
const datasetSha256 = crypto.createHash("sha256").update(datasetBytes).digest("hex");
const force = process.argv.includes("--force");

if (!force && isCurrentIndex(indexPath, datasetSha256)) {
  console.log("Question quality index is current.");
  process.exit(0);
}

const questions = JSON.parse(datasetBytes.toString("utf8"));
const analysis = analyzeContentQuality(questions, { generatedAt: "build" });
const payload = {
  schemaVersion: 1,
  algorithmVersion: CONTENT_QUALITY_ALGORITHM_VERSION,
  datasetSha256,
  questionCount: questions.length,
  summary: analysis.summary,
  questionIndex: analysis.questionIndex,
};

fs.writeFileSync(indexPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`Question quality index generated for ${questions.length} questions.`);

function isCurrentIndex(filePath, expectedSha256) {
  if (!fs.existsSync(filePath)) return false;
  try {
    const current = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return current.schemaVersion === 1 &&
      current.algorithmVersion === CONTENT_QUALITY_ALGORITHM_VERSION &&
      current.datasetSha256 === expectedSha256 &&
      current.questionIndex &&
      typeof current.questionIndex === "object";
  } catch {
    return false;
  }
}
