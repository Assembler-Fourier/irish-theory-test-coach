export const ANALYTICS_SCHEMA_VERSION = 2;
export const DEFAULT_CANONICAL_ORIGIN = "https://irishtheorycoach.ie";

export const FUNNEL_EVENTS = [
  {
    eventName: "landing_view",
    label: "Landing view",
    definition: "A visitor loads the homepage, SEO landing page, pricing page, learning hub, road-sign page, mock-exam page, instructor page, or other public marketing entry page.",
    duplicatePolicy: "At most once per page load per path.",
  },
  {
    eventName: "start_free_practice",
    label: "Start free practice",
    definition: "A visitor clicks a visible Start free preview/practice CTA that navigates into the learner app.",
    duplicatePolicy: "At most once per session.",
  },
  {
    eventName: "preview_started",
    label: "Preview started",
    definition: "The learner app successfully loads the free preview question package for an unpaid visitor.",
    duplicatePolicy: "At most once per anonymous learner lifetime.",
  },
  {
    eventName: "first_answer",
    label: "First answer",
    definition: "The learner submits the first answer recorded for the current anonymous learner.",
    duplicatePolicy: "At most once per anonymous learner lifetime.",
  },
  {
    eventName: "preview_engaged",
    label: "Preview engaged",
    definition: "An unpaid learner answers at least three preview questions or reaches the preview answer CTA.",
    duplicatePolicy: "At most once per anonymous learner lifetime.",
  },
  {
    eventName: "paywall_viewed",
    label: "Paywall viewed",
    definition: "A premium-mode or preview-completion paywall is shown to an unpaid learner.",
    duplicatePolicy: "At most once per page session for the same source and mode.",
  },
  {
    eventName: "checkout_started",
    label: "Checkout started",
    definition: "The server successfully creates a Stripe Checkout session and the browser is about to redirect.",
    duplicatePolicy: "Idempotent by event ID; button loading prevents double-click duplicates.",
  },
  {
    eventName: "checkout_completed",
    label: "Checkout completed",
    definition: "The learner returns from Stripe success and session verification/entitlement refresh succeeds client-side, while webhook remains the authority for access recording.",
    duplicatePolicy: "At most once per returned Stripe session in the browser.",
  },
  {
    eventName: "access_restored",
    label: "Access restored",
    definition: "A magic-link restore request succeeds or an account session with active entitlement is restored.",
    duplicatePolicy: "At most once per successful restore interaction.",
  },
  {
    eventName: "first_paid_session",
    label: "First paid session",
    definition: "An entitled learner starts their first premium study session after access is active.",
    duplicatePolicy: "At most once per anonymous learner lifetime.",
  },
  {
    eventName: "first_mock_started",
    label: "First mock started",
    definition: "An entitled learner starts the first timed mock session tracked for the current anonymous learner.",
    duplicatePolicy: "At most once per anonymous learner lifetime.",
  },
  {
    eventName: "first_mock_completed",
    label: "First mock completed",
    definition: "An entitled learner completes the first timed mock session tracked for the current anonymous learner.",
    duplicatePolicy: "At most once per anonymous learner lifetime.",
  },
  {
    eventName: "return_visit",
    label: "Return visit",
    definition: "A visitor returns in a later browser session after a prior landing or app visit.",
    duplicatePolicy: "At most once per browser session.",
  },
];

export const BEHAVIOUR_EVENTS = [
  "page_view",
  "question_answered",
  "answer_correct",
  "answer_wrong",
  "mode_selected",
  "checkout_clicked",
  "checkout_success",
  "restore_access_clicked",
  "restore_access_started",
  "restore_access_success",
  "pricing_page_viewed",
  "referral_code_viewed",
  "referral_code_applied",
  "referral_checkout_started",
  "referral_purchase_completed",
  "mock_started",
  "mock_completed",
  "frontend_error",
];

export const ATTRIBUTION_KEYS = [
  "utmSource",
  "utmMedium",
  "utmCampaign",
  "utmContent",
  "landingPage",
  "referralCode",
  "instructorCode",
];

export const EXPERIMENT_FLAGS = [
  {
    key: "hero_copy",
    label: "Hero copy",
    variants: ["control", "structured_study"],
    defaultVariant: "control",
  },
  {
    key: "cta_copy",
    label: "CTA copy",
    variants: ["start_free_preview", "start_free_practice"],
    defaultVariant: "start_free_preview",
  },
  {
    key: "pricing_presentation",
    label: "Pricing presentation",
    variants: ["comparison_first", "full_pass_first"],
    defaultVariant: "comparison_first",
  },
  {
    key: "preview_length",
    label: "Preview length presentation",
    variants: ["show_15", "show_daily_target"],
    defaultVariant: "show_15",
  },
  {
    key: "paywall_timing",
    label: "Paywall timing",
    variants: ["on_premium_request", "after_engagement"],
    defaultVariant: "on_premium_request",
  },
];

export const PERFORMANCE_BUDGETS = {
  htmlBytes: 140_000,
  cssBytes: 190_000,
  javascriptBytes: 260_000,
  initialImageBytes: 95_000,
  fontBytes: 0,
  apiLatencyMsP75: 800,
  lcpMs: 2500,
  cls: 0.1,
  inpMs: 200,
  maxSeoAppBundleLoads: 0,
};

export const SOCIAL_IMAGE_TARGETS = [
  { key: "home", file: "og-home.svg", title: "Irish Theory Test Coach", subtitle: "Independent Category B practice" },
  { key: "pricing", file: "og-pricing.svg", title: "Transparent Pricing", subtitle: "Free preview and Full Study Pass" },
  { key: "mock-exam", file: "og-mock-exam.svg", title: "Mock Exam Practice", subtitle: "40-question timed study flow" },
  { key: "road-signs", file: "og-road-signs.svg", title: "Road Signs Practice", subtitle: "Recognition-first visual drills" },
  { key: "learn", file: "og-learn.svg", title: "Learning Hub", subtitle: "Study routes, road signs, mocks, support" },
  { key: "instructors", file: "og-instructors.svg", title: "For Driving Instructors", subtitle: "Student code packs and referrals" },
];

export function buildGrowthConfig(env = process.env) {
  const canonicalOrigin = canonicalSiteOrigin(env);
  return {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    canonicalOrigin,
    funnelEvents: FUNNEL_EVENTS,
    behaviourEvents: BEHAVIOUR_EVENTS,
    attributionKeys: ATTRIBUTION_KEYS,
    experiments: buildExperiments(env),
    performanceBudgets: PERFORMANCE_BUDGETS,
    socialImages: SOCIAL_IMAGE_TARGETS.map((item) => ({
      ...item,
      url: `${canonicalOrigin}/marketing/${item.file}`,
    })),
  };
}

export function canonicalSiteOrigin(env = process.env) {
  const raw = env.PUBLIC_CANONICAL_ORIGIN || env.PUBLIC_SITE_URL || DEFAULT_CANONICAL_ORIGIN;
  try {
    return new URL(raw).origin.replace(/\/+$/, "");
  } catch {
    return DEFAULT_CANONICAL_ORIGIN;
  }
}

export function allowedEventNames() {
  return new Set([...FUNNEL_EVENTS.map((event) => event.eventName), ...BEHAVIOUR_EVENTS]);
}

export function buildExperiments(env = process.env) {
  return EXPERIMENT_FLAGS.map((flag) => {
    const envKey = `EXPERIMENT_${flag.key.toUpperCase()}`;
    const configured = cleanText(env[envKey], 40);
    const variant = flag.variants.includes(configured) ? configured : flag.defaultVariant;
    return {
      ...flag,
      activeVariant: variant,
      clientSafe: true,
      securityNote: flag.key === "pricing_presentation"
        ? "Presentation-only. The server remains authoritative for Stripe price IDs and charged price."
        : "Presentation-only. No fake scarcity or outcome-promise wording.",
    };
  });
}

export function publicGrowthConfig(config) {
  return {
    schemaVersion: config.schemaVersion,
    canonicalOrigin: config.canonicalOrigin,
    funnelEvents: config.funnelEvents.map(({ eventName, label, duplicatePolicy }) => ({ eventName, label, duplicatePolicy })),
    attributionKeys: config.attributionKeys,
    experiments: config.experiments.map(({ key, activeVariant }) => ({ key, activeVariant })),
    performanceBudgets: config.performanceBudgets,
    socialImages: config.socialImages,
  };
}

function cleanText(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}
