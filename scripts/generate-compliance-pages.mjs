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
writePage("legal.html", legalCentrePage());
writePage("privacy.html", privacyPage());
writePage("data-rights.html", dataRightsPage());
writePage("cookies.html", cookiesPage());
writePage("terms.html", termsPage());
writePage("refunds.html", refundsPage());
writePage("cancellation.html", cancellationPage());
writePage("security.html", securityPage());
writePage("accessibility.html", accessibilityPage());
writePage("content-methodology.html", contentMethodologyPage());
updateSitemap();

console.log("Generated compliance pages: legal centre, contact, privacy, data rights, cookies, terms, refunds, cancellation, security, accessibility, content methodology.");

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
      section("Privacy and data rights", `<p>See the <a href="/data-rights.html">Data Rights page</a> for access, correction, restriction, objection, portability, deletion, and complaint routes. Privacy requests normally receive a response within one month after necessary identity verification, subject to lawful extensions.</p>`),
      section("Appointments", "<p>Irish Theory Test Coach cannot book, change, cancel, or manage RSA, Prometric, or any official theory-test appointments.</p>"),
    ],
  });
}

function legalCentrePage() {
  return legalShell({
    file: "legal.html",
    title: "Legal and Trust Centre - Irish Theory Test Coach",
    description: "Legal, privacy, consumer-rights, accessibility, security, refund, cancellation, and content-methodology information for Irish Theory Test Coach.",
    h1: "Legal and Trust Centre",
    policy: "terms",
    sections: [
      section("Clear information before purchase", `<p>${escapeHtml(business.publicProductName)} shows the one-time price, ${formatInteger(summary.accessDurationDays)}-day access duration, included features, support route, terms, privacy notice, refund policy, and cancellation information before checkout.</p>`),
      section("Policies and rights", legalCardGrid([
        ["Terms & Conditions", "/terms.html", "The contract, account rules, access duration, acceptable use, consumer rights, and liability boundaries."],
        ["Privacy Notice", "/privacy.html", "What personal data is used, why, with whom, for how long, and on what legal basis."],
        ["Data Rights", "/data-rights.html", "Access, portability, correction, deletion, restriction, objection, and complaint routes."],
        ["Cookie & Storage Notice", "/cookies.html", "Essential storage and consent-controlled optional first-party analytics."],
        ["Refund Policy", "/refunds.html", "Cancellation, duplicate payments, technical problems, and statutory remedies."],
        ["Cancellation Form", "/cancellation.html", "A printable or email-ready model cancellation form."],
        ["Security", "/security.html", "Security controls, responsible disclosure, and an honest assurance-status statement."],
        ["Accessibility", "/accessibility.html", "Accessibility target, testing, known limitations, and contact route."],
        ["Content Methodology", "/content-methodology.html", "How practice content, estimated priority, review, and corrections work."],
        ["Contact", "/contact.html", "Purchase, access, privacy, correction, refund, and security contact routes."],
      ])),
      section("Independent status", `<p>${disclaimer} The service does not book official appointments, predict live exam content, or promise a particular test result.</p>`),
      section("Legal review status", "<p>The operational policies reflect the current product and are versioned. Internal launch documentation keeps legal review marked as required; this website does not represent that the wording has been approved by a solicitor or regulator.</p>"),
    ],
  });
}

function privacyPage() {
  const retentionRows = Object.entries(business.retentionPeriods)
    .map(([key, value]) => `<tr><th scope="row">${label(key)}</th><td>${escapeHtml(value)}</td></tr>`)
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
      section("Controller identity", `<p>${escapeHtml(business.legalTradingName)} operates ${escapeHtml(business.publicProductName)}. Operator type: ${escapeHtml(business.operatorType)}. Public operator location: ${escapeHtml(business.publicOperatorLocation)}. A suitable business service address and legal review remain required before paid launch.</p>`),
      section("Scope and data sources", "<p>This notice covers learners, purchasers, instructor-code users, support contacts, administrators, and website visitors. Data comes from you, your browser or device, Stripe payment events, instructor or referral-code activity, and records created while operating the service.</p>"),
      section("Data collected", `<ul>
        <li><strong>Identity and contact:</strong> email address used for checkout, passwordless login, access restoration, support, export, deletion, or code redemption.</li>
        <li><strong>Authentication and security:</strong> hashed login-token and session values, expiry and revocation records, device/browser metadata, request correlation IDs, and hashed IP-derived rate-limit identifiers. Raw passwords are not used.</li>
        <li><strong>Commercial records:</strong> plan, amount, currency, purchase and entitlement dates, Stripe references, payment/refund/dispute status, instructor/referral attribution, and accepted policy versions. Stripe, not this app, handles full card details.</li>
        <li><strong>Learning records:</strong> question attempts, selected answers, correctness, category, flags, missed questions, mode history, mock results, daily target, streak, and sync operation IDs.</li>
        <li><strong>Optional analytics:</strong> consent-controlled first-party events such as landing views, preview engagement, mode use, paywall and checkout steps, restore flow, and mock completion, linked to a random browser ID.</li>
        <li><strong>Communications and operations:</strong> question reports, support cases, privacy/deletion requests, admin audit records, AI explanation cache entries, and content-review decisions.</li>
      </ul>`),
      section("Purposes and lawful bases", `<div class="table-scroll" tabindex="0" aria-label="Purposes and lawful bases"><table class="compliance-table"><thead><tr><th>Purpose</th><th>Typical data</th><th>Lawful basis</th></tr></thead><tbody>
        <tr><th scope="row">Provide preview, paid access, accounts, progress, mocks, and support</th><td>Email, entitlement, sessions, progress, support messages</td><td>Performance of a contract or steps requested before entering a contract</td></tr>
        <tr><th scope="row">Process payments, refunds, disputes, codes, and accounting</th><td>Purchase and Stripe references, plan, amount, entitlement, policy versions</td><td>Contract and compliance with legal obligations</td></tr>
        <tr><th scope="row">Protect accounts, content, payments, and infrastructure</th><td>Session/security metadata, hashed rate-limit identifiers, audit and error records</td><td>Legitimate interests in security, fraud prevention, and service integrity; legal obligations where applicable</td></tr>
        <tr><th scope="row">Answer rights, correction, accessibility, and support requests</th><td>Contact details, request content, account and purchase references</td><td>Legal obligation, contract, and legitimate interests in resolving requests</td></tr>
        <tr><th scope="row">Optional product analytics and attribution</th><td>Random browser ID, events, broad device class, limited campaign fields</td><td>Consent. No optional analytics ID or event is created before consent</td></tr>
        <tr><th scope="row">User-requested AI explanation</th><td>Question, choices, selected answer, category</td><td>Contract or action requested by the learner; cached to control cost</td></tr>
      </tbody></table></div><p>The configured summary is: ${escapeHtml(business.privacyLawfulBasis)}</p>`),
      section("Optional analytics choices", "<p>Optional analytics are disabled until you choose to allow them. Rejecting or later withdrawing consent clears analytics IDs, queues, attribution, and deduplication records from this browser without deleting study progress or essential account storage.</p><p><button class=\"button-secondary\" type=\"button\" data-privacy-settings>Review privacy choices</button> <a href=\"/cookies.html\">Read the Cookie &amp; Storage Notice</a>.</p>"),
      section("Processors", `<ul>${processors}</ul><p>Processors act under their own contracts and privacy terms. Their certifications or assurance reports do not make this product independently certified.</p>`),
      section("Storage locations", `<ul>${business.storageLocations.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`),
      section("Retention", `<div class="table-scroll" tabindex="0" aria-label="Retention periods"><table class="compliance-table"><tbody>${retentionRows}</tbody></table></div><p>Retention can be extended where reasonably needed for an active legal claim, chargeback, dispute, fraud or security investigation, or binding legal requirement. Records are deleted, anonymised, or redacted when the applicable period ends.</p>`),
      section("Sharing and disclosures", "<p>Data is shared only with configured processors, professional advisers where necessary, a purchaser of the business under appropriate safeguards, or public authorities where disclosure is legally required. Personal data is not sold and is not used for third-party advertising.</p>"),
      section("Automated recommendations", "<p>The app can recommend a study mode or category from attempts, misses, flags, and mock results. These recommendations do not produce legal or similarly significant effects and can be ignored. Estimated priority is not official exam frequency.</p>"),
      section("User rights", "<p>Depending on the circumstances, you may request access, portability, correction, deletion, restriction, object to processing based on legitimate interests, or withdraw analytics consent. See the <a href=\"/data-rights.html\">Data Rights page</a> for working routes and limits.</p>"),
      section("Complaint route", `<p>${escapeHtml(business.complaintRoute)}</p>`),
      section("Account deletion and export", "<p>Authenticated users can download a JSON export from the Account page. A deletion request creates a tracked support workflow so identity, scope, operational records, and records that must lawfully be retained can be reviewed. It is not an unverified instant deletion.</p>"),
      section("Cookies and local storage", "<p>The app uses a secure HttpOnly session cookie for login and browser storage for progress, offline queues, preferences, and cached preview assets. Optional analytics storage requires consent. Details and durations are in the <a href=\"/cookies.html\">Cookie &amp; Storage Notice</a>.</p>"),
      section("Security", "<p>Controls include HTTPS, security headers, HttpOnly cookies, server-side authorization, rate limits, input validation, webhook signature checks, audit records, and restricted premium delivery. No internet service can promise absolute security. See the <a href=\"/security.html\">Security page</a>.</p>"),
      section("International transfers", `<p>${escapeHtml(business.internationalTransferBasis)}</p>`),
      section("Under-18 learners", "<p>The service does not intentionally request age or special-category data. Learners under 18 should involve a parent or guardian when making a purchase or submitting a rights request where appropriate.</p>"),
      section("Changes to this notice", "<p>Material changes receive a new policy version and effective date. Where a change requires a new consent, the service will ask again rather than treating continued use as consent.</p>"),
      section("Contact", `<p>Privacy email: <a href="mailto:${escapeHtml(business.privacyEmail)}">${escapeHtml(business.privacyEmail)}</a>.</p>`),
    ],
  });
}

function dataRightsPage() {
  return legalShell({
    file: "data-rights.html",
    title: "Your Data Rights - Irish Theory Test Coach",
    description: "How to exercise GDPR access, portability, correction, deletion, restriction, objection, consent withdrawal, and complaint rights with Irish Theory Test Coach.",
    h1: "Your Data Rights",
    policy: "dataRights",
    sections: [
      section("Your rights", `<ul><li><strong>Access:</strong> ask whether personal data is processed and receive a copy plus required information.</li><li><strong>Portability:</strong> receive eligible data you supplied in a structured, commonly used, machine-readable format.</li><li><strong>Correction:</strong> correct inaccurate data and complete incomplete data.</li><li><strong>Deletion:</strong> request erasure where the legal conditions apply.</li><li><strong>Restriction:</strong> request that eligible processing is limited while an issue is resolved.</li><li><strong>Objection:</strong> object to processing based on legitimate interests.</li><li><strong>Withdraw consent:</strong> reject optional analytics at any time without affecting earlier lawful processing.</li><li><strong>Complaint:</strong> contact the Irish Data Protection Commission if you believe the response is inadequate.</li></ul>`),
      section("Use the account tools", "<p>Sign in on the <a href=\"/account\">Account page</a> to download a JSON export, request account deletion, log out, or revoke all device sessions. Account export and deletion routes require server-side authentication.</p>"),
      section("Request by email", `<p>Email <a href="mailto:${escapeHtml(business.privacyEmail)}?subject=Data%20rights%20request">${escapeHtml(business.privacyEmail)}</a> with the right you want to exercise and the email associated with the account or purchase. Do not send card numbers, passwords, login tokens, or unnecessary identity documents.</p>`),
      section("Identity verification", "<p>Reasonable verification may be requested before disclosing, changing, or deleting data. Checks will be proportionate and will not ask for more information than reasonably necessary.</p>"),
      section("Response time and cost", "<p>A response is normally provided within one month after a valid request and necessary verification. Complex or numerous requests may lawfully take longer; you will be told if an extension is needed. Requests are normally free, but the law permits a reasonable fee or refusal for manifestly unfounded or excessive requests.</p>"),
      section("Deletion is not absolute", "<p>Some purchase, tax, fraud, dispute, audit, or rights-request records may need to be retained. Where full deletion is not lawful or appropriate, access can be restricted and non-required data removed or anonymised. You will receive an explanation.</p>"),
      section("Optional analytics", "<p><button class=\"button-secondary\" type=\"button\" data-privacy-settings>Review privacy choices</button> Withdrawing consent removes optional analytics storage from this browser and prevents new optional events. Essential security, account, checkout, and progress functions continue.</p>"),
      section("Complaint route", `<p>${escapeHtml(business.complaintRoute)}</p>`),
    ],
  });
}

function cookiesPage() {
  return legalShell({
    file: "cookies.html",
    title: "Cookie and Storage Notice - Irish Theory Test Coach",
    description: "Cookie, local-storage, session-storage, service-worker cache, and optional first-party analytics choices for Irish Theory Test Coach.",
    h1: "Cookie & Storage Notice",
    policy: "cookies",
    sections: [
      section("Your choice", "<p>Optional first-party analytics remain off until you allow them. Essential storage supports login, security, checkout, progress, preferences, offline preview, and reliable requests.</p><p><button class=\"button-primary\" type=\"button\" data-privacy-settings>Review privacy choices</button></p>"),
      section("Storage used", `<div class="table-scroll" tabindex="0" aria-label="Cookie and browser storage table"><table class="compliance-table"><thead><tr><th>Name or category</th><th>Purpose</th><th>Type and duration</th><th>Basis</th></tr></thead><tbody><tr><th scope="row"><code>ittc_session</code></th><td>Passwordless account session, entitlement checks, and protected actions.</td><td>Secure HttpOnly SameSite=Lax cookie; up to 30 days unless revoked or logged out.</td><td>Strictly necessary</td></tr><tr><th scope="row">Study progress and offline queue</th><td>Preview progress, flags, missed items, queued sync operations, and backwards-compatible access state.</td><td>Local storage until cleared, synchronized, replaced, or removed by the learner.</td><td>Requested product functionality</td></tr><tr><th scope="row">Privacy preference</th><td>Remembers whether optional analytics were allowed or rejected.</td><td>Local storage until changed or cleared.</td><td>Necessary to respect the privacy choice</td></tr><tr><th scope="row">Preview service-worker cache</th><td>Installable app shell, public preview content, and offline fallback.</td><td>Browser cache until replaced by a versioned cache or cleared.</td><td>Requested product functionality</td></tr><tr><th scope="row">Rate-limit and study-session state</th><td>Protects APIs and preserves secure session state.</td><td>Server-side short-lived records or signed state; not an advertising cookie.</td><td>Security and requested service</td></tr><tr><th scope="row">Optional analytics ID, queue, attribution, and dedupe</th><td>Measures first-party product use, broad device class, and limited campaign/referral attribution.</td><td>Local/session storage only after consent; server events generally retained ${escapeHtml(business.retentionPeriods.anonymousAnalytics)}.</td><td>Consent</td></tr></tbody></table></div>`),
      section("No advertising cookies", "<p>The app does not use third-party advertising cookies, cross-site behavioural advertising, or social-media tracking pixels. Payment occurs on Stripe-hosted Checkout, where Stripe's own cookies and privacy terms may apply.</p>"),
      section("Changing or clearing choices", "<p>Use the Privacy choices button on this page or in the footer. Browser settings can also clear cookies, local storage, and cache, but doing so may sign you out and remove local-only progress or offline preview files.</p>"),
      section("Do Not Track", "<p>Browser Do Not Track signals are not consistently standardized. Optional analytics still remains off until an affirmative choice is stored.</p>"),
      section("Contact", `<p>Questions about storage or consent: <a href="mailto:${escapeHtml(business.privacyEmail)}">${escapeHtml(business.privacyEmail)}</a>.</p>`),
    ],
  });
}

function termsPage() {
  return legalShell({
    file: "terms.html",
    title: "Terms and Conditions - Irish Theory Test Coach",
    description: "Terms and conditions for Irish Theory Test Coach covering the digital service, pricing, 90-day access, accounts, consumer rights, acceptable use, corrections, and liability.",
    h1: "Terms & Conditions",
    policy: "terms",
    sections: [
      section("Product identity", `<p>${escapeHtml(business.publicProductName)} is an independent Irish Category B theory-test practice preview operated by ${escapeHtml(business.legalTradingName)}, ${escapeHtml(business.operatorType)}, in ${escapeHtml(business.publicOperatorLocation)}. ${disclaimer}</p>`),
      section("When these terms apply", "<p>These terms apply when you browse the site, use the free preview, create or restore an account, redeem a code, or purchase access. The information shown immediately before Stripe Checkout, including the chosen plan, price, access duration, and policy versions, forms part of the contract.</p>"),
      section("The service", "<p>The service provides independent practice questions, coaching feedback, progress tools, road-sign practice, review modes, and timed mocks. It does not provide an official appointment, official exam question feed, driving instruction, legal advice, or a promise of a particular test result.</p>"),
      section("Price, payment, and contract formation", `<p>Checkout is handled by Stripe. The server, not the browser, selects the configured price. The active learner offer is displayed as ${formatUnlockCta(summary)} and other plans are shown on the <a href="/pricing">Pricing page</a>. Prices are one-time charges in EUR unless checkout clearly says otherwise. A contract is formed when payment succeeds and the service confirms or records access.</p>`),
      section("Access duration and renewal", `<p>Paid learner access lasts ${formatInteger(summary.accessDurationDays)} days for the selected plan. There is no automatic renewal. Repeat purchases normally extend the existing entitlement under the server-side entitlement rules. Progress can remain available after expiry, while premium content becomes unavailable until access is renewed.</p>`),
      section("Free preview", `<p>The free preview is limited to ${formatInteger(summary.previewLimit)} questions and the public preview features shown in the app. Preview availability or content can change, but changes do not reduce an already purchased entitlement.</p>`),
      section("Accounts and permitted use", "<p>You may use your account for your own learning, restore access by email, sync progress, export data, and contact support. Instructor codes may be given to the intended learners within their configured limits. Access, codes, or content may not be resold, publicly distributed, or shared to bypass plan limits.</p>"),
      section("Account security", "<p>Magic links expire, are single-use, and should not be forwarded. You are responsible for keeping your email account secure and using logout-all if you suspect device access issues.</p>"),
      section("Acceptable use", "<p>Do not attempt unauthorized access; extract or distribute protected premium content; bypass entitlement, price, rate-limit, or code controls; overload APIs; abuse restore emails; submit malicious code or unsafe content; commit payment fraud; impersonate another user; or access learner/admin data without authorization. Ordinary personal study, accessibility tools, and lawful consumer-rights activity are permitted.</p>"),
      section("Content, corrections, and learner responsibility", "<p>Practice content can contain mistakes or become outdated. Structural validation is not the same as factual verification. Use Report a problem or contact support to flag wording, image, answer, explanation, or category issues. You remain responsible for checking current law and official road-safety guidance and for your decisions on the road.</p>"),
      section("Service conformity and consumer rights", "<p>The service will be supplied as described and with the quality, functionality, compatibility, accessibility, continuity, and security required by applicable consumer law. If the digital service is not in conformity, statutory remedies may include bringing it into conformity, a proportionate price reduction, or termination and refund in the circumstances provided by law. These rights are not limited by these terms.</p>"),
      section("Cancellation and refunds", "<p>The <a href=\"/refunds.html\">Refund Policy</a> and <a href=\"/cancellation.html\">Cancellation Form</a> explain the statutory cancellation route where applicable, duplicate-payment and access-problem handling, and how to contact support. No term removes a mandatory cooling-off or digital-service remedy.</p>"),
      section("Availability and changes", "<p>The web app may be interrupted by maintenance, security response, deployment, or provider outage. Offline use is limited to cached public preview material. Reasonable changes may be made for security, law, compatibility, or product improvement. Material changes that adversely affect paid access will be communicated where reasonably possible and will not remove mandatory remedies.</p>"),
      section("Suspension and termination", "<p>Sessions, codes, or access may be suspended for a material breach, fraud, payment reversal, or urgent security risk. Except where immediate action is reasonably necessary, the operator will provide a reason and a reasonable opportunity to resolve the issue. Suspension does not remove consumer rights or access to privacy/export routes that must remain available.</p>"),
      section("Intellectual property and licence", "<p>The app, design, code, explanations, question bank, and related materials are owned or licensed by the project owner/operator. A purchase grants a limited, personal, non-exclusive, non-transferable right to use the service for the access period. It does not transfer ownership.</p>"),
      section("Third-party services", "<p>Hosting, database, payment, and configured email or AI services may be supplied by third parties. Their own terms and privacy notices may apply to their part of the service. Stripe-hosted Checkout handles payment-card entry.</p>"),
      section("Liability", "<p>Nothing in these terms excludes or limits liability that cannot lawfully be excluded, including mandatory consumer rights, fraud or fraudulent misrepresentation, or death or personal injury caused by negligence. Subject to that, the operator is responsible for loss that is a foreseeable result of breaching these terms or failing to use reasonable care and skill. The operator is not responsible for loss that was not reasonably foreseeable, for business loss arising from consumer use, or for an official test result. You should not rely on the service as the sole source for current law or safety decisions.</p>"),
      section("Governing law and disputes", `<p>These terms are governed by the laws of ${escapeHtml(business.governingJurisdiction)}. This does not remove any mandatory protection or right to bring proceedings available to you as a consumer in your country of residence. Please contact support first so the issue can be investigated and documented.</p>`),
      section("Changes to these terms", "<p>Changes receive a new version and effective date. Changes apply prospectively. A material change requiring fresh agreement will be presented for acceptance rather than assumed from silence.</p>"),
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
      section("Digital access", `<p>Irish Theory Test Coach sells time-limited digital study access. The active learner plan is shown as ${summary.activePrice} for ${formatAccessDuration(summary)} before checkout. This policy does not reduce rights under Irish or EU consumer law.</p>`),
      section("14-day cancellation right", "<p>Consumers generally have 14 days from the day the digital-service contract is concluded to notify the operator that they wish to cancel, unless a lawful exception applies. Use the <a href=\"/cancellation.html\">model cancellation form</a> or send any clear statement by email. You do not need to use the model form.</p>"),
      section("Starting the service during the cancellation period", "<p>Access is normally made available promptly after payment. Where the law permits a proportionate charge for service supplied before cancellation, it will be applied only where the required information and express request to begin during the cancellation period were obtained. The operator does not assume that merely opening the app automatically waives a statutory cancellation right.</p>"),
      section("Digital content exceptions", "<p>Some digital-content contracts can lose the cancellation right after supply begins only where all legal conditions, including express prior consent and acknowledgment, are satisfied. If those conditions were not properly met, the cancellation right is not treated as lost.</p>"),
      section("When to contact us", `<p>Email <a href="mailto:${escapeHtml(business.refundEmail)}">${escapeHtml(business.refundEmail)}</a> if you wish to cancel, purchased by mistake, bought duplicate access, cannot access the product because of a technical issue, or believe a payment, referral, or code was recorded incorrectly.</p>`),
      section("Faulty or non-conforming service", "<p>If the service is not as described or does not meet applicable digital-service requirements, contact support. Depending on the circumstances, remedies can include fixing the service, a proportionate price reduction, or terminating the contract and receiving a refund. These statutory remedies are separate from a change-of-mind request.</p>"),
      section("Operational refund behavior", "<p>Support reviews the request and records the reason, amount, Stripe reference, entitlement effect, actor, and timestamp. Approved refunds are issued through Stripe to the original payment method unless another method is expressly agreed. Where law requires repayment after cancellation, it will be made without undue delay and no later than 14 days after notice.</p>"),
      section("Information to include", "<p>Include the checkout email, approximate purchase time, the plan, and the issue. Do not send card numbers or full payment credentials.</p>"),
      section("Requests outside statutory rights", "<p>For goodwill requests outside mandatory rights, factors may include duplicate purchase, service use, timing, whether access can be restored, fraud or abuse indicators, and the nature of the problem. A refusal will not override a statutory cancellation or non-conformity remedy.</p>"),
      section("No outcome refunds", "<p>A disappointing official test result is not by itself a service fault. The product is an independent practice tool and does not promise a pass. This does not affect remedies where the digital service itself is non-conforming.</p>"),
      section("Contact", `<p>Refund email: <a href="mailto:${escapeHtml(business.refundEmail)}">${escapeHtml(business.refundEmail)}</a>.</p>`),
    ],
  });
}

function cancellationPage() {
  return legalShell({
    file: "cancellation.html",
    title: "Cancellation Form - Irish Theory Test Coach",
    description: "Printable and email-ready model cancellation form for an Irish Theory Test Coach digital-access purchase.",
    h1: "Cancellation Form",
    policy: "cancellation",
    scripts: ["./cancellation.js?v=20260715-legal-v1"],
    sections: [
      section("How to cancel", `<p>To notify ${escapeHtml(business.legalTradingName)} that you wish to cancel an eligible consumer contract, complete this form and use the email button, print it, or send another clear statement to <a href="mailto:${escapeHtml(business.refundEmail)}">${escapeHtml(business.refundEmail)}</a>. Using this exact form is optional.</p>`),
      `<section class="model-cancellation-form" aria-labelledby="modelCancellationHeading"><h2 id="modelCancellationHeading">Model cancellation notice</h2><form id="cancellationForm" novalidate><p>To: ${escapeHtml(business.legalTradingName)}, ${escapeHtml(business.refundEmail)}</p><p>I give notice that I wish to cancel my contract for the following digital service:</p><label class="field"><span>Plan or service</span><input id="cancelPlan" name="plan" type="text" required maxlength="120" placeholder="For example, Full Study Pass"></label><label class="field"><span>Order or Stripe receipt reference (optional)</span><input id="cancelReference" name="reference" type="text" maxlength="120" autocomplete="off"></label><label class="field"><span>Order date</span><input id="cancelOrderDate" name="orderDate" type="date" required></label><label class="field"><span>Name</span><input id="cancelName" name="name" type="text" required maxlength="120" autocomplete="name"></label><label class="field"><span>Email used for purchase</span><input id="cancelEmail" name="email" type="email" required maxlength="254" autocomplete="email"></label><label class="field"><span>Date of this notice</span><input id="cancelNoticeDate" name="noticeDate" type="date" required></label><div class="cancellation-actions"><button class="button-primary" type="submit">Prepare cancellation email</button><button id="printCancellation" class="button-secondary" type="button">Print form</button></div><p id="cancellationStatus" class="account-message" role="status" aria-live="polite">The email button opens your email app. Nothing is submitted to this website.</p></form></section>`,
      section("What happens next", "<p>Support will acknowledge the request, verify the purchase where necessary, assess the applicable statutory or goodwill route, and explain the refund and entitlement effect. Keep a copy of your sent notice.</p>"),
    ],
  });
}

function securityPage() {
  return legalShell({
    file: "security.html",
    title: "Security and Responsible Disclosure - Irish Theory Test Coach",
    description: "Security controls, payment-data boundaries, incident reporting, responsible disclosure, and assurance status for Irish Theory Test Coach.",
    h1: "Security & Responsible Disclosure",
    policy: "security",
    sections: [
      section("Security approach", "<p>Security is treated as an ongoing engineering and operational process. Controls are selected for the current risk profile and are tested in the release pipeline. No website can promise absolute security.</p>"),
      section("Current controls", "<ul><li>HTTPS and production security headers, including HSTS, Content Security Policy, frame protection, and restrictive browser permissions.</li><li>Secure HttpOnly SameSite session cookies, single-use magic links, session rotation, revocation, and server-side role checks.</li><li>Server-side entitlement and price enforcement; premium question and media delivery requires authorization.</li><li>Stripe-hosted card entry, webhook signature verification, event idempotency, and payment reconciliation controls.</li><li>Input validation, origin checks, request-size limits, hashed-identifier rate limits, safe errors, structured redacted logs, and admin audit records.</li><li>Secret scanning, dependency checks, migration checks, automated security tests, and documented incident, backup, rollback, and rotation procedures.</li></ul>"),
      section("Payment data", "<p>Full payment-card numbers and CVC values are entered on Stripe-hosted Checkout and are not intentionally stored by this application. The app stores limited Stripe references, payment state, amount, currency, plan, entitlement, refund/dispute state, and policy versions.</p>"),
      section("SOC 2 and assurance status", "<p><strong>Irish Theory Test Coach is not currently represented as SOC 2 certified, SOC 2 compliant, or independently audited against SOC 2.</strong> SOC 2 is an examination performed by an independent licensed CPA firm against defined controls; it cannot be self-awarded by adding a page or checklist. A hosting or payment provider's report applies to that provider and does not automatically certify this product.</p>"),
      section("Responsible disclosure", `<p>Email <a href="mailto:${escapeHtml(business.securityEmail)}?subject=Security%20report">${escapeHtml(business.securityEmail)}</a> with the affected URL, time, impact, and safe reproduction steps. Do not access other people's data, use real payment cards, degrade service, send malware, extort the operator, or publish exploitable details before a reasonable remediation window. This is a reporting channel, not a paid bug-bounty promise.</p>`),
      section("Incident response", "<p>Reports are triaged using the operational incident runbook. Where a personal-data breach creates a legal notification duty, the operator will follow the applicable regulator and affected-person notification requirements.</p>"),
      section("Account safety", "<p>Do not forward magic links. Use Logout all devices if account access is in doubt, secure the associated email account, and contact support for unexpected purchases, entitlement changes, or restore messages.</p>"),
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
      section("Recent testing", "<p>Last automated accessibility test: July 15, 2026. The release QA suite checks keyboard and axe contracts across learner, account, pricing, and protected-admin states. Test evidence is retained with the release reports.</p>"),
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

function legalShell({ file, title, description, h1, policy, sections, scripts = [] }) {
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
    <link rel="stylesheet" href="./product-ui.css?v=20260715-commercial-v2">
    <script type="application/ld+json">${breadcrumbJson}</script>
  </head>
  <body>
    <div class="shell legal-shell">
      ${siteHeader({ active: "support", root: "" })}
      <main class="legal-page">
        <nav class="legal-local-nav" aria-label="Legal and trust navigation"><a href="/legal.html">Legal centre</a><a href="/privacy.html">Privacy</a><a href="/data-rights.html">Data rights</a><a href="/cookies.html">Cookies</a><a href="/terms.html">Terms</a><a href="/refunds.html">Refunds</a><a href="/security.html">Security</a></nav>
        <h1>${escapeHtml(h1)}</h1>
        <p class="policy-meta">Effective date: ${escapeHtml(effectiveDate)}. Policy version: <code>${escapeHtml(policyVersion)}</code>.</p>
        ${launchBlocker()}
        ${sections.join("\n        ")}
      </main>
      ${siteFooter({ root: "", disclaimer })}
    </div>
    <script src="./config.js?v=20260710-rebuild"></script>
    <script src="./business-config.js?v=20260710-rebuild"></script>
    <script src="./growth-config.js?v=20260710-rebuild"></script>
    <script type="module" src="./privacy-consent.js?v=20260715-legal-v1"></script>
    <script type="module" src="./growth-tracking.js?v=20260710-rebuild"></script>
    <script type="module" src="./frontend-monitoring.js?v=20260710-rebuild"></script>
    <script src="./trust.js?v=20260710-rebuild"></script>
    ${scripts.map((src) => `<script type="module" src="${src}"></script>`).join("\n    ")}
  </body>
</html>
`;
}

function section(title, body) {
  return `<section><h2>${escapeHtml(title)}</h2>${body}</section>`;
}

function legalCardGrid(items) {
  return `<div class="legal-card-grid">${items.map(([title, href, body]) => `<a class="legal-link-card" href="${href}"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(body)}</span></a>`).join("")}</div>`;
}

function identityList() {
  const rows = [
    ["Legal trading name", business.legalTradingName],
    ["Public product name", business.publicProductName],
    ["Operator type", business.operatorType],
    ["Public operator location", business.publicOperatorLocation],
    ["Governing jurisdiction", business.governingJurisdiction],
  ];
  if (!isPlaceholder(business.businessRegistrationNumber)) rows.push(["Business registration number", business.businessRegistrationNumber]);
  if (!isPlaceholder(business.vatNumber)) rows.push(["VAT number", business.vatNumber]);
  return `<dl class="compliance-list">${rows.map(([name, value]) => `<div><dt>${escapeHtml(name)}</dt><dd>${placeholderMarkup(value)}</dd></div>`).join("")}</dl>`;
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
    ["/legal.html", "monthly", "0.5"],
    ["/data-rights.html", "monthly", "0.4"],
    ["/cookies.html", "monthly", "0.4"],
    ["/cancellation.html", "monthly", "0.3"],
    ["/security.html", "monthly", "0.5"],
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
