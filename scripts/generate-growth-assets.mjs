import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildGrowthConfig,
  publicGrowthConfig,
  SOCIAL_IMAGE_TARGETS,
} from "../shared/growth-config.js";

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), "..");
const publicDir = path.join(root, "public");
const marketingDir = path.join(publicDir, "marketing");
const docsGrowthDir = path.join(root, "docs", "growth");
const reportsGrowthDir = path.join(root, "reports", "growth");
const config = buildGrowthConfig(process.env);
const publicConfig = publicGrowthConfig(config);

fs.mkdirSync(publicDir, { recursive: true });
fs.mkdirSync(marketingDir, { recursive: true });
fs.mkdirSync(docsGrowthDir, { recursive: true });
fs.mkdirSync(reportsGrowthDir, { recursive: true });

writePublicJson("growth-config.json", publicConfig);
writePublicJs("growth-config.js", "GROWTH_CONFIG", publicConfig);
for (const target of SOCIAL_IMAGE_TARGETS) {
  fs.writeFileSync(path.join(marketingDir, target.file), socialOgSvg(target), "utf8");
}

writeDoc("analytics-event-catalogue.md", analyticsCatalogue());
writeDoc("conversion-dashboard-guide.md", conversionDashboardGuide());
writeDoc("search-console-setup.md", searchConsoleSetup());
writeDoc("seo-content-map.md", seoContentMap());
writeReport("seo-audit.md", seoAudit());
writeReport("performance-audit.md", performanceAudit());

console.log(`Generated growth assets, ${config.funnelEvents.length} funnel definitions, and ${SOCIAL_IMAGE_TARGETS.length} OG images.`);

function writePublicJson(file, data) {
  fs.writeFileSync(path.join(publicDir, file), `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function writePublicJs(file, globalName, data) {
  fs.writeFileSync(path.join(publicDir, file), `window.${globalName} = ${JSON.stringify(data, null, 2)};\n`, "utf8");
}

function writeDoc(file, body) {
  fs.writeFileSync(path.join(docsGrowthDir, file), body, "utf8");
}

function writeReport(file, body) {
  fs.writeFileSync(path.join(reportsGrowthDir, file), body, "utf8");
}

function analyticsCatalogue() {
  return `# Analytics Event Catalogue

Schema version: ${config.schemaVersion}

Irish Theory Test Coach uses first-party analytics only. Events must not contain raw emails, full query strings, payment card data, magic links, session cookies, login tokens, database IDs exposed unnecessarily, or official/pass-guarantee claims.

## Funnel

${config.funnelEvents.map((event, index) => `### ${index + 1}. \`${event.eventName}\`

- Label: ${event.label}
- Definition: ${event.definition}
- Duplicate prevention: ${event.duplicatePolicy}`).join("\n\n")}

## Behaviour Events

${config.behaviourEvents.map((event) => `- \`${event}\``).join("\n")}

## Attribution

Allowed attribution keys:

${config.attributionKeys.map((key) => `- \`${key}\``).join("\n")}

First touch is set once per anonymous browser profile. Last touch updates when a new safe UTM/referral/instructor signal appears. Arbitrary query parameters are discarded.

## Reliability

- Client event IDs are generated before queuing.
- Events include schema version and client timestamp.
- Events queue in local storage and flush in small batches.
- Failed submissions retry with bounded exponential backoff.
- Server validation enforces allowed names, allowed property keys, allowed attribution keys, and idempotency.
- Abuse controls are handled by the analytics API rate limit and safe body-size limits.
- Environment is stored server-side.
`;
}

function conversionDashboardGuide() {
  return `# Conversion Dashboard Guide

The admin analytics section reports directional growth metrics without pretending small samples are conclusive.

## Core Rates

- Landing to preview: \`start_free_practice / landing_view\`
- Preview to paywall: \`paywall_viewed / preview_started\`
- Paywall to checkout: \`checkout_started / paywall_viewed\`
- Checkout to purchase: \`checkout_completed / checkout_started\`
- Purchase to first paid session: \`first_paid_session / checkout_completed\`
- Mock completion: \`first_mock_completed / first_mock_started\`
- Restore success: \`access_restored / restore_access_started\`

Rates below 30 denominator events are labelled directional. Do not make pricing or marketing claims from tiny samples.

## Source And Referral Conversion

Use first-touch and last-touch attribution to compare:

- UTM source/medium/campaign/content
- Referral code
- Instructor code
- Landing page

The dashboard must not expose card data, secrets, raw tokens, or full personal query values.
`;
}

function searchConsoleSetup() {
  return `# Search Console Setup

Canonical origin configured for this build: ${config.canonicalOrigin}

## Launch Steps

1. Connect the final custom domain in Vercel.
2. Set \`PUBLIC_CANONICAL_ORIGIN\` or \`PUBLIC_SITE_URL\` to the final HTTPS origin.
3. Rebuild and verify no production canonical metadata points to the Vercel preview domain.
4. Verify a domain property in Google Search Console.
5. Submit \`${config.canonicalOrigin}/sitemap.xml\`.
6. Inspect priority URLs:
   - \`${config.canonicalOrigin}/\`
   - \`${config.canonicalOrigin}/app\`
   - \`${config.canonicalOrigin}/pricing\`
   - \`${config.canonicalOrigin}/mock-exam\`
   - \`${config.canonicalOrigin}/road-signs\`
   - \`${config.canonicalOrigin}/learn\`
   - \`${config.canonicalOrigin}/category-b-theory-test-ireland.html\`
7. In URL Inspection, check rendered HTML, canonical URL, mobile usability, and screenshot.
8. Request indexing for priority pages after the production deployment is stable.
9. Review indexing, impressions, clicks, CTR, and average position weekly.

## Guardrails

- Do not request indexing for admin/private pages.
- Do not add review/rating schema without real visible reviews.
- Keep independent RSA/Prometric non-affiliation visible.
- Do not mass-produce near-identical pages.

## References

- Google Search Console ownership verification: https://support.google.com/webmasters/answer/9008080
- Google sitemap guidance: https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
- Google canonical guidance: https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls
`;
}

function seoContentMap() {
  const pages = [
    ["/", "Commercial homepage", "brand + Irish theory test practice intent", "Start free preview"],
    ["/app", "Learner app", "practice workflow", "Answer preview questions"],
    ["/pricing", "Pricing", "price comparison and purchase intent", "Unlock full coach"],
    ["/learn", "Learning hub", "guide navigation", "Choose next study route"],
    ["/road-signs", "Road signs", "road-sign practice", "Practise road signs"],
    ["/mock-exam", "Mock exam", "40-question mock practice", "Start mock practice"],
    ["/for-driving-instructors.html", "Instructor page", "instructor referral/code intent", "Request codes"],
    ["/failed-theory-test-ireland.html", "Failed test recovery", "recovery plan", "Restart with review mode"],
  ];

  return `# SEO Content Map

Canonical origin: ${config.canonicalOrigin}

| URL | Page Type | Primary Intent | CTA |
| --- | --- | --- | --- |
${pages.map((row) => `| ${row.map(escapePipes).join(" | ")} |`).join("\n")}

## Consolidation Rules

- Keep one page per distinct search intent.
- Redirect or canonicalise pages that become thin duplicates.
- Preserve useful legacy URLs only when they target distinct wording or backlink value.
- Do not claim official RSA/Prometric status, guaranteed passing, or official exam frequency.
`;
}

function seoAudit() {
  return `# SEO Audit

Generated by \`npm run build\` from the shared growth configuration.

## Checks Covered

- Unique titles and descriptions are enforced by \`npm run check:seo\`.
- Canonical URLs are generated from \`${config.canonicalOrigin}\`.
- Sitemaps are generated with absolute URLs and validated against public files.
- JSON-LD is limited to visible page content: BreadcrumbList, FAQPage where visible, WebSite, and SoftwareApplication where relevant.
- Review/rating schema is intentionally absent because no real public review system exists.
- Important pages are linked through homepage, footer, learning hub, related links, and sitemap.

## Consolidation Notes

- Legacy SEO URLs remain as useful entry points while canonical metadata stays consistent.
- Thin or overlapping pages should be consolidated only after Search Console data shows cannibalisation.
- Do not mass-produce near-identical pages for every keyword variation.

## Remaining Manual Review

- Check Search Console after domain launch for duplicate intent and unexpected canonical selection.
- Review pages with low impressions/clicks quarterly before creating more content.
- Confirm social preview images after production deployment.

## References

- Google structured-data general guidelines: https://developers.google.com/search/docs/appearance/structured-data/sd-policies
- Google canonical guidance: https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls
- Google sitemap guidance: https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
`;
}

function performanceAudit() {
  const budgetRows = Object.entries(config.performanceBudgets)
    .map(([key, value]) => `| \`${key}\` | ${value} |`)
    .join("\n");
  return `# Performance Audit

Generated by \`npm run build\` from the shared growth configuration.

## Budgets

| Budget | Target |
| --- | ---: |
${budgetRows}

## Enforced Locally

- HTML page size.
- CSS size.
- JavaScript size for public app assets.
- Landing pages must not load \`app.js\`.
- Landing pages must not reference the full question bank.
- Images must declare width, height, and loading mode.
- Initial SVG social/marketing assets stay within file-size limits.

## Runtime Budgets For Production Monitoring

- API latency p75 target: ${config.performanceBudgets.apiLatencyMsP75} ms.
- LCP target: ${config.performanceBudgets.lcpMs} ms.
- CLS target: ${config.performanceBudgets.cls}.
- INP target: ${config.performanceBudgets.inpMs} ms.

These runtime metrics require production measurement through browser/API monitoring; local CI enforces the static budgets that can be checked without external telemetry.

## References

- Largest Contentful Paint: https://web.dev/articles/lcp
- Cumulative Layout Shift: https://web.dev/articles/cls
- Interaction to Next Paint: https://web.dev/articles/inp
`;
}

function socialOgSvg(target) {
  const accent = accentFor(target.key);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(target.title)}</title>
  <desc id="desc">${escapeXml(target.subtitle)}</desc>
  <rect width="1200" height="630" rx="0" fill="#f5f7f8"/>
  <rect x="54" y="54" width="1092" height="522" rx="34" fill="#ffffff" stroke="#d8e0e7" stroke-width="2"/>
  <rect x="88" y="88" width="1024" height="454" rx="26" fill="#f8faf9"/>
  <circle cx="1022" cy="168" r="74" fill="${accent}" opacity="0.18"/>
  <circle cx="968" cy="226" r="34" fill="${accent}" opacity="0.28"/>
  <rect x="124" y="126" width="130" height="46" rx="23" fill="#1f4f46"/>
  <text x="152" y="156" fill="#ffffff" font-family="Arial, sans-serif" font-size="21" font-weight="700">Theory Coach</text>
  <text x="124" y="254" fill="#17212b" font-family="Arial, sans-serif" font-size="64" font-weight="800">${escapeXml(target.title)}</text>
  <text x="128" y="322" fill="#52606a" font-family="Arial, sans-serif" font-size="32" font-weight="600">${escapeXml(target.subtitle)}</text>
  <text x="128" y="414" fill="#1f4f46" font-family="Arial, sans-serif" font-size="26" font-weight="700">Independent practice tool. Not affiliated with RSA or Prometric.</text>
  <g transform="translate(804 332)">
    <rect width="248" height="116" rx="20" fill="#ffffff" stroke="#d8e0e7"/>
    <rect x="28" y="28" width="52" height="52" rx="14" fill="${accent}"/>
    <rect x="98" y="34" width="114" height="14" rx="7" fill="#b8c4cc"/>
    <rect x="98" y="62" width="84" height="14" rx="7" fill="#d8e0e7"/>
  </g>
</svg>
`;
}

function accentFor(key) {
  if (key === "pricing") return "#b18a00";
  if (key === "mock-exam") return "#4263eb";
  if (key === "road-signs") return "#cf3e3e";
  if (key === "learn") return "#6b5dd3";
  if (key === "instructors") return "#087b57";
  return "#8bbf24";
}

function escapePipes(value) {
  return String(value).replace(/\|/g, "\\|");
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
