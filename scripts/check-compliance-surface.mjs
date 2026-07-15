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
  "legal.html",
  "contact.html",
  "privacy.html",
  "data-rights.html",
  "cookies.html",
  "terms.html",
  "refunds.html",
  "cancellation.html",
  "security.html",
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
  "Purposes and lawful bases",
  "Optional analytics choices",
  "Processors",
  "Storage locations",
  "Retention",
  "Automated recommendations",
  "User rights",
  "Complaint route",
  "Account deletion and export",
  "Cookies and local storage",
  "Security",
  "International transfers",
]) {
  requireText("privacy.html", privacy, phrase);
}
requireText("privacy.html", privacy, "No optional analytics ID or event is created before consent");

const dataRights = readPublic("data-rights.html");
for (const phrase of ["Access:", "Portability:", "Correction:", "Deletion:", "Restriction:", "Objection:", "Withdraw consent:", "one month"]) {
  requireText("data-rights.html", dataRights, phrase);
}

const cookies = readPublic("cookies.html");
for (const phrase of ["Optional first-party analytics remain off until you allow them", "ittc_session", "Strictly necessary", "No advertising cookies", "data-privacy-settings"]) {
  requireText("cookies.html", cookies, phrase);
}

const terms = readPublic("terms.html");
for (const phrase of [
  "Access duration and renewal",
  "Price, payment, and contract formation",
  "Account security",
  "Acceptable use",
  "Service conformity and consumer rights",
  "Cancellation and refunds",
  "Suspension and termination",
  "Intellectual property and licence",
  "Liability",
  "Governing law and disputes",
]) {
  requireText("terms.html", terms, phrase);
}
if (/Limitation wording placeholder|Dispute and jurisdiction placeholder|NOT_CONFIGURED: limitation/i.test(terms)) {
  errors.push("terms.html still contains legal-copy placeholders.");
}

const refunds = readPublic("refunds.html");
requireText("refunds.html", refunds, "14-day cancellation right");
requireText("refunds.html", refunds, "Faulty or non-conforming service");
requireText("refunds.html", refunds, "no later than 14 days after notice");
requireText("refunds.html", refunds, "No outcome refunds");

const cancellation = readPublic("cancellation.html");
requireText("cancellation.html", cancellation, "Model cancellation notice");
requireText("cancellation.html", cancellation, "cancellationForm");
requireText("cancellation.html", cancellation, "cancellation.js");

const security = readPublic("security.html");
requireText("security.html", security, "not currently represented as SOC 2 certified");
requireText("security.html", security, "Responsible disclosure");
requireText("security.html", security, "No website can promise absolute security");

const accessibility = readPublic("accessibility.html");
requireText("accessibility.html", accessibility, "WCAG 2.2 AA");
requireText("accessibility.html", accessibility, "Last automated accessibility test: July 15, 2026");

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
requireText("app.html", app, "privacy-consent.js");
requireText("app.html", app, "Cancellation rights");

const businessRuntime = JSON.parse(readPublic("business-config.json"));
assert.equal(businessRuntime.policyVersions.terms, business.policyVersions.terms);
assert.ok(Array.isArray(businessRuntime.launchBlockers));
assert.equal(Object.hasOwn(businessRuntime, "registeredAddress"), false, "Public runtime must not expose a private service address.");
assert.equal(Object.hasOwn(businessRuntime, "supportPhone"), false, "Public runtime must not expose a personal phone number.");
if (businessRuntime.launchBlockers.length) {
  requireText("contact.html", contact, "Launch blocker");
}

const policy = checkoutPolicyMetadata(business);
assert.equal(policy.policy_version_terms, business.policyVersions.terms);
assert.equal(policy.accepted_policy_versions.privacy, business.policyVersions.privacy);
assert.equal(policy.policy_version_cookies, business.policyVersions.cookies);
assert.equal(policy.policy_version_data_rights, business.policyVersions.dataRights);
assert.equal(policy.policy_version_cancellation, business.policyVersions.cancellation);

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
requireText("create-checkout-session.js", checkout, "appendCheckoutConsent");
requireText("create-checkout-session.js", checkout, "metadata[policy_version_cancellation]");

const analytics = fs.readFileSync(path.join(publicDir, "analytics-client.js"), "utf8");
const consent = fs.readFileSync(path.join(publicDir, "privacy-consent.js"), "utf8");
requireText("analytics-client.js", analytics, "hasAnalyticsConsent");
requireText("analytics-client.js", analytics, 'consent: "not_granted"');
requireText("privacy-consent.js", consent, "clearOptionalAnalyticsStorage");
requireText("privacy-consent.js", consent, "Reject optional analytics");

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
