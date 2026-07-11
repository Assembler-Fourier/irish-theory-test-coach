window.BUSINESS_CONFIG = {
  "configVersion": 1,
  "publicProductName": "Irish Theory Test Coach",
  "legalTradingName": "NOT_CONFIGURED: legal trading name",
  "operatorType": "NOT_CONFIGURED: operator type",
  "registeredAddress": "NOT_CONFIGURED: registered address",
  "businessRegistrationNumber": "NOT_CONFIGURED: business registration number, if applicable",
  "vatNumber": "NOT_CONFIGURED: VAT number, if applicable",
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
    "purchasesAndEntitlements": "Retained as operational payment/access records unless deletion is legally required and approved.",
    "supportCases": "Retained while open and for operational history after closure; final production period requires legal review.",
    "auditLogs": "Retained for operational security and abuse investigation; final production period requires legal review.",
    "accountDeletionRequests": "Retained as a record of the request and resolution.",
    "localStorage": "Stored on the learner device until cleared by the learner/browser or replaced by server sync."
  },
  "policyEffectiveDates": {
    "privacy": "2026-07-11",
    "terms": "2026-07-11",
    "refunds": "2026-07-11",
    "accessibility": "2026-07-11",
    "contentMethodology": "2026-07-11"
  },
  "policyVersions": {
    "privacy": "2026-07-pass9-draft",
    "terms": "2026-07-pass9-draft",
    "refunds": "2026-07-pass9-draft",
    "accessibility": "2026-07-pass9-draft",
    "contentMethodology": "2026-07-pass9-draft"
  },
  "responseExpectations": {
    "support": "We aim to respond to support messages within 2 business days after launch configuration is complete.",
    "privacy": "Privacy requests are triaged by email and handled according to the configured legal workflow.",
    "security": "Urgent security reports should include affected URLs, timestamps, and safe reproduction details."
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
