window.BUSINESS_CONFIG = {
  "configVersion": 2,
  "publicProductName": "Irish Theory Test Coach",
  "legalTradingName": "NOT_CONFIGURED: legal trading name",
  "operatorType": "NOT_CONFIGURED: operator type",
  "publicOperatorLocation": "Dublin, Ireland",
  "supportEmail": "NOT_CONFIGURED_support@example.invalid",
  "privacyEmail": "NOT_CONFIGURED_support@example.invalid",
  "refundEmail": "NOT_CONFIGURED_support@example.invalid",
  "securityEmail": "NOT_CONFIGURED_support@example.invalid",
  "governingJurisdiction": "NOT_CONFIGURED: governing jurisdiction",
  "privacyLawfulBasis": "NOT_CONFIGURED: lawful basis for processing",
  "complaintRoute": "NOT_CONFIGURED: data-protection complaint route",
  "internationalTransferBasis": "NOT_CONFIGURED: international transfer basis",
  "storageLocations": [
    "Vercel deployment regions",
    "Neon Postgres hosting region",
    "Stripe payment infrastructure"
  ],
  "processors": [
    {
      "name": "Vercel",
      "purpose": "Hosting, serverless functions, deployment logs, and static asset delivery.",
      "dataCategories": [
        "IP-derived request metadata",
        "technical logs",
        "website content"
      ],
      "location": "Configured through Vercel project settings"
    },
    {
      "name": "Neon",
      "purpose": "Postgres database for accounts, entitlements, progress, support, analytics, and audit records.",
      "dataCategories": [
        "email",
        "progress",
        "entitlements",
        "support records",
        "analytics events"
      ],
      "location": "Configured through Neon project settings"
    },
    {
      "name": "Stripe",
      "purpose": "Checkout, payment processing, refunds, disputes, and payment event webhooks.",
      "dataCategories": [
        "checkout email",
        "payment status",
        "Stripe identifiers"
      ],
      "location": "Stripe infrastructure"
    }
  ],
  "retentionPeriods": {
    "loginTokens": "30 days after expiry",
    "sessions": "180 days after expiry; revoked sessions 90 days",
    "anonymousAnalytics": "180 days",
    "webhookPayloadMetadata": "365 days before payload redaction job may apply",
    "purchasesAndEntitlements": "Generally six years after the relevant accounting period, subject to Irish tax, legal, dispute, and chargeback requirements.",
    "supportCases": "While open and generally 24 months after closure, unless a dispute, legal duty, or security investigation requires longer.",
    "auditLogs": "Generally 24 months for security, abuse investigation, and operational accountability, subject to an active investigation.",
    "accountDeletionRequests": "Generally 24 months after resolution as evidence that the request was handled.",
    "localStorage": "Stored on the learner device until cleared by the learner/browser or replaced by server sync."
  },
  "policyEffectiveDates": {
    "privacy": "2026-07-15",
    "terms": "2026-07-15",
    "refunds": "2026-07-15",
    "accessibility": "2026-07-15",
    "contentMethodology": "2026-07-15",
    "cookies": "2026-07-15",
    "dataRights": "2026-07-15",
    "security": "2026-07-15",
    "cancellation": "2026-07-15"
  },
  "policyVersions": {
    "privacy": "2026-07-15-v1",
    "terms": "2026-07-15-v1",
    "refunds": "2026-07-15-v1",
    "accessibility": "2026-07-15-v1",
    "contentMethodology": "2026-07-15-v1",
    "cookies": "2026-07-15-v1",
    "dataRights": "2026-07-15-v1",
    "security": "2026-07-15-v1",
    "cancellation": "2026-07-15-v1"
  },
  "responseExpectations": {
    "support": "We aim to respond to support messages within 2 business days.",
    "privacy": "We normally respond to valid privacy requests within one month after any necessary identity verification.",
    "security": "We aim to acknowledge credible urgent security reports promptly and prioritize them by impact."
  },
  "launchBlockers": [
    "Configure legalTradingName.",
    "Configure operatorType.",
    "Configure registeredAddress.",
    "Configure supportEmail.",
    "Configure privacyEmail.",
    "Configure refundEmail.",
    "Configure governingJurisdiction.",
    "Configure privacyLawfulBasis.",
    "Configure internationalTransferBasis.",
    "Configure complaintRoute."
  ]
};
