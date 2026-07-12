export const PAYMENT_EVIDENCE_SCHEMA_VERSION = 1;
export const PAYMENT_EVIDENCE_MAX_AGE_HOURS = 48;

export const REQUIRED_PAYMENT_TESTS = Object.freeze([
  "fullStudyPassCheckout",
  "instructor10Checkout",
  "instructor25Checkout",
  "webhookEntitlement",
  "duplicateWebhook",
  "repeatPurchaseExtension",
  "checkoutCancellation",
  "declinedPayment",
  "partialRefund",
  "fullRefund",
  "disputeOpen",
  "disputeWonClosed",
  "instructorCodeGeneration",
  "instructorCodeRedemption",
  "malformedWebhookSignature",
  "validWebhookResponse",
  "reconciliation",
]);

const ALLOWED_ASSERTION_SOURCES = new Set([
  "stripe_api",
  "stripe_dashboard",
  "stripe_webhook_delivery",
  "neon_query",
  "application_api",
  "http_response",
]);

const FULL_STRIPE_IDENTIFIER = /\b(?:cs_(?:test|live)|pi_|ch_|re_|du_|dp_|evt_|cus_|in_|price_|prod_)[A-Za-z0-9_-]{8,}\b/;
const SECRET_PATTERN = /(?:sk_(?:live|test)_[A-Za-z0-9_-]+|rk_(?:live|test)_[A-Za-z0-9_-]+|whsec_[A-Za-z0-9_-]+|postgres(?:ql)?:\/\/\S+)/i;
const REDACTED_SUFFIX = /^(?:checkout|payment_intent|charge|refund|dispute|event|customer|price|product)\.\.\.[A-Za-z0-9_-]{4,12}$/;

export function validatePaymentTestEvidence(evidence, context = {}) {
  const errors = [];
  const now = dateValue(context.now || new Date());
  const maxAgeMs = Number(context.maxAgeHours || PAYMENT_EVIDENCE_MAX_AGE_HOURS) * 60 * 60 * 1000;

  if (!isObject(evidence)) {
    return result(["Evidence must be a JSON object."], null);
  }

  if (evidence.schemaVersion !== PAYMENT_EVIDENCE_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${PAYMENT_EVIDENCE_SCHEMA_VERSION}.`);
  }
  requireIsoDate(errors, evidence.generatedAt, "generatedAt", now, maxAgeMs);
  if (!/^[0-9a-f]{40}$/i.test(String(evidence.commit || ""))) {
    errors.push("commit must be a full 40-character Git SHA.");
  }
  if (context.commit && evidence.commit !== context.commit) {
    errors.push("Evidence commit does not match the audited Git commit.");
  }
  if (evidence.branch !== (context.branch || "codex/commercial-v1")) {
    errors.push("Evidence branch does not match the audited branch.");
  }
  if (!/^dpl_[A-Za-z0-9]+$/.test(String(evidence.vercelDeploymentId || ""))) {
    errors.push("vercelDeploymentId must be a Vercel deployment ID.");
  }
  if (!context.deploymentId) {
    errors.push("The audit must provide the expected Vercel deployment ID.");
  } else if (evidence.vercelDeploymentId !== context.deploymentId) {
    errors.push("Evidence deployment does not match the audited Vercel deployment.");
  }
  if (evidence.previewOrigin !== context.previewOrigin) {
    errors.push("Evidence previewOrigin does not match the configured stable preview origin.");
  }
  if (evidence.environment !== "preview") errors.push("Evidence environment must be preview.");
  if (evidence.stripeMode !== "test") errors.push("Evidence stripeMode must be test.");

  const serialized = JSON.stringify(evidence);
  if (SECRET_PATTERN.test(serialized)) errors.push("Evidence contains a secret-like value.");
  if (FULL_STRIPE_IDENTIFIER.test(serialized)) errors.push("Evidence contains a full Stripe object identifier.");

  const requiredTests = [...REQUIRED_PAYMENT_TESTS];
  if (context.launchOfferEnabled) requiredTests.push("launchOfferCheckout");
  const tests = isObject(evidence.tests) ? evidence.tests : {};
  if (!isObject(evidence.tests)) errors.push("tests must be an object.");

  for (const key of requiredTests) {
    validateTestRecord(errors, tests[key], key, now, maxAgeMs);
  }

  const reconciliation = tests.reconciliation;
  if (isObject(reconciliation) && reconciliation.unresolvedFindings !== 0) {
    errors.push("reconciliation.unresolvedFindings must be 0.");
  }

  return result(errors, {
    requiredTests,
    tests: Object.fromEntries(requiredTests.map((key) => [key, tests[key]?.status || "MISSING"])),
  });
}

function validateTestRecord(errors, record, key, now, maxAgeMs) {
  if (!isObject(record)) {
    errors.push(`tests.${key} is missing.`);
    return;
  }
  if (record.status !== "PASS") errors.push(`tests.${key}.status must be PASS.`);
  requireIsoDate(errors, record.observedAt, `tests.${key}.observedAt`, now, maxAgeMs);
  if (!Array.isArray(record.assertions) || record.assertions.length === 0) {
    errors.push(`tests.${key}.assertions must contain independently observed checks.`);
  } else {
    record.assertions.forEach((assertion, index) => {
      if (!isObject(assertion) || !clean(assertion.name) || !Object.hasOwn(assertion, "expected") || !Object.hasOwn(assertion, "actual")) {
        errors.push(`tests.${key}.assertions[${index}] is incomplete.`);
        return;
      }
      if (!ALLOWED_ASSERTION_SOURCES.has(assertion.source)) {
        errors.push(`tests.${key}.assertions[${index}].source is invalid.`);
      }
      if (JSON.stringify(assertion.expected) !== JSON.stringify(assertion.actual)) {
        errors.push(`tests.${key}.assertions[${index}] does not match its expected value.`);
      }
    });
  }
  if (!Array.isArray(record.objectSuffixes)) {
    errors.push(`tests.${key}.objectSuffixes must be an array.`);
  } else if (record.objectSuffixes.some((value) => !REDACTED_SUFFIX.test(String(value)))) {
    errors.push(`tests.${key}.objectSuffixes contains a non-redacted identifier.`);
  }
}

function requireIsoDate(errors, value, label, now, maxAgeMs) {
  const parsed = dateValue(value);
  if (!Number.isFinite(parsed)) {
    errors.push(`${label} must be an ISO timestamp.`);
    return;
  }
  if (parsed > now + 5 * 60 * 1000) errors.push(`${label} is in the future.`);
  if (now - parsed > maxAgeMs) errors.push(`${label} is stale.`);
}

function dateValue(value) {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function clean(value) {
  return String(value || "").trim();
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function result(errors, summary) {
  return { ok: errors.length === 0, errors, summary };
}
