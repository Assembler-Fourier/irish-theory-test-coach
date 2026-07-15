import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getPrivateQuestionBank,
  publicPreviewQuestions,
  sourceAssetPath,
} from "../lib/question-bank.js";
import { PREVIEW_LIMIT } from "../shared/product-summary.js";

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), "..");
const sourceData = path.join(root, "data");
const publicData = path.join(root, "public", "data");

if (!fs.existsSync(sourceData)) {
  throw new Error("Missing data directory. Run the recovery and enrichment scripts first.");
}

fs.rmSync(publicData, { recursive: true, force: true });
fs.mkdirSync(publicData, { recursive: true });

const bank = getPrivateQuestionBank(process.env);
const previewAssetRoot = "data/preview-assets";
const previewQuestions = publicPreviewQuestions(bank, PREVIEW_LIMIT, previewAssetRoot);
const previewAssetsDir = path.join(publicData, "preview-assets");
fs.mkdirSync(previewAssetsDir, { recursive: true });

for (const question of previewQuestions) {
  for (const image of question.images || []) {
    const fileName = path.basename(image);
    const sourceQuestion = bank.find((item) => item.id === question.id);
    const sourceImage = sourceQuestion?.localImagePaths?.[0];
    if (!sourceImage) continue;
    fs.copyFileSync(sourceAssetPath(sourceImage), path.join(previewAssetsDir, fileName));
  }
}

const previewPackage = {
  version: 1,
  generatedAt: publicBuildDate(process.env),
  previewLimit: PREVIEW_LIMIT,
  questions: previewQuestions,
};

fs.writeFileSync(path.join(publicData, "preview-questions.json"), `${JSON.stringify(previewPackage, null, 2)}\n`, "utf8");

console.log(`Prepared preview data in ${path.relative(root, publicData)} (${previewQuestions.length} questions).`);

function publicBuildDate(env) {
  if (env.PUBLIC_BUILD_DATE) return env.PUBLIC_BUILD_DATE;
  if (env.VERCEL_GIT_COMMIT_SHA) return new Date().toISOString();
  return "local-dev";
}
