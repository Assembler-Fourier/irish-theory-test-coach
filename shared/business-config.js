export const BUSINESS_CONFIG_VERSION = 2;

export const PLACEHOLDER = "NOT_CONFIGURED";

export const DEFAULT_POLICY_VERSION = "2026-07-15-v1";
export const DEFAULT_POLICY_EFFECTIVE_DATE = "2026-07-15";

const MANDATORY_COMMERCIAL_FIELDS = [
  "legalTradingName",
  "operatorType",
  "registeredAddress",
  "supportEmail",
  "privacyEmail",
  "refundEmail",
  "governingJurisdiction",
  "privacyLawfulBasis",
  "internationalTransferBasis",
  "complaintRoute",
];

export function buildBusinessConfig(env = process.env) {
  const supportEmail = cleanEmail(env.SUPPORT_EMAIL) || placeholderEmail("support");
  const privacyEmail = cleanEmail(env.PRIVACY_EMAIL) || supportEmail || placeholderEmail("privacy");
  const refundEmail = cleanEmail(env.REFUND_EMAIL) || supportEmail || placeholderEmail("refunds");
  const securityEmail = cleanEmail(env.SECURITY_EMAIL) || supportEmail || placeholderEmail("security");
  const publicProductName = cleanText(env.PUBLIC_PRODUCT_NAME, 120) || "Irish Theory Test Coach";
  const legalTradingName = cleanText(env.LEGAL_TRADING_NAME, 180) || placeholder("legal trading name");

  const config = {
    configVersion: BUSINESS_CONFIG_VERSION,
    publicProductName,
    legalTradingName,
    operatorType: cleanText(env.OPERATOR_TYPE, 120) || placeholder("operator type"),
    registeredAddress: cleanText(env.REGISTERED_ADDRESS, 500) || placeholder("registered address"),
    businessRegistrationNumber: cleanText(env.BUSINESS_REGISTRATION_NUMBER, 120) || placeholder("business registration number, if applicable"),
    vatNumber: cleanText(env.VAT_NUMBER, 120) || placeholder("VAT number, if applicable"),
    supportEmail,
    privacyEmail,
    refundEmail,
    securityEmail,
    supportPhone: cleanText(env.SUPPORT_PHONE, 80),
    governingJurisdiction: cleanText(env.GOVERNING_JURISDICTION, 160) || placeholder("governing jurisdiction"),
    privacyLawfulBasis: cleanText(env.PRIVACY_LAWFUL_BASIS, 500) || placeholder("lawful basis for processing"),
    complaintRoute: cleanText(env.PRIVACY_COMPLAINT_ROUTE, 500) || placeholder("data-protection complaint route"),
    internationalTransferBasis: cleanText(env.INTERNATIONAL_TRANSFER_BASIS, 500) || placeholder("international transfer basis"),
    storageLocations: parseList(env.STORAGE_LOCATIONS, ["Vercel deployment regions", "Neon Postgres hosting region", "Stripe payment infrastructure"]),
    processors: buildProcessorList(env),
    retentionPeriods: buildRetentionPeriods(env),
    policyEffectiveDates: buildPolicyEffectiveDates(env),
    policyVersions: buildPolicyVersions(env),
    policyReview: {
      legalReviewRequired: stringBoolean(env.LEGAL_REVIEW_REQUIRED, true),
      internalReviewNote: "Draft operational policies generated from current product behavior. Legal review is required before production launch.",
    },
    responseExpectations: {
      support: cleanText(env.SUPPORT_RESPONSE_EXPECTATION, 240) || "We aim to respond to support messages within 2 business days.",
      privacy: cleanText(env.PRIVACY_RESPONSE_EXPECTATION, 240) || "We normally respond to valid privacy requests within one month after any necessary identity verification.",
      security: cleanText(env.SECURITY_RESPONSE_EXPECTATION, 240) || "We aim to acknowledge credible urgent security reports promptly and prioritize them by impact.",
    },
    launchBlockers: [],
  };

  config.launchBlockers = findBusinessLaunchBlockers(config);
  return config;
}

export function publicBusinessConfig(config) {
  return {
    configVersion: config.configVersion,
    publicProductName: config.publicProductName,
    legalTradingName: config.legalTradingName,
    operatorType: config.operatorType,
    registeredAddress: config.registeredAddress,
    ...(!isPlaceholder(config.businessRegistrationNumber) ? { businessRegistrationNumber: config.businessRegistrationNumber } : {}),
    ...(!isPlaceholder(config.vatNumber) ? { vatNumber: config.vatNumber } : {}),
    supportEmail: config.supportEmail,
    privacyEmail: config.privacyEmail,
    refundEmail: config.refundEmail,
    securityEmail: config.securityEmail,
    ...(config.supportPhone ? { supportPhone: config.supportPhone } : {}),
    governingJurisdiction: config.governingJurisdiction,
    privacyLawfulBasis: config.privacyLawfulBasis,
    complaintRoute: config.complaintRoute,
    internationalTransferBasis: config.internationalTransferBasis,
    storageLocations: config.storageLocations,
    processors: config.processors,
    retentionPeriods: config.retentionPeriods,
    policyEffectiveDates: config.policyEffectiveDates,
    policyVersions: config.policyVersions,
    responseExpectations: config.responseExpectations,
    launchBlockers: config.launchBlockers,
  };
}

export function findBusinessLaunchBlockers(config) {
  const blockers = [];
  for (const field of MANDATORY_COMMERCIAL_FIELDS) {
    if (isPlaceholder(config[field])) blockers.push(`Configure ${field}.`);
  }
  if (!isValidEmail(config.supportEmail)) blockers.push("Configure a valid supportEmail.");
  if (!isValidEmail(config.privacyEmail)) blockers.push("Configure a valid privacyEmail.");
  if (!isValidEmail(config.refundEmail)) blockers.push("Configure a valid refundEmail.");
  if (!Array.isArray(config.processors) || !config.processors.length) blockers.push("Configure at least one processor.");
  return blockers;
}

export function assertBusinessReadyForProduction(config, env = process.env) {
  const isProduction = env.VERCEL_ENV === "production" ||
    env.NODE_ENV === "production" ||
    env.COMMERCIAL_LAUNCH_REQUIRED === "true";
  if (!isProduction || !config.launchBlockers.length) return;
  const error = new Error(`Commercial launch blockers remain: ${config.launchBlockers.join(" ")}`);
  error.code = "COMMERCIAL_IDENTITY_INCOMPLETE";
  error.launchBlockers = config.launchBlockers;
  throw error;
}

export function policyMetadata(config) {
  return {
    privacy: config.policyVersions.privacy,
    terms: config.policyVersions.terms,
    refunds: config.policyVersions.refunds,
    accessibility: config.policyVersions.accessibility,
    contentMethodology: config.policyVersions.contentMethodology,
    cookies: config.policyVersions.cookies,
    dataRights: config.policyVersions.dataRights,
    security: config.policyVersions.security,
    cancellation: config.policyVersions.cancellation,
    effectiveDate: config.policyEffectiveDates.terms,
    legalReviewRequired: String(Boolean(config.policyReview?.legalReviewRequired)),
  };
}

export function checkoutPolicyMetadata(config) {
  const versions = policyMetadata(config);
  return {
    accepted_policy_versions: versions,
    policy_version_privacy: versions.privacy,
    policy_version_terms: versions.terms,
    policy_version_refunds: versions.refunds,
    policy_version_accessibility: versions.accessibility,
    policy_version_content_methodology: versions.contentMethodology,
    policy_version_cookies: versions.cookies,
    policy_version_data_rights: versions.dataRights,
    policy_version_security: versions.security,
    policy_version_cancellation: versions.cancellation,
    policy_effective_date: versions.effectiveDate,
    legal_review_required: versions.legalReviewRequired,
  };
}

export function isPlaceholder(value) {
  return String(value || "").includes(PLACEHOLDER);
}

function buildProcessorList(env) {
  const configured = parseJsonList(env.PROCESSOR_LIST);
  if (configured.length) return configured;

  const processors = [
    {
      name: "Vercel",
      purpose: "Hosting, serverless functions, deployment logs, and static asset delivery.",
      dataCategories: ["IP-derived request metadata", "technical logs", "website content"],
      location: cleanText(env.PROCESSOR_VERCEL_LOCATION, 120) || "Configured through Vercel project settings",
    },
    {
      name: "Neon",
      purpose: "Postgres database for accounts, entitlements, progress, support, analytics, and audit records.",
      dataCategories: ["email", "progress", "entitlements", "support records", "analytics events"],
      location: cleanText(env.PROCESSOR_NEON_LOCATION, 120) || "Configured through Neon project settings",
    },
    {
      name: "Stripe",
      purpose: "Checkout, payment processing, refunds, disputes, and payment event webhooks.",
      dataCategories: ["checkout email", "payment status", "Stripe identifiers"],
      location: cleanText(env.PROCESSOR_STRIPE_LOCATION, 120) || "Stripe infrastructure",
    },
  ];

  if (env.EMAIL_PROVIDER_API_KEY || env.EMAIL_FROM) {
    processors.push({
      name: cleanText(env.EMAIL_PROVIDER_NAME, 80) || "Email provider",
      purpose: "Passwordless login links and transactional access emails.",
      dataCategories: ["email", "message delivery status"],
      location: cleanText(env.EMAIL_PROVIDER_LOCATION, 120) || "Configured email provider infrastructure",
    });
  }

  if (env.AI_EXPLANATION_API_KEY || env.AI_QUESTION_API_KEY) {
    processors.push({
      name: cleanText(env.AI_PROVIDER_NAME, 80) || "AI provider",
      purpose: "Optional explanation generation and admin draft-question generation.",
      dataCategories: ["question text submitted for generation", "selected answer context"],
      location: cleanText(env.AI_PROVIDER_LOCATION, 120) || "Configured AI provider infrastructure",
    });
  }

  return processors;
}

function buildRetentionPeriods(env) {
  return {
    loginTokens: `${numberFromEnv(env.RETENTION_EXPIRED_LOGIN_TOKENS_DAYS, 30)} days after expiry`,
    sessions: `${numberFromEnv(env.RETENTION_EXPIRED_SESSIONS_DAYS, 180)} days after expiry; revoked sessions ${numberFromEnv(env.RETENTION_REVOKED_SESSIONS_DAYS, 90)} days`,
    anonymousAnalytics: `${numberFromEnv(env.RETENTION_ANONYMOUS_ANALYTICS_DAYS, 180)} days`,
    webhookPayloadMetadata: `${numberFromEnv(env.RETENTION_WEBHOOK_PAYLOAD_DAYS, 365)} days before payload redaction job may apply`,
    purchasesAndEntitlements: cleanText(env.RETENTION_PURCHASES, 180) || "Generally six years after the relevant accounting period, subject to Irish tax, legal, dispute, and chargeback requirements.",
    supportCases: cleanText(env.RETENTION_SUPPORT_CASES, 180) || "While open and generally 24 months after closure, unless a dispute, legal duty, or security investigation requires longer.",
    auditLogs: cleanText(env.RETENTION_AUDIT_LOGS, 180) || "Generally 24 months for security, abuse investigation, and operational accountability, subject to an active investigation.",
    accountDeletionRequests: cleanText(env.RETENTION_ACCOUNT_DELETION_REQUESTS, 180) || "Generally 24 months after resolution as evidence that the request was handled.",
    localStorage: "Stored on the learner device until cleared by the learner/browser or replaced by server sync.",
  };
}

function buildPolicyVersions(env) {
  return {
    privacy: cleanText(env.PRIVACY_POLICY_VERSION, 80) || DEFAULT_POLICY_VERSION,
    terms: cleanText(env.TERMS_POLICY_VERSION, 80) || DEFAULT_POLICY_VERSION,
    refunds: cleanText(env.REFUND_POLICY_VERSION, 80) || DEFAULT_POLICY_VERSION,
    accessibility: cleanText(env.ACCESSIBILITY_POLICY_VERSION, 80) || DEFAULT_POLICY_VERSION,
    contentMethodology: cleanText(env.CONTENT_METHODOLOGY_VERSION, 80) || DEFAULT_POLICY_VERSION,
    cookies: cleanText(env.COOKIE_NOTICE_VERSION, 80) || DEFAULT_POLICY_VERSION,
    dataRights: cleanText(env.DATA_RIGHTS_POLICY_VERSION, 80) || DEFAULT_POLICY_VERSION,
    security: cleanText(env.SECURITY_PAGE_VERSION, 80) || DEFAULT_POLICY_VERSION,
    cancellation: cleanText(env.CANCELLATION_POLICY_VERSION, 80) || DEFAULT_POLICY_VERSION,
  };
}

function buildPolicyEffectiveDates(env) {
  return {
    privacy: cleanDate(env.PRIVACY_POLICY_EFFECTIVE_DATE) || DEFAULT_POLICY_EFFECTIVE_DATE,
    terms: cleanDate(env.TERMS_POLICY_EFFECTIVE_DATE) || DEFAULT_POLICY_EFFECTIVE_DATE,
    refunds: cleanDate(env.REFUND_POLICY_EFFECTIVE_DATE) || DEFAULT_POLICY_EFFECTIVE_DATE,
    accessibility: cleanDate(env.ACCESSIBILITY_POLICY_EFFECTIVE_DATE) || DEFAULT_POLICY_EFFECTIVE_DATE,
    contentMethodology: cleanDate(env.CONTENT_METHODOLOGY_EFFECTIVE_DATE) || DEFAULT_POLICY_EFFECTIVE_DATE,
    cookies: cleanDate(env.COOKIE_NOTICE_EFFECTIVE_DATE) || DEFAULT_POLICY_EFFECTIVE_DATE,
    dataRights: cleanDate(env.DATA_RIGHTS_POLICY_EFFECTIVE_DATE) || DEFAULT_POLICY_EFFECTIVE_DATE,
    security: cleanDate(env.SECURITY_PAGE_EFFECTIVE_DATE) || DEFAULT_POLICY_EFFECTIVE_DATE,
    cancellation: cleanDate(env.CANCELLATION_POLICY_EFFECTIVE_DATE) || DEFAULT_POLICY_EFFECTIVE_DATE,
  };
}

function parseList(value, fallback = []) {
  const parsed = String(value || "")
    .split(/[;\n]/)
    .map((item) => cleanText(item, 180))
    .filter(Boolean);
  return parsed.length ? parsed : fallback;
}

function parseJsonList(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function cleanText(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return isValidEmail(email) ? email : "";
}

function placeholder(label) {
  return `${PLACEHOLDER}: ${label}`;
}

function placeholderEmail(label) {
  return `NOT_CONFIGURED_${label}@example.invalid`;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""));
}

function cleanDate(value) {
  const text = cleanText(value, 40);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function numberFromEnv(value, fallback) {
  const number = Number.parseInt(value || "", 10);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function stringBoolean(value, fallback) {
  if (String(value).toLowerCase() === "true") return true;
  if (String(value).toLowerCase() === "false") return false;
  return fallback;
}
