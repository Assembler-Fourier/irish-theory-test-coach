import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildBusinessConfig, isPlaceholder } from "../shared/business-config.js";
import { buildProductSummary, formatAccessDuration, formatInteger, formatUnlockCta } from "../shared/product-summary.js";
import {
  escapeHtml,
  pageMeta,
  siteFooter,
  siteHeader,
} from "../shared/static-components.js";
import { canonicalSiteOrigin } from "../shared/growth-config.js";

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), "..");
const publicDir = path.join(root, "public");
const siteUrl = canonicalSiteOrigin(process.env);
const ogImage = `${siteUrl}/marketing/og-home.svg`;
const business = buildBusinessConfig(process.env);
const summary = buildProductSummary({ root, env: process.env });
const disclaimer = "Independent practice tool. Not affiliated with RSA or Prometric.";

writePage("contact.html", contactPage());
writePage("privacy.html", privacyPage());
writePage("terms.html", termsPage());
writePage("refunds.html", refundsPage());
writePage("accessibility.html", accessibilityPage());
writePage("content-methodology.html", contentMethodologyPage());
updateSitemap();

console.log("Generated compliance pages: contact, privacy, terms, refunds, accessibility, content methodology.");

function contactPage() {
  return legalShell({
    file: "contact.html",
    title: "Contact Irish Theory Test Coach",
    description: "Contact Irish Theory Test Coach support for access, purchases, refunds, privacy requests, question corrections, and security reports.",
    h1: "Contact",
    policy: "contact",
    sections: [
      section("Operator identity", identityList()),
      section("Support email", `<p>Email <a data-support-email href="mailto:${escapeHtml(business.supportEmail)}">${escapeHtml(business.supportEmail)}</a> for product access, purchase help, instructor-code questions, or general support.</p>`),
      section("Response expectations", `<p>${escapeHtml(business.responseExpectations.support)}</p>`),
      section("Purchase support", `<p>Include the email used at checkout, approximate purchase time, and any Stripe receipt or checkout reference you have. Do not send card numbers; Stripe handles card details outside this website.</p>`),
      section("Question corrections", `<p>Use the <strong>Report a problem</strong> action shown after answering a question, or email support with the question ID and what looks wrong. Reports enter the editorial review workflow.</p>`),
      section("Urgent security contact", `<p>Email <a href="mailto:${escapeHtml(business.securityEmail)}">${escapeHtml(business.securityEmail)}</a>. Include affected URL, timestamp, safe reproduction notes, and do not include secrets or real payment card data.</p>`),
      section("Appointments", "<p>Irish Theory Test Coach cannot book, change, cancel, or manage RSA, Prometric, or any official theory-test appointments.</p>"),
    ],
  });
}

function privacyPage() {
  const retentionRows = Object.entries(business.retentionPeriods)
    .map(([key, value]) => `<tr><td>${label(key)}</td><td>${escapeHtml(value)}</td></tr>`)
    .join("");
  const processors = business.processors
    .map((processor) => `<li><strong>${escapeHtml(processor.name)}</strong>: ${escapeHtml(processor.purpose)} Data: ${escapeHtml((processor.dataCategories || []).join(", "))}. Location: ${escapeHtml(processor.location)}.</li>`)
    .join("");

  return legalShell({
    file: "privacy.html",
    title: "Privacy Notice - Irish Theory Test Coach",
    description: "Privacy notice for Irish Theory Test Coach covering accounts, payments, progress sync, analytics, cookies, processors, retention, export, deletion, and support.",
    h1: "Privacy Notice",
    policy: "privacy",
    sections: [
      section("Controller identity", `<p>${escapeHtml(business.legalTradingName)} operates ${escapeHtml(business.publicProductName)}. Operator type: ${escapeHtml(business.operatorType)}. Address: ${escapeHtml(business.registeredAddress)}.</p>`),
      section("Data collected", `<ul>
        <li>Email address used for checkout, restore access, support, export, deletion, instructor code redemption, or admin operations.</li>
        <li>Passwordless login token metadata, session hashes, device/browser technical metadata, and hashed IP-derived identifiers for abuse controls.</li>
        <li>Purchase records, Stripe identifiers, plan, entitlement dates, refund/dispute state, referral or instructor-code attribution, and accepted policy versions.</li>
        <li>Question attempts, selected answers, correctness, category, flags, missed questions, mock results, daily target/streak, and progress sync operations.</li>
        <li>First-party analytics events such as page views, preview starts, mode selections, paywall views, checkout clicks, restore starts/successes, and mock completions.</li>
        <li>Question problem reports, support cases, admin audit records, AI explanation cache entries, and content review metadata.</li>
      </ul>`),
      section("Purposes", `<ul>
        <li>Provide preview and paid learner access.</li>
        <li>Restore access across devices by email.</li>
        <li>Record entitlements, purchases, refunds, disputes, referral codes, and instructor codes.</li>
        <li>Sync progress, recommend review modes, and show category accuracy.</li>
        <li>Protect the service from abuse, scraping, replay, fraud, and unauthorized admin access.</li>
        <li>Improve content quality through reports, review queues, and aggregate learning analytics.</li>
      </ul>`),
      section("Configured lawful basis", `<p>${escapeHtml(business.privacyLawfulBasis)}</p>`),
      section("Processors", `<ul>${processors}</ul>`),
      section("Storage locations", `<ul>${business.storageLocations.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`),
      section("Retention", `<table class="compliance-table"><tbody>${retentionRows}</tbody></table>`),
      section("User rights", `<p>Use <a href="/account">account access</a> to export your data or request account deletion. You can also email <a href="mailto:${escapeHtml(business.privacyEmail)}">${escapeHtml(business.privacyEmail)}</a> for privacy requests, correction requests, or deletion support.</p>`),
      section("Complaint route", `<p>${escapeHtml(business.complaintRoute)}</p>`),
      section("Account deletion and export", "<p>Export is a working account action. Deletion is recorded as an account/support request so operational and legally required records can be reviewed before action.</p>"),
      section("Analytics behavior", "<p>Analytics are first-party events stored in the project database. The app does not use third-party advertising cookies. Anonymous IDs are generated locally and may be linked to a user only when logged in.</p>"),
      section("Cookies and local storage", "<p>The app uses an HttpOnly session cookie for login. Local storage may hold preview progress, offline sync queues, anonymous analytics ID, and old local unlock state for backwards compatibility. Clearing browser storage removes local-only data.</p>"),
      section("International transfers", `<p>${escapeHtml(business.internationalTransferBasis)}</p>`),
      section("Contact", `<p>Privacy email: <a href="mailto:${escapeHtml(business.privacyEmail)}">${escapeHtml(business.privacyEmail)}</a>.</p>`),
    ],
  });
}

function termsPage() {
  return legalShell({
    file: "terms.html",
    title: "Terms of Use - Irish Theory Test Coach",
    description: "Terms of use for Irish Theory Test Coach covering access duration, payment, account security, acceptable use, corrections, availability, suspension, IP, and jurisdiction placeholders.",
    h1: "Terms of Use",
    policy: "terms",
    sections: [
      section("Product identity", `<p>${escapeHtml(business.publicProductName)} is an independent Irish Category B theory-test practice product operated by ${escapeHtml(business.legalTradingName)}. ${disclaimer}</p>`),
      section("Access duration", `<p>Paid learner access is a one-time digital access period of ${formatAccessDuration(summary)} for the selected plan. Repeat purchases extend access according to server-side entitlement rules.</p>`),
      section("Permitted account use", "<p>Use your account for your own study, restore access by email, sync progress, export data, and contact support. Do not share access in a way that bypasses pricing or instructor-code limits.</p>"),
      section("Payment", `<p>Checkout is handled by Stripe. The browser cannot choose the price; the server uses configured Stripe price IDs. Prices are shown before checkout, including ${formatUnlockCta(summary)} for the active learner plan.</p>`),
      section("Account security", "<p>Magic links expire, are single-use, and should not be forwarded. You are responsible for keeping your email account secure and using logout-all if you suspect device access issues.</p>"),
      section("Acceptable use", "<p>Do not scrape, resell, reverse engineer protected content delivery, overload APIs, abuse restore emails, submit malicious content, attempt payment fraud, or access admin or learner data you are not authorized to use.</p>"),
      section("Content corrections", "<p>Use the question correction/report action or support email to flag wording, image, answer, explanation, category, or technical issues. Reports enter review; no correction is guaranteed to be immediate.</p>"),
      section("Service availability", "<p>The product is provided as a web app and may be unavailable during maintenance, provider outages, deployment, or abuse response. Offline mode is limited to preview shell/content where cached.</p>"),
      section("Suspension", "<p>Access, codes, sessions, or admin privileges may be revoked or suspended for abuse, fraud, payment reversal, security risk, or violation of these terms. Sensitive actions are audited.</p>"),
      section("Intellectual property", "<p>The app, design, code, explanations, question bank, generated materials, and derivatives are owned or licensed by the project owner/operator. Paid access does not transfer ownership.</p>"),
      section("Limitation wording placeholder", "<p>NOT_CONFIGURED: limitation of liability wording requires legal review before production launch.</p>"),
      section("Dispute and jurisdiction placeholder", `<p>Configured governing jurisdiction: ${escapeHtml(business.governingJurisdiction)}. Final dispute wording requires legal review.</p>`),
      section("Contact", `<p>Support email: <a data-support-email href="mailto:${escapeHtml(business.supportEmail)}">${escapeHtml(business.supportEmail)}</a>.</p>`),
    ],
  });
}

function refundsPage() {
  return legalShell({
    file: "refunds.html",
    title: "Refund Policy - Irish Theory Test Coach",
    description: "Refund policy for Irish Theory Test Coach digital study access, duplicate purchases, access issues, partial use, and support-assisted Stripe refunds.",
    h1: "Refund Policy",
    policy: "refunds",
    sections: [
      section("Digital access", `<p>Irish Theory Test Coach sells time-limited digital study access. The active learner plan is shown as ${summary.activePrice} for ${formatAccessDuration(summary)} before checkout.</p>`),
      section("When to contact us", `<p>Email <a href="mailto:${escapeHtml(business.refundEmail)}">${escapeHtml(business.refundEmail)}</a> if you purchased by mistake, bought duplicate access, cannot access the product because of a technical issue we cannot resolve, or believe a payment/referral/code was recorded incorrectly.</p>`),
      section("Operational refund behavior", "<p>Refunds are reviewed through support or Stripe dashboard-assisted workflow. The admin system can record refunds, partial refunds, disputes, entitlement effects, actor, reason, Stripe object, and timestamp. It does not promise instant automatic refunds from the public website.</p>"),
      section("Information to include", "<p>Include the checkout email, approximate purchase time, the plan, and the issue. Do not send card numbers or full payment credentials.</p>"),
      section("When refunds may be declined", "<p>Refunds may be declined where access was delivered and substantially used, where the request is abusive or fraudulent, or where the issue can reasonably be resolved by restoring access.</p>"),
      section("No outcome refunds", "<p>Refunds are not offered because of a driving theory-test outcome. The product is a practice tool and does not guarantee a pass.</p>"),
      section("Contact", `<p>Refund email: <a href="mailto:${escapeHtml(business.refundEmail)}">${escapeHtml(business.refundEmail)}</a>.</p>`),
    ],
  });
}

function accessibilityPage() {
  return legalShell({
    file: "accessibility.html",
    title: "Accessibility Statement - Irish Theory Test Coach",
    description: "Accessibility statement for Irish Theory Test Coach, including WCAG target, known limitations, contact route, and last automated accessibility test date.",
    h1: "Accessibility Statement",
    policy: "accessibility",
    sections: [
      section("Target", "<p>The product targets WCAG 2.2 AA behavior for keyboard navigation, focus states, semantic headings, labels, contrast, reduced motion, dialogs, timers, and screen-reader announcements.</p>"),
      section("Recent testing", "<p>Last automated accessibility test: July 11, 2026. The QA suite ran axe checks across 7 states with 0 critical violations.</p>"),
      section("Known limitations", "<ul><li>Some generated marketing graphics are illustrative SVG previews and may not convey every UI detail.</li><li>Long legal/compliance tables may require careful scrolling on small screens.</li><li>AI explanation fallback text is concise and may not replace human review for complex corrections.</li></ul>"),
      section("Contact route", `<p>Email <a data-support-email href="mailto:${escapeHtml(business.supportEmail)}">${escapeHtml(business.supportEmail)}</a> with the page URL, device/browser, assistive technology if relevant, and the barrier you found.</p>`),
    ],
  });
}

function contentMethodologyPage() {
  return legalShell({
    file: "content-methodology.html",
    title: "Content Methodology - Irish Theory Test Coach",
    description: "How Irish Theory Test Coach creates, reviews, scores, updates, and corrects independent Irish Category B practice questions.",
    h1: "Content Methodology",
    policy: "contentMethodology",
    sections: [
      section("Independent status", `<p>${disclaimer} Questions are not presented as official live exam questions, official RSA material, official Prometric material, or official exam-frequency predictions.</p>`),
      section("How questions are created", "<p>The question bank contains project-owned or permitted material, recovered material, and generated/derived material under the owner instructions for this repository. AI-generated questions are draft-only until admin review.</p>"),
      section("How content is reviewed", "<p>The content pipeline tracks canonical categories, original metadata, duplicate groups, near duplicates, conflicts, lint findings, source/review metadata, learner reports, admin decisions, and version history. Structural validation does not automatically mean factual verification.</p>"),
      section("Estimated priority", "<p>Estimated priority combines transparent study signals such as archived-hardest signal, road-sign/image signal, safety-critical wording, legal-consequence wording, category priority, and user miss-rate signals when available. It is not official exam frequency.</p>"),
      section("Learner performance", "<p>Attempts, missed questions, flags, category accuracy, mock results, and mode history inform recommendations such as review mode, road signs, high-yield drills, or mock practice. Admin analytics use aggregate trends without claiming statistical significance when data is limited.</p>"),
      section("Corrections", "<p>Learners can report a problem after answering a question. Reports capture question ID, reason category, optional comment, app/content version, and anonymous or account identifier. Admin review can edit, approve, reject, publish, archive, or record a versioned decision.</p>"),
      section("Current content version", `<p>Content version: <code>${escapeHtml(summary.contentVersion)}</code>. Published question count: ${formatInteger(summary.totalPublishedQuestions)}. Estimated-priority question count: ${formatInteger(summary.estimatedPriorityQuestionCount)}.</p>`),
    ],
  });
}

function legalShell({ file, title, description, h1, policy, sections }) {
  const canonical = `${siteUrl}/${file}`;
  const policyVersion = business.policyVersions[policy] || business.policyVersions.terms;
  const effectiveDate = business.policyEffectiveDates[policy] || business.policyEffectiveDates.terms;
  const breadcrumbJson = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${siteUrl}/` },
      { "@type": "ListItem", position: 2, name: h1, item: canonical },
    ],
  });
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    ${pageMeta({ title, description, canonical, ogImage })}
    <link rel="manifest" href="./manifest.webmanifest">
    <link rel="icon" href="./icons/app-icon.svg" type="image/svg+xml">
    <link rel="stylesheet" href="./styles.css?v=20260710-rebuild">
    <script type="application/ld+json">${breadcrumbJson}</script>
  </head>
  <body>
    <div class="shell legal-shell">
      ${siteHeader({ active: "support", root: "" })}
      <main class="legal-page">
        <h1>${escapeHtml(h1)}</h1>
        <p class="policy-meta">Effective date: ${escapeHtml(effectiveDate)}. Policy version: <code>${escapeHtml(policyVersion)}</code>.</p>
        ${launchBlocker()}
        ${sections.join("\n        ")}
      </main>
      ${siteFooter({ root: "", disclaimer })}
    </div>
    <script src="./config.js?v=20260710-rebuild"></script>
    <script src="./business-config.js?v=20260710-rebuild"></script>
    <script src="./trust.js?v=20260710-rebuild"></script>
  </body>
</html>
`;
}

function section(title, body) {
  return `<section><h2>${escapeHtml(title)}</h2>${body}</section>`;
}

function identityList() {
  return `<dl class="compliance-list">
        <div><dt>Legal trading name</dt><dd>${placeholderMarkup(business.legalTradingName)}</dd></div>
        <div><dt>Public product name</dt><dd>${escapeHtml(business.publicProductName)}</dd></div>
        <div><dt>Operator type</dt><dd>${placeholderMarkup(business.operatorType)}</dd></div>
        <div><dt>Registered address</dt><dd>${placeholderMarkup(business.registeredAddress)}</dd></div>
        <div><dt>Business registration number</dt><dd>${placeholderMarkup(business.businessRegistrationNumber)}</dd></div>
        <div><dt>VAT number</dt><dd>${placeholderMarkup(business.vatNumber)}</dd></div>
        <div><dt>Governing jurisdiction</dt><dd>${placeholderMarkup(business.governingJurisdiction)}</dd></div>
      </dl>`;
}

function launchBlocker() {
  if (!business.launchBlockers.length) return "";
  return `<aside class="launch-blocker" role="note">
          <strong>Launch blocker</strong>
          <p>Mandatory commercial identity fields are not fully configured.</p>
          <ul>${business.launchBlockers.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
        </aside>`;
}

function placeholderMarkup(value) {
  const escaped = escapeHtml(value);
  return isPlaceholder(value) ? `<span class="placeholder-value">${escaped}</span>` : escaped;
}

function label(value) {
  return String(value || "")
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function writePage(fileName, html) {
  fs.writeFileSync(path.join(publicDir, fileName), cleanHtml(html), "utf8");
}

function updateSitemap() {
  const sitemapPath = path.join(publicDir, "sitemap.xml");
  if (!fs.existsSync(sitemapPath)) return;
  let sitemap = fs.readFileSync(sitemapPath, "utf8");
  const additions = [
    ["/accessibility.html", "monthly", "0.4"],
    ["/content-methodology.html", "monthly", "0.5"],
  ].filter(([pathname]) => !sitemap.includes(`<loc>${siteUrl}${pathname}</loc>`));
  if (!additions.length) return;
  const extra = additions.map(([pathname, changefreq, priority]) => `  <url>
    <loc>${siteUrl}${pathname}</loc>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`).join("\n");
  sitemap = sitemap.replace("</urlset>", `${extra}\n</urlset>`);
  fs.writeFileSync(sitemapPath, sitemap, "utf8");
}

function cleanHtml(html) {
  return String(html).replace(/[ \t]+$/gm, "");
}
