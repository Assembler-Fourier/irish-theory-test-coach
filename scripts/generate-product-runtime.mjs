import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildProductSummary,
  buildReleaseManifest,
  formatAccessDuration,
  formatInteger,
  formatMockLong,
  formatMockShort,
  formatUnlockCta,
  summaryForClient,
} from "../shared/product-summary.js";
import { getPublicPricingConfig } from "../shared/pricing-config.js";

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), "..");
const publicDir = path.join(root, "public");

const supportEmail = process.env.SUPPORT_EMAIL || "support@irish-theory-test-coach.com";
const summary = buildProductSummary({ root, env: process.env });
const clientSummary = summaryForClient(summary);
const pricingConfig = getPublicPricingConfig(process.env);
const releaseManifest = buildReleaseManifest(summary, { env: process.env });

fs.mkdirSync(publicDir, { recursive: true });

writePublicJson("product-summary.json", clientSummary);
writePublicJs("product-summary.js", "PRODUCT_SUMMARY", clientSummary);
writePublicJson("release-manifest.json", releaseManifest);
writePublicJson("pricing.json", pricingConfig);
writePublicJs("pricing-config.js", "PRICING_CONFIG", pricingConfig);
writePublicJs("config.js", "APP_CONFIG", { supportEmail });
updatePublicHtml(clientSummary);

console.log(
  `Generated product runtime summary: ${formatInteger(clientSummary.totalPublishedQuestions)} questions, ` +
    `${formatInteger(clientSummary.estimatedPriorityQuestionCount)} priority, ` +
    `${formatInteger(clientSummary.signOrImageQuestionCount)} sign/image.`
);

function writePublicJson(file, data) {
  fs.writeFileSync(path.join(publicDir, file), `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function writePublicJs(file, globalName, data) {
  fs.writeFileSync(path.join(publicDir, file), `window.${globalName} = ${JSON.stringify(data, null, 2)};\n`, "utf8");
}

function updatePublicHtml(product) {
  const values = {
    totalPublishedQuestions: formatInteger(product.totalPublishedQuestions),
    totalPublishedQuestionsLabel: `${formatInteger(product.totalPublishedQuestions)} questions`,
    estimatedPriorityQuestionCount: formatInteger(product.estimatedPriorityQuestionCount),
    signOrImageQuestionCount: formatInteger(product.signOrImageQuestionCount),
    previewLimit: formatInteger(product.previewLimit),
    mockLongLabel: formatMockLong(product),
    mockShortLabel: formatMockShort(product),
    activePrice: product.activePrice,
    accessDuration: formatAccessDuration(product),
    unlockCta: formatUnlockCta(product),
  };

  for (const file of fs.readdirSync(publicDir)) {
    if (!file.endsWith(".html")) continue;
    const filePath = path.join(publicDir, file);
    let html = fs.readFileSync(filePath, "utf8");
    const before = html;

    for (const [key, value] of Object.entries(values)) {
      html = replaceDataValue(html, key, value);
    }

    html = html
      .replace(/Preview \d+ questions/g, `Preview ${product.previewLimit} questions`)
      .replace(/Unlock for EUR \d+\.\d{2}/g, formatUnlockCta(product))
      .replace(/\d+-day access/g, formatAccessDuration(product))
      .replace(/"price":\s*"\d+\.\d{2}"/g, `"price": "${numericPrice(product.activePrice)}"`);

    if (html !== before) fs.writeFileSync(filePath, html, "utf8");
  }
}

function replaceDataValue(html, key, value) {
  const pattern = new RegExp(`(<[^>]+data-product-value="${escapeRegExp(key)}"[^>]*>)([\\s\\S]*?)(<\\/[^>]+>)`, "g");
  return html.replace(pattern, `$1${escapeHtml(value)}$3`);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function numericPrice(displayPrice) {
  const match = String(displayPrice || "").match(/\d+(?:\.\d{1,2})?/);
  return match ? Number(match[0]).toFixed(2) : "0.00";
}
