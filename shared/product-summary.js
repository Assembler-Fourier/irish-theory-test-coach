import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { DEFAULT_ENTITLEMENT_DAYS, getPublicPricingConfig } from "./pricing-config.js";

export const PRODUCT_SUMMARY_VERSION = 1;
export const PRODUCT_VERSION = "commercial-v1";
export const PREVIEW_LIMIT = 15;
export const MOCK_SIZE = 40;
export const MOCK_DURATION_MINUTES = 45;
export const PASS_MARK = 35;
export const DAILY_TARGET = 25;
export const HIGH_YIELD_THRESHOLD = 68;
export const CRITICAL_THRESHOLD = 82;

export function buildProductSummary(options = {}) {
  const root = options.root || process.cwd();
  const env = options.env || process.env;
  const packageJson = readJson(path.join(root, "package.json"));
  const questions = readQuestions(path.join(root, "data", "questions.enriched.json"));
  const studyReport = readJson(path.join(root, "data", "study_report.json"));
  const schemaPath = path.join(root, "database", "schema.sql");
  const pricing = getPublicPricingConfig(env);
  const activePlan = pricing.plans.find((plan) => plan.active) || pricing.plans.find((plan) => plan.key === "full_study_pass") || pricing.plans[0];
  const published = questions.filter(isPublishedQuestion);
  const counts = countPublishedQuestions(published);
  const reportSummary = studyReport.summary || {};

  assertReportAgreement("questions", reportSummary.questions, counts.totalPublishedQuestions);
  assertReportAgreement("high_yield_questions", reportSummary.high_yield_questions, counts.estimatedPriorityQuestionCount);
  assertReportAgreement("critical_questions", reportSummary.critical_questions, counts.criticalQuestionCount);
  assertReportAgreement("road_sign_or_image_questions", reportSummary.road_sign_or_image_questions, counts.signOrImageQuestionCount);

  const contentVersion = hashFiles([
    path.join(root, "data", "questions.enriched.json"),
    path.join(root, "data", "study_report.json"),
  ]);
  const schemaVersion = fs.existsSync(schemaPath) ? hashFile(schemaPath).slice(0, 12) : "missing-schema";
  const activePrice = activePlan?.displayPrice || "EUR 0.00";
  const accessDurationDays = Number(activePlan?.entitlementDays || DEFAULT_ENTITLEMENT_DAYS);

  return {
    productKey: "irish-theory-test-coach",
    productName: "Irish Theory Test Coach",
    productVersion: `${packageJson.version || "0.0.0"}-${PRODUCT_VERSION}`,
    summaryVersion: PRODUCT_SUMMARY_VERSION,
    contentVersion,
    schemaVersion,
    totalPublishedQuestions: counts.totalPublishedQuestions,
    estimatedPriorityQuestionCount: counts.estimatedPriorityQuestionCount,
    signOrImageQuestionCount: counts.signOrImageQuestionCount,
    criticalQuestionCount: counts.criticalQuestionCount,
    previewLimit: PREVIEW_LIMIT,
    dailyTarget: DAILY_TARGET,
    mockSize: MOCK_SIZE,
    mockDurationMinutes: MOCK_DURATION_MINUTES,
    mockDurationSeconds: MOCK_DURATION_MINUTES * 60,
    passMark: PASS_MARK,
    accessDurationDays,
    activePrice,
    activePlanKey: activePlan?.key || "full_study_pass",
    activePlanLabel: activePlan?.label || "Full Study Pass",
    launchOfferEnabled: Boolean(pricing.launchOfferEnabled),
    pricing,
    featureFlags: buildFeatureFlags(pricing),
    publicData: {
      previewQuestionsPath: "data/preview-questions.json",
      privateQuestionSource: "server-packaged-data",
    },
    generatedFrom: {
      source: "shared/product-summary.js",
      pricingSource: "shared/pricing-config.js",
      dataSource: "data/questions.enriched.json",
      studyReportSource: "data/study_report.json",
    },
  };
}

export function buildReleaseManifest(summary, options = {}) {
  const env = options.env || process.env;
  return {
    version: summary.productVersion,
    commit: publicCommit(env),
    buildDate: publicBuildDate(env),
    contentVersion: summary.contentVersion,
    schemaVersion: summary.schemaVersion,
    publicQuestionCount: summary.totalPublishedQuestions,
    previewCount: summary.previewLimit,
    featureFlags: summary.featureFlags,
  };
}

export function summaryForClient(summary) {
  return {
    productKey: summary.productKey,
    productName: summary.productName,
    productVersion: summary.productVersion,
    summaryVersion: summary.summaryVersion,
    contentVersion: summary.contentVersion,
    schemaVersion: summary.schemaVersion,
    totalPublishedQuestions: summary.totalPublishedQuestions,
    estimatedPriorityQuestionCount: summary.estimatedPriorityQuestionCount,
    signOrImageQuestionCount: summary.signOrImageQuestionCount,
    criticalQuestionCount: summary.criticalQuestionCount,
    previewLimit: summary.previewLimit,
    dailyTarget: summary.dailyTarget,
    mockSize: summary.mockSize,
    mockDurationMinutes: summary.mockDurationMinutes,
    mockDurationSeconds: summary.mockDurationSeconds,
    passMark: summary.passMark,
    accessDurationDays: summary.accessDurationDays,
    activePrice: summary.activePrice,
    activePlanKey: summary.activePlanKey,
    activePlanLabel: summary.activePlanLabel,
    launchOfferEnabled: summary.launchOfferEnabled,
    featureFlags: summary.featureFlags,
  };
}

export function formatInteger(value) {
  return new Intl.NumberFormat("en-IE").format(Number(value || 0));
}

export function formatAccessDuration(summary) {
  return `${summary.accessDurationDays}-day access`;
}

export function formatMockShort(summary) {
  return `${summary.mockSize} / ${summary.mockDurationMinutes}`;
}

export function formatMockLong(summary) {
  return `${summary.mockSize} questions, ${summary.mockDurationMinutes} minutes`;
}

export function formatUnlockCta(summary) {
  return `Unlock for ${summary.activePrice}`;
}

function countPublishedQuestions(questions) {
  return {
    totalPublishedQuestions: questions.length,
    estimatedPriorityQuestionCount: questions.filter((question) => Number(question.priority_score || 0) >= HIGH_YIELD_THRESHOLD).length,
    criticalQuestionCount: questions.filter((question) => Number(question.priority_score || 0) >= CRITICAL_THRESHOLD).length,
    signOrImageQuestionCount: questions.filter(hasSignOrImageSignal).length,
  };
}

function hasSignOrImageSignal(question) {
  if (question.is_road_sign === true) return true;
  if (Array.isArray(question.local_image_paths) && question.local_image_paths.length) return true;
  if (Array.isArray(question.image_urls) && question.image_urls.length) return true;
  if (Array.isArray(question.coach_visual_paths) && question.coach_visual_paths.length) return true;
  return Number(question.score_breakdown?.road_sign_or_image_signal || 0) > 0;
}

function isPublishedQuestion(question) {
  if (!question || !Number.isInteger(question.id)) return false;
  return Boolean(question.question && Array.isArray(question.options) && question.options.length);
}

function buildFeatureFlags(pricing) {
  return {
    stripeCheckout: true,
    magicLinkRestore: true,
    progressSync: true,
    adminDashboard: true,
    seoPages: true,
    pwa: true,
    aiExplanations: true,
    referralCodes: true,
    launchOffer: Boolean(pricing.launchOfferEnabled),
  };
}

function readQuestions(filePath) {
  const raw = readJson(filePath);
  return Array.isArray(raw) ? raw : raw.questions;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function assertReportAgreement(label, reportValue, derivedValue) {
  if (reportValue === undefined || reportValue === null) return;
  if (Number(reportValue) !== Number(derivedValue)) {
    throw new Error(`Study report ${label} (${reportValue}) disagrees with published data (${derivedValue}).`);
  }
}

function hashFiles(files) {
  const hash = crypto.createHash("sha256");
  for (const file of files) {
    hash.update(path.relative(process.cwd(), file));
    hash.update("\0");
    hash.update(fs.readFileSync(file));
  }
  return hash.digest("hex").slice(0, 16);
}

function hashFile(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function publicCommit(env) {
  const vercelCommit = cleanPublicString(env.VERCEL_GIT_COMMIT_SHA);
  if (vercelCommit) return vercelCommit;
  if (cleanPublicString(env.PUBLIC_BUILD_COMMIT)) return cleanPublicString(env.PUBLIC_BUILD_COMMIT);
  return "local-dev";
}

function publicBuildDate(env) {
  const provided = cleanPublicString(env.PUBLIC_BUILD_DATE);
  if (provided) return provided;
  if (cleanPublicString(env.VERCEL_GIT_COMMIT_SHA)) return new Date().toISOString();
  return "local-dev";
}

function cleanPublicString(value) {
  return String(value || "").replace(/[^\w.:/-]/g, "").slice(0, 120);
}

export function localGitHead(root = process.cwd()) {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, text: true, stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "unknown";
  }
}
