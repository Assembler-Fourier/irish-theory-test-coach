import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildProductSummary,
  formatAccessDuration,
  formatInteger,
  formatMockShort,
  formatUnlockCta,
  summaryForClient,
} from "../shared/product-summary.js";
import { getPublicPricingConfig } from "../shared/pricing-config.js";
import { buildBusinessConfig, publicBusinessConfig } from "../shared/business-config.js";

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), "..");
const publicDir = path.join(root, "public");
const errors = [];

checkGeneratedDataCopies();
checkProductSummary();
checkPricingRuntime();
checkBusinessRuntime();
checkMarketingCounts();
checkSitemapTargets();
checkReleaseManifest();

if (errors.length) {
  for (const error of errors) console.error(error);
  process.exit(1);
}

console.log("Stale build check passed.");

function checkGeneratedDataCopies() {
  const previewPath = path.join(publicDir, "data", "preview-questions.json");
  requireFile(previewPath, "public/data/preview-questions.json was not generated.");
  for (const forbidden of ["questions.json", "questions.enriched.json", "hardest_questions.json", "study_report.json", "recovery_report.json"]) {
    if (fs.existsSync(path.join(publicDir, "data", forbidden))) {
      errors.push(`public/data/${forbidden} must not be generated into the public build.`);
    }
  }
  if (fs.existsSync(path.join(publicDir, "data", "assets"))) {
    errors.push("public/data/assets must not expose the full image asset tree.");
  }
  const preview = readJson(previewPath);
  if (!Array.isArray(preview.questions)) errors.push("preview-questions.json must include a questions array.");
  if (preview.questions.length > preview.previewLimit) errors.push("preview package exceeds its preview limit.");
  const text = JSON.stringify(preview);
  if (/"correct(Index|Answer)"|"correct_index"|"isCorrect"|"is_correct"|"explanation"/i.test(text)) {
    errors.push("preview-questions.json exposes answer keys or explanations.");
  }
}

function checkProductSummary() {
  const expected = summaryForClient(buildProductSummary({ root, env: process.env }));
  const generatedPath = path.join(publicDir, "product-summary.json");
  requireFile(generatedPath, "public/product-summary.json is missing; rerun npm run build.");
  const generated = readJson(generatedPath);
  for (const key of [
    "contentVersion",
    "schemaVersion",
    "totalPublishedQuestions",
    "estimatedPriorityQuestionCount",
    "signOrImageQuestionCount",
    "previewLimit",
    "mockSize",
    "mockDurationMinutes",
    "accessDurationDays",
    "activePrice",
    "activePlanKey",
  ]) {
    if (generated[key] !== expected[key]) {
      errors.push(`product-summary.json ${key} is ${generated[key]} but expected ${expected[key]}.`);
    }
  }

  const js = readText(path.join(publicDir, "product-summary.js"));
  if (!js.includes(`window.PRODUCT_SUMMARY`)) errors.push("public/product-summary.js is missing PRODUCT_SUMMARY global.");
  if (!js.includes(`"contentVersion": "${expected.contentVersion}"`)) {
    errors.push("public/product-summary.js contentVersion is stale.");
  }
}

function checkPricingRuntime() {
  const expected = getPublicPricingConfig(process.env);
  const pricing = readJson(path.join(publicDir, "pricing.json"));
  assertDeepEqualForCheck(pricing, expected, "pricing.json differs from shared pricing config.");
  const pricingJs = readText(path.join(publicDir, "pricing-config.js"));
  if (!pricingJs.includes(`window.PRICING_CONFIG`)) errors.push("public/pricing-config.js is missing PRICING_CONFIG global.");

  const active = expected.plans.find((plan) => plan.active);
  const summary = summaryForClient(buildProductSummary({ root, env: process.env }));
  for (const file of ["index.html", "pricing.html"]) {
    const html = readText(path.join(publicDir, file));
    if (!html.includes(active.displayPrice)) errors.push(`${file} does not include active price ${active.displayPrice}.`);
    if (!html.includes(formatAccessDuration(summary))) errors.push(`${file} does not include access duration ${formatAccessDuration(summary)}.`);
  }
}

function checkBusinessRuntime() {
  const expected = publicBusinessConfig(buildBusinessConfig(process.env));
  const business = readJson(path.join(publicDir, "business-config.json"));
  assertDeepEqualForCheck(business, expected, "business-config.json differs from shared business config.");
  const businessJs = readText(path.join(publicDir, "business-config.js"));
  if (!businessJs.includes("window.BUSINESS_CONFIG")) errors.push("public/business-config.js is missing BUSINESS_CONFIG global.");
  if (!businessJs.includes(`"configVersion": ${expected.configVersion}`)) {
    errors.push("public/business-config.js configVersion is stale.");
  }
}

function checkMarketingCounts() {
  const summary = summaryForClient(buildProductSummary({ root, env: process.env }));
  const index = readText(path.join(publicDir, "index.html"));
  const required = [
    [formatInteger(summary.totalPublishedQuestions), "published question count"],
    [formatInteger(summary.estimatedPriorityQuestionCount), "estimated-priority count"],
    [formatInteger(summary.signOrImageQuestionCount), "sign/image count"],
    [String(summary.previewLimit), "preview limit"],
    [formatMockShort(summary), "mock size/duration"],
    [formatUnlockCta(summary), "unlock CTA"],
  ];
  for (const [needle, label] of required) {
    if (!index.includes(needle)) errors.push(`index.html is missing generated ${label}: ${needle}.`);
  }

  for (const [file, pattern] of [
    ["public/index.html", /\b849\s+(practice\s+)?questions\b/i],
    ["public/index.html", /\b111\s+estimated priority/i],
    ["public/index.html", /\b243\s+sign and image/i],
    ["README.md", /\b849\s+(practice\s+)?questions\b/i],
    ["docs/business-and-deployment-report.md", /\b849\s+(recovered\s+authorised\s+practice\s+)?questions\b/i],
    ["docs/business-and-deployment-report.md", /\b111\s+high-yield|\b111\s+estimated/i],
    ["docs/business-and-deployment-report.md", /\b243\s+sign|\b250\s+road-sign/i],
  ]) {
    const text = readText(path.join(root, file));
    if (pattern.test(text)) errors.push(`${file} still contains a stale marketing-count claim.`);
  }
}

function checkSitemapTargets() {
  const sitemap = readText(path.join(publicDir, "sitemap.xml"));
  const locs = Array.from(sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)).map((match) => new URL(match[1]).pathname);
  if (!locs.length) errors.push("sitemap.xml has no URLs.");
  for (const pathname of locs) {
    const file = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const direct = path.join(publicDir, file);
    const html = path.join(publicDir, `${file}.html`);
    if (!fs.existsSync(direct) && !fs.existsSync(html)) errors.push(`sitemap.xml contains missing page ${pathname}.`);
  }
}

function checkReleaseManifest() {
  const summary = summaryForClient(buildProductSummary({ root, env: process.env }));
  const manifest = readJson(path.join(publicDir, "release-manifest.json"));
  const expected = {
    version: summary.productVersion,
    contentVersion: summary.contentVersion,
    schemaVersion: summary.schemaVersion,
    publicQuestionCount: summary.totalPublishedQuestions,
    previewCount: summary.previewLimit,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (manifest[key] !== value) errors.push(`release-manifest.json ${key} is ${manifest[key]} but expected ${value}.`);
  }
  if (!manifest.commit) errors.push("release-manifest.json is missing commit.");
  if (!manifest.buildDate) errors.push("release-manifest.json is missing buildDate.");
  if (!manifest.featureFlags || typeof manifest.featureFlags !== "object") errors.push("release-manifest.json is missing featureFlags.");
}

function requireFile(file, message) {
  if (!fs.existsSync(file)) errors.push(message);
}

function readJson(file) {
  return JSON.parse(readText(file));
}

function readText(file) {
  return fs.readFileSync(file, "utf8");
}

function hashFile(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function assertDeepEqualForCheck(actual, expected, message) {
  try {
    assert.deepEqual(actual, expected);
  } catch {
    errors.push(message);
  }
}
