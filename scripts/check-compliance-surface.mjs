import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertBusinessReadyForProduction,
  buildBusinessConfig,
  checkoutPolicyMetadata,
  isPlaceholder,
} from "../shared/business-config.js";

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), "..");
const publicDir = path.join(root, "public");
const errors = [];

const business = buildBusinessConfig(process.env);
const requiredPages = [
  "contact.html",
  "privacy.html",
  "terms.html",
  "refunds.html",
  "accessibility.html",
  "content-methodology.html",
];

for (const file of requiredPages) {
  const html = readPublic(file);
  requireText(file, html, "Independent practice tool. Not affiliated with RSA or Prometric.");
  requireText(file, html, "Policy version:");
  requireOneH1(file, html);
  requireCanonical(file, html);
}

const contact = readPublic("contact.html");
requireText("contact.html", contact, "cannot book, change, cancel, or manage");
requireText("contact.html", contact, "Question corrections");
requireText("contact.html", contact, "Urgent security contact");

const privacy = readPublic("privacy.html");
for (const phrase of [
  "Controller identity",
  "Data collected",
  "Configured lawful basis",
  "Processors",
  "Storage locations",
  "Retention",
  "User rights",
  "Complaint route",
  "Account deletion and export",
  "Analytics behavior",
  "Cookies and local storage",
  "International transfers",
]) {
  requireText("privacy.html", privacy, phrase);
}

const terms = readPublic("terms.html");
for (const phrase of [
  "Access duration",
  "Permitted account use",
  "Payment",
  "Account security",
  "Acceptable use",
  "Content corrections",
  "Service availability",
  "Suspension",
  "Intellectual property",
  "Limitation wording placeholder",
]) {
  requireText("terms.html", terms, phrase);
}

const refunds = readPublic("refunds.html");
requireText("refunds.html", refunds, "does not promise instant automatic refunds");
requireText("refunds.html", refunds, "No outcome refunds");

const accessibility = readPublic("accessibility.html");
requireText("accessibility.html", accessibility, "WCAG 2.2 AA");
requireText("accessibility.html", accessibility, "Last automated accessibility test: July 11, 2026");

const methodology = readPublic("content-methodology.html");
for (const phrase of [
  "Questions are not presented as official live exam questions",
  "AI-generated questions are draft-only until admin review",
  "Estimated priority",
  "not official exam frequency",
  "Learner performance",
  "Corrections",
]) {
  requireText("content-methodology.html", methodology, phrase);
}

const app = readPublic("app.html");
requireText("app.html", app, "Refunds");
requireText("app.html", app, "Policy version:");
requireText("app.html", app, "Content version");
requireText("app.html", app, "Report a problem");

const businessRuntime = JSON.parse(readPublic("business-config.json"));
assert.equal(businessRuntime.policyVersions.terms, business.policyVersions.terms);
assert.ok(Array.isArray(businessRuntime.launchBlockers));
if (businessRuntime.launchBlockers.length) {
  requireText("contact.html", contact, "Launch blocker");
}

const policy = checkoutPolicyMetadata(business);
assert.equal(policy.policy_version_terms, business.policyVersions.terms);
assert.equal(policy.accepted_policy_versions.privacy, business.policyVersions.privacy);

const incompleteProductionEnv = {
  ...process.env,
  LEGAL_TRADING_NAME: "",
  OPERATOR_TYPE: "",
  REGISTERED_ADDRESS: "",
  SUPPORT_EMAIL: "",
  PRIVACY_EMAIL: "",
  REFUND_EMAIL: "",
  GOVERNING_JURISDICTION: "",
  PRIVACY_LAWFUL_BASIS: "",
  PRIVACY_COMPLAINT_ROUTE: "",
  INTERNATIONAL_TRANSFER_BASIS: "",
  COMMERCIAL_LAUNCH_REQUIRED: "true",
};
assert.throws(
  () => assertBusinessReadyForProduction(
    buildBusinessConfig(incompleteProductionEnv),
    incompleteProductionEnv,
  ),
  /Commercial launch blockers remain/
);

const readyConfig = buildBusinessConfig({
  ...process.env,
  LEGAL_TRADING_NAME: "Example Trading Name",
  OPERATOR_TYPE: "sole trader",
  REGISTERED_ADDRESS: "Example registered address",
  SUPPORT_EMAIL: "support@example.com",
  PRIVACY_EMAIL: "privacy@example.com",
  REFUND_EMAIL: "refunds@example.com",
  GOVERNING_JURISDICTION: "Ireland",
  PRIVACY_LAWFUL_BASIS: "Configured after legal review",
  PRIVACY_COMPLAINT_ROUTE: "Configured after legal review",
  INTERNATIONAL_TRANSFER_BASIS: "Configured after legal review",
});
assert.doesNotThrow(() => assertBusinessReadyForProduction(readyConfig, { COMMERCIAL_LAUNCH_REQUIRED: "true" }));
assert.equal(readyConfig.launchBlockers.length, 0);

const schema = fs.readFileSync(path.join(root, "database", "schema.sql"), "utf8");
requireText("database/schema.sql", schema, "accepted_policy_versions jsonb");
requireText("database/schema.sql", schema, "policy_versions jsonb");

const checkout = fs.readFileSync(path.join(root, "server", "api", "create-checkout-session.js"), "utf8");
requireText("create-checkout-session.js", checkout, "acceptedPolicyVersions");
requireText("create-checkout-session.js", checkout, "metadata[policy_version_terms]");
requireText("create-checkout-session.js", checkout, "metadata[content_version]");

for (const [file, text] of publicHtmlFiles()) {
  assertNoFakeTrust(file, text);
}

if (errors.length) {
  for (const error of errors) console.error(error);
  process.exit(1);
}

console.log("Commercial compliance surface check passed.");

function readPublic(file) {
  const filePath = path.join(publicDir, file);
  if (!fs.existsSync(filePath)) {
    errors.push(`${file} is missing.`);
    return "";
  }
  return fs.readFileSync(filePath, "utf8");
}

function requireText(file, text, phrase) {
  if (!text.includes(phrase)) errors.push(`${file} is missing required text: ${phrase}`);
}

function requireOneH1(file, html) {
  const count = (html.match(/<h1[\s>]/gi) || []).length;
  if (count !== 1) errors.push(`${file} must have exactly one H1; found ${count}.`);
}

function requireCanonical(file, html) {
  if (!/<link\s+rel="canonical"\s+href="https:\/\/[^"]+"/i.test(html)) {
    errors.push(`${file} is missing canonical metadata.`);
  }
}

function assertNoFakeTrust(file, html) {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").toLowerCase();
  const forbidden = [
    "fake review",
    "trusted by thousands",
    "guaranteed pass",
    "official rsa partner",
    "official prometric partner",
    "security seal",
    "limited seats",
    "countdown",
  ];
  for (const phrase of forbidden) {
    if (text.includes(phrase)) errors.push(`${file} contains forbidden trust/commercial claim: ${phrase}`);
  }
}

function publicHtmlFiles() {
  return fs.readdirSync(publicDir)
    .filter((file) => file.endsWith(".html"))
    .map((file) => [file, fs.readFileSync(path.join(publicDir, file), "utf8")]);
}
