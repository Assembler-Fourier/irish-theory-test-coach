import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPublicPricingConfig } from "../shared/pricing-config.js";

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), "..");
const sourceData = path.join(root, "data");
const publicData = path.join(root, "public", "data");

const files = [
  "questions.json",
  "questions.enriched.json",
  "hardest_questions.json",
  "study_report.json",
  "recovery_report.json",
];

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

if (!fs.existsSync(sourceData)) {
  throw new Error("Missing data directory. Run the recovery and enrichment scripts first.");
}

fs.rmSync(publicData, { recursive: true, force: true });
fs.mkdirSync(publicData, { recursive: true });

for (const file of files) {
  const source = path.join(sourceData, file);
  if (fs.existsSync(source)) {
    fs.copyFileSync(source, path.join(publicData, file));
  }
}

copyDir(path.join(sourceData, "assets"), path.join(publicData, "assets"));

const supportEmail = process.env.SUPPORT_EMAIL || "support@irish-theory-test-coach.com";
const pricingConfig = getPublicPricingConfig(process.env);
fs.writeFileSync(
  path.join(root, "public", "config.js"),
  `window.APP_CONFIG = ${JSON.stringify({ supportEmail }, null, 2)};\n`,
  "utf8"
);
fs.writeFileSync(
  path.join(root, "public", "pricing-config.js"),
  `window.PRICING_CONFIG = ${JSON.stringify(pricingConfig, null, 2)};\n`,
  "utf8"
);
fs.writeFileSync(
  path.join(root, "public", "pricing.json"),
  `${JSON.stringify(pricingConfig, null, 2)}\n`,
  "utf8"
);

console.log(`Prepared deployable data in ${path.relative(root, publicData)}`);
