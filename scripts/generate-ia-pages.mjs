import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildProductSummary, formatInteger, formatMockLong, formatMockShort, formatUnlockCta } from "../shared/product-summary.js";
import {
  escapeHtml,
  featureCards,
  finalCta,
  pageMeta,
  pricingCards,
  siteFooter,
  siteHeader,
} from "../shared/static-components.js";

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), "..");
const publicDir = path.join(root, "public");
const marketingDir = path.join(publicDir, "marketing");
const siteUrl = new URL(process.env.PUBLIC_SITE_URL || "https://irish-theory-test-coach.vercel.app").origin;
const ogImage = `${siteUrl}/marketing/og-preview.svg`;
const disclaimer = "Independent practice tool. Not affiliated with RSA or Prometric.";
const summary = buildProductSummary({ root, env: process.env });

fs.mkdirSync(marketingDir, { recursive: true });

writeMarketingAssets();
writePage("index.html", renderHomePage());
writePage("pricing.html", renderPricingPage());
writePage("learn.html", renderLearnPage());
writePage("road-signs.html", renderRoutePage({
  key: "road-signs",
  slug: "road-signs",
  title: "Road Signs Practice - Irish Theory Test Coach",
  description: "Start road-sign and road-marking practice with independent Irish Category B study guidance, image drills, and links into the learner app.",
  h1: "Road-sign practice with recognition built in.",
  eyebrow: "Road signs",
  intro: "Road signs are easier to remember when you study shape, colour, instruction, and consequence together.",
  sections: [
    ["Recognition first", "Start by naming the sign or marking before reading answers. That trains the same fast recognition you need under pressure."],
    ["Then learn the rule", "The coach explains why the safest or required action fits the sign, without claiming official exam prediction."],
    ["Move into drills", `Unlock the full coach for ${formatInteger(summary.signOrImageQuestionCount)} sign and image questions plus review mode.`],
  ],
  primaryCta: "Practise road signs",
  secondaryCta: "View mock exam",
  secondaryHref: "/mock-exam",
}));
writePage("mock-exam.html", renderRoutePage({
  key: "mock-exam",
  slug: "mock-exam",
  title: "Mock Exam Practice - Irish Theory Test Coach",
  description: "Learn how Irish Theory Test Coach uses 40-question timed mock practice, review mode, and weak-area coaching for Category B learners.",
  h1: "Timed mock practice without the noise.",
  eyebrow: "Mock exam",
  intro: `Practise a ${formatMockLong(summary)} flow, then review the questions that actually slowed you down.`,
  sections: [
    ["Focused timing", "Mock mode strips away extra panels so you can focus on the current question, timer, and progress."],
    ["Score honestly", "Scores are calculated server-side from submitted answers. Browser state cannot forge a mock result."],
    ["Review after each attempt", "The useful work starts after the score: clear missed questions, repeat road signs, and return to weak categories."],
  ],
  primaryCta: "Start a mock",
  secondaryCta: "See pricing",
  secondaryHref: "/pricing",
}));
writePage("account.html", renderAccountPage());
writePage("support.html", renderSupportPage());
updateSitemap();

console.log("Generated IA pages: /, /app, /pricing, /learn, /road-signs, /mock-exam, /account, /support.");

function renderHomePage() {
  const title = "Irish Theory Test Coach | Independent Category B Practice";
  const description = "Independent Irish Category B theory-test practice with free preview, road signs, weak-area coaching, mock exams, transparent pricing, and reviewed content workflow.";
  return pageShell({
    active: "home",
    canonicalPath: "/",
    title,
    description,
    bodyClass: "marketing-page",
    main: `<main class="marketing-main">
        <section class="marketing-hero" aria-labelledby="homeTitle">
          <div class="marketing-hero-copy">
            <p class="eyebrow">Independent Irish Category B practice</p>
            <h1 id="homeTitle">A clearer way to practise for the Irish theory test.</h1>
            <p class="hero-subheading">Study rules, road signs, weak areas, and timed mocks in one focused coach. Built for learners who want structure, not clutter.</p>
            <div class="cta-row">
              <a class="button-primary" href="/app">Start free preview</a>
              <a class="button-secondary" href="/pricing">Compare pricing</a>
            </div>
            <p class="hero-disclaimer">${disclaimer}</p>
          </div>
          <figure class="product-shot hero-product-shot">
            <img src="./marketing/app-workspace-preview.svg" width="920" height="620" loading="eager" decoding="async" alt="Irish Theory Test Coach learner workspace preview">
            <figcaption>Focused learner workspace preview</figcaption>
          </figure>
        </section>

        <section class="metric-strip" aria-label="Product summary">
          <div><strong>${formatInteger(summary.totalPublishedQuestions)}</strong><span>practice questions</span></div>
          <div><strong>${formatInteger(summary.estimatedPriorityQuestionCount)}</strong><span>estimated-priority drills</span></div>
          <div><strong>${formatInteger(summary.signOrImageQuestionCount)}</strong><span>sign and image questions</span></div>
          <div><strong>${formatMockShort(summary)}</strong><span>questions / minutes per mock</span></div>
        </section>

        <section class="marketing-section" aria-labelledby="positioningHeading">
          <div class="section-intro">
            <p class="eyebrow">Product positioning</p>
            <h2 id="positioningHeading">A practice product, not an official testing service.</h2>
            <p>Irish Theory Test Coach helps learners practise and review. It does not book tests, claim RSA or Prometric affiliation, promise a pass, or claim to know what appears in any live test.</p>
          </div>
          <div class="feature-grid">
            ${featureCards([
              { kicker: "Practice", title: "Free preview first", body: `${summary.previewLimit} preview questions let learners test the workflow before paying.` },
              { kicker: "Coaching", title: "Weak areas become the plan", body: "Missed and flagged questions feed the next review session instead of disappearing after a score." },
              { kicker: "Mocks", title: "Timed 40-question practice", body: "Mock mode focuses on timing, submission, and review without marketing panels in the way." },
              { kicker: "Trust", title: "Content review workflow", body: "Duplicate, conflict, lint, and learner reports are routed into an editorial queue for review." },
            ])}
          </div>
        </section>

        <section class="marketing-section split-section" aria-labelledby="howItWorksHeading">
          <div>
            <p class="eyebrow">How it works</p>
            <h2 id="howItWorksHeading">A simple study loop learners can repeat.</h2>
            <ol class="step-list">
              <li><strong>Start with preview.</strong><span>Try the question flow and feedback without paying.</span></li>
              <li><strong>Drill weak areas.</strong><span>Use estimated priority, missed answers, and flags to decide what comes next.</span></li>
              <li><strong>Repeat road signs.</strong><span>Train visual recognition before moving into timed practice.</span></li>
              <li><strong>Take a mock.</strong><span>Practise the 40-question flow, then review every miss.</span></li>
            </ol>
          </div>
          <figure class="product-shot">
            <img src="./marketing/content-review-preview.svg" width="820" height="560" loading="lazy" decoding="async" alt="Content review methodology preview">
            <figcaption>Content review and quality methodology</figcaption>
          </figure>
        </section>

        <section class="marketing-section three-column-section">
          <article>
            <p class="eyebrow">Weak-area coaching</p>
            <h2>Practise what you miss.</h2>
            <p>Answer history, missed questions, and flags keep the next session practical. Explanations focus on why the answer fits the supplied rule or sign context.</p>
          </article>
          <article>
            <p class="eyebrow">Mock exam practice</p>
            <h2>Use timed mocks when ready.</h2>
            <p>Mock mode uses the server-generated session flow so learners practise timing without relying on editable browser state for scoring.</p>
          </article>
          <article>
            <p class="eyebrow">Road signs</p>
            <h2>Train fast recognition.</h2>
            <p>Image-backed drills help learners slow down, name the sign or marking, and connect it to the safest action.</p>
          </article>
        </section>

        <section class="marketing-section" aria-labelledby="pricingHeading">
          <div class="section-intro">
            <p class="eyebrow">Transparent pricing</p>
            <h2 id="pricingHeading">Free preview, then a low one-time learner pass.</h2>
            <p>The main learner plan is ${summary.activePrice} for ${summary.accessDurationDays}-day access. Launch offer and instructor packs are shown when enabled.</p>
          </div>
          ${pricingCards(summary, { root: "" })}
        </section>

        <section class="marketing-section methodology-section" aria-labelledby="methodologyHeading">
          <div>
            <p class="eyebrow">Content review methodology</p>
            <h2 id="methodologyHeading">Built with a review queue, not blind claims.</h2>
            <p>The project tracks canonical categories, duplicate groups, answer conflicts, lint findings, learner reports, and admin decisions. Passing structure checks does not automatically mean factual verification.</p>
          </div>
          <ul class="check-list">
            <li>Canonical category mapping preserves original metadata.</li>
            <li>Conflicting saved answers enter editorial review.</li>
            <li>Premium access and content delivery are verified server-side.</li>
            <li>Estimated priority never means knowledge of any live test order or frequency.</li>
          </ul>
        </section>

        <section class="marketing-section faq-section">
          <h2>FAQ</h2>
          ${faqMarkup([
            ["Is this official?", `No. ${disclaimer}`],
            ["Can it guarantee a pass?", "No. It is a practice and review tool, not a guarantee of any test outcome."],
            ["What is free?", `The free preview includes ${summary.previewLimit} questions and sample feedback.`],
            ["How do refunds and support work?", "Support and refund information is visible from the footer, pricing page, and support hub."],
          ])}
        </section>

        ${finalCta({ root: "", body: `${disclaimer} ${formatUnlockCta(summary)} for the current learner plan.` })}
      </main>`,
    jsonLd: [softwareJsonLd("/"), websiteJsonLd(), breadcrumbJsonLd("Home", "/"), faqJsonLd([
      ["Is this official?", `No. ${disclaimer}`],
      ["Can it guarantee a pass?", "No. It is a practice and review tool, not a guarantee of any test outcome."],
      ["What is free?", `The free preview includes ${summary.previewLimit} questions and sample feedback.`],
      ["How do refunds and support work?", "Support and refund information is visible from the footer, pricing page, and support hub."],
    ])],
  });
}

function renderPricingPage() {
  return pageShell({
    active: "pricing",
    canonicalPath: "/pricing",
    title: "Pricing - Irish Theory Test Coach",
    description: "Compare Irish Theory Test Coach free preview, launch offer, Full Study Pass, and instructor access-code packs with transparent independent-product wording.",
    bodyClass: "marketing-page",
    main: `<main class="marketing-main compact-main">
        ${pageHero("Pricing", "Clear learner pricing with no fake urgency.", `Start free, then unlock the full coach for ${summary.activePrice} when the complete study path is useful.`, "Start free preview", "/app")}
        ${pricingCards(summary, { root: "" })}
        <section class="marketing-section comparison-section">
          <h2>What each plan includes</h2>
          <div class="comparison-table-wrap">
            <table class="comparison-table">
              <thead><tr><th>Feature</th><th>Free preview</th><th>Full Study Pass</th><th>Instructor packs</th></tr></thead>
              <tbody>
                <tr><td>Questions</td><td>${summary.previewLimit}</td><td>${formatInteger(summary.totalPublishedQuestions)}</td><td>Student codes</td></tr>
                <tr><td>Priority drills</td><td>Sample only</td><td>${formatInteger(summary.estimatedPriorityQuestionCount)}</td><td>Included per code</td></tr>
                <tr><td>Road-sign/image drills</td><td>Sample only</td><td>${formatInteger(summary.signOrImageQuestionCount)}</td><td>Included per code</td></tr>
                <tr><td>Mock exams</td><td>No</td><td>${formatMockLong(summary)}</td><td>Included per code</td></tr>
                <tr><td>Restore access</td><td>No purchase needed</td><td>Email restore</td><td>Code/account support</td></tr>
              </tbody>
            </table>
          </div>
        </section>
        ${supportVisibility()}
        ${finalCta({ root: "", title: "Try the preview before choosing a plan.", body: disclaimer })}
      </main>`,
    jsonLd: [softwareJsonLd("/pricing"), breadcrumbJsonLd("Pricing", "/pricing")],
  });
}

function renderLearnPage() {
  return pageShell({
    active: "learn",
    canonicalPath: "/learn",
    title: "Learning Hub - Irish Theory Test Coach",
    description: "Browse Irish Theory Test Coach learning routes for Category B practice, road signs, mock exams, weak-area review, pricing, and support.",
    bodyClass: "marketing-page",
    main: `<main class="marketing-main compact-main">
        ${pageHero("Learning hub", "Pick the next useful study route.", "Use the hub to move between guides, the learner app, road-sign practice, mock-exam information, and support.", "Open learner app", "/app")}
        <section class="marketing-section">
          <div class="link-card-grid">
            ${[
              ["Learner app", "/app", "Focused practice workspace with preview questions."],
              ["Road signs", "/road-signs", "Recognition-first sign and marking practice."],
              ["Mock exam", "/mock-exam", "Timed 40-question practice and review."],
              ["Study plan", "/theory-test-study-plan.html", "A repeatable weekly study structure."],
              ["Failed-test recovery", "/failed-theory-test-ireland.html", "Calm next steps after a failed attempt."],
              ["Pricing", "/pricing", "Free preview, Full Study Pass, and instructor packs."],
            ].map(linkCard).join("\n            ")}
          </div>
        </section>
        ${finalCta({ root: "", body: disclaimer })}
      </main>`,
    jsonLd: [websiteJsonLd(), breadcrumbJsonLd("Learning hub", "/learn")],
  });
}

function renderRoutePage(item) {
  return pageShell({
    active: item.key,
    canonicalPath: `/${item.slug}`,
    title: item.title,
    description: item.description,
    bodyClass: "marketing-page",
    main: `<main class="marketing-main compact-main">
        ${pageHero(item.eyebrow, item.h1, item.intro, item.primaryCta, "/app", item.secondaryCta, item.secondaryHref)}
        <section class="marketing-section route-section">
          ${item.sections.map(([title, body]) => `<article><h2>${escapeHtml(title)}</h2><p>${escapeHtml(body)}</p></article>`).join("\n          ")}
        </section>
        ${finalCta({ root: "", body: disclaimer })}
      </main>`,
    jsonLd: [breadcrumbJsonLd(item.eyebrow, `/${item.slug}`)],
  });
}

function renderAccountPage() {
  return pageShell({
    active: "app",
    canonicalPath: "/account",
    title: "Account Access - Irish Theory Test Coach",
    description: "Restore paid Irish Theory Test Coach access, open the learner app, and find support for checkout, email links, and refunds.",
    bodyClass: "marketing-page account-page",
    noindex: true,
    main: `<main class="marketing-main compact-main">
        ${pageHero("Account access", "Restore access or return to study.", "Use the learner app restore form to send a secure email link for paid access. No frontend-only unlock is trusted.", "Open restore form", "/app#restoreEmail", "Contact support", "/support")}
        <section class="marketing-section route-section">
          <article><h2>Already paid?</h2><p>Open the learner app, choose restore access, and enter the email used at checkout.</p></article>
          <article><h2>Security</h2><p>Premium unlocks are verified server-side. Do not share magic links or checkout emails.</p></article>
          <article><h2>Need help?</h2><p>Use the support hub for refund, checkout, or access questions.</p></article>
        </section>
      </main>`,
  });
}

function renderSupportPage() {
  return pageShell({
    active: "support",
    canonicalPath: "/support",
    title: "Support - Irish Theory Test Coach",
    description: "Support hub for Irish Theory Test Coach access, refunds, pricing, instructor codes, privacy, and learner account questions.",
    bodyClass: "marketing-page",
    main: `<main class="marketing-main compact-main">
        ${pageHero("Support", "Get help with access, refunds, or instructor codes.", "Support is visible before and after purchase. Do not send card numbers; Stripe handles payment details.", "Restore access", "/app#restoreEmail", "View refunds", "/refunds.html")}
        <section class="marketing-section route-section">
          <article><h2>Access problems</h2><p>Use restore access in the learner app with the email used at checkout.</p></article>
          <article><h2>Refunds</h2><p>Refund wording is simple and fair for digital access. Read the refund page before launch review.</p></article>
          <article><h2>Instructor codes</h2><p>Instructor packs and referral codes are handled through the pricing and instructor pages.</p></article>
        </section>
        <section class="marketing-section support-links">
          <h2>Quick links</h2>
          <div class="link-card-grid">
            ${[
              ["Privacy", "/privacy.html", "How data, analytics, and restore access are handled."],
              ["Terms", "/terms.html", "Product-use terms and independent status."],
              ["Refunds", "/refunds.html", "Digital access refund policy."],
              ["Contact", "/contact.html", "Support email and message guidance."],
            ].map(linkCard).join("\n            ")}
          </div>
        </section>
      </main>`,
    jsonLd: [breadcrumbJsonLd("Support", "/support")],
  });
}

function pageShell({ active, canonicalPath, title, description, bodyClass, main, jsonLd = [], noindex = false }) {
  const canonical = `${siteUrl}${canonicalPath}`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#1f4f46">
    ${pageMeta({ title, description, canonical, ogImage, noindex })}
    <link rel="manifest" href="./manifest.webmanifest">
    <link rel="icon" href="./icons/app-icon.svg" type="image/svg+xml">
    <link rel="apple-touch-icon" href="./icons/app-icon.svg">
    <link rel="stylesheet" href="./styles.css?v=20260710-rebuild">
    ${jsonLd.map((item) => `<script type="application/ld+json">${JSON.stringify(item)}</script>`).join("\n    ")}
  </head>
  <body class="${bodyClass}">
    <div class="shell marketing-shell">
      ${siteHeader({ active, root: "" })}
      ${main}
      ${siteFooter({ root: "", disclaimer })}
    </div>
    <script src="./config.js?v=20260710-rebuild"></script>
    <script src="./pricing-config.js?v=20260710-rebuild"></script>
    ${canonicalPath === "/pricing" ? '<script src="./pricing.js?v=20260710-rebuild"></script>' : ""}
    <script src="./trust.js?v=20260710-rebuild"></script>
  </body>
</html>
`;
}

function pageHero(eyebrow, title, body, primaryLabel, primaryHref, secondaryLabel = "Compare pricing", secondaryHref = "/pricing") {
  return `<section class="page-hero">
          <p class="eyebrow">${escapeHtml(eyebrow)}</p>
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml(body)}</p>
          <div class="cta-row">
            <a class="button-primary" href="${primaryHref}">${escapeHtml(primaryLabel)}</a>
            <a class="button-secondary" href="${secondaryHref}">${escapeHtml(secondaryLabel)}</a>
          </div>
          <p class="hero-disclaimer">${disclaimer}</p>
        </section>`;
}

function supportVisibility() {
  return `<section class="marketing-section route-section">
          <article><h2>Support and refunds are visible.</h2><p>Problem with access? Restore by email from the learner app or use the support hub before contacting support.</p></article>
          <article><h2>Independent product wording stays clear.</h2><p>No official RSA or Prometric affiliation, no outcome promise, and no live-test prediction claims.</p></article>
        </section>`;
}

function faqMarkup(items) {
  return items.map(([question, answer]) => `<details open><summary>${escapeHtml(question)}</summary><p>${escapeHtml(answer)}</p></details>`).join("\n          ");
}

function linkCard([title, href, body]) {
  return `<a class="link-card" href="${href}"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(body)}</span></a>`;
}

function softwareJsonLd(pathname) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Irish Theory Test Coach",
    applicationCategory: "EducationalApplication",
    operatingSystem: "Web",
    url: `${siteUrl}${pathname}`,
    description: "Independent Irish Category B theory-test practice app with road signs, mock exams, estimated priority drills, and progress tracking.",
    offers: {
      "@type": "Offer",
      price: String((summary.pricing?.plans?.find((plan) => plan.active)?.amountCents || 499) / 100),
      priceCurrency: "EUR",
    },
  };
}

function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Irish Theory Test Coach",
    url: siteUrl,
    description: "Independent Irish theory test practice guides and learner app.",
  };
}

function breadcrumbJsonLd(name, pathname) {
  const itemListElement = [
    { "@type": "ListItem", position: 1, name: "Home", item: `${siteUrl}/` },
  ];
  if (!(pathname === "/" && name === "Home")) {
    itemListElement.push({ "@type": "ListItem", position: 2, name, item: `${siteUrl}${pathname}` });
  }
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement,
  };
}

function faqJsonLd(items) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map(([name, text]) => ({
      "@type": "Question",
      name,
      acceptedAnswer: { "@type": "Answer", text },
    })),
  };
}

function updateSitemap() {
  const sitemapPath = path.join(publicDir, "sitemap.xml");
  if (!fs.existsSync(sitemapPath)) return;
  const existing = fs.readFileSync(sitemapPath, "utf8");
  const additions = [
    ["/app", "weekly", "0.9"],
    ["/pricing", "weekly", "0.9"],
    ["/learn", "weekly", "0.8"],
    ["/road-signs", "weekly", "0.8"],
    ["/mock-exam", "weekly", "0.8"],
    ["/support", "monthly", "0.5"],
  ].filter(([pathname]) => !existing.includes(`<loc>${siteUrl}${pathname}</loc>`));
  if (!additions.length) return;
  const extra = additions.map(([pathname, changefreq, priority]) => `  <url>
    <loc>${siteUrl}${pathname}</loc>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`).join("\n");
  fs.writeFileSync(sitemapPath, existing.replace("</urlset>", `${extra}\n</urlset>`), "utf8");
}

function writeMarketingAssets() {
  fs.writeFileSync(path.join(marketingDir, "app-workspace-preview.svg"), appPreviewSvg(), "utf8");
  fs.writeFileSync(path.join(marketingDir, "content-review-preview.svg"), reviewPreviewSvg(), "utf8");
}

function appPreviewSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="920" height="620" viewBox="0 0 920 620" role="img" aria-labelledby="title desc">
  <title id="title">Irish Theory Test Coach learner workspace preview</title>
  <desc id="desc">Stylised screenshot showing a focused question workspace with progress and mode controls.</desc>
  <rect width="920" height="620" rx="22" fill="#f4f6f8"/>
  <rect x="32" y="32" width="856" height="556" rx="18" fill="#fff" stroke="#d9dee6"/>
  <rect x="64" y="70" width="190" height="480" rx="12" fill="#f7f8fb" stroke="#e1e5ec"/>
  <rect x="290" y="70" width="360" height="480" rx="12" fill="#fff" stroke="#d9dee6"/>
  <rect x="684" y="70" width="172" height="480" rx="12" fill="#f7f8fb" stroke="#e1e5ec"/>
  <text x="82" y="105" fill="#1d252c" font-family="Arial" font-size="18" font-weight="700">Study modes</text>
  <g fill="#fff" stroke="#d9dee6"><rect x="82" y="132" width="140" height="44" rx="8"/><rect x="82" y="190" width="140" height="44" rx="8"/><rect x="82" y="248" width="140" height="44" rx="8"/></g>
  <rect x="306" y="92" width="108" height="26" rx="13" fill="#e6f4ef"/>
  <text x="322" y="110" fill="#087b57" font-family="Arial" font-size="13" font-weight="700">Road signs</text>
  <text x="306" y="165" fill="#17212b" font-family="Arial" font-size="30" font-weight="700">What does this sign tell you?</text>
  <rect x="306" y="198" width="328" height="88" rx="12" fill="#f7f8fb" stroke="#d9dee6"/>
  <rect x="306" y="306" width="328" height="58" rx="10" fill="#fff" stroke="#d9dee6"/>
  <rect x="306" y="380" width="328" height="58" rx="10" fill="#fff" stroke="#d9dee6"/>
  <rect x="306" y="454" width="328" height="58" rx="10" fill="#eaf7f2" stroke="#087b57"/>
  <text x="704" y="105" fill="#1d252c" font-family="Arial" font-size="18" font-weight="700">Today</text>
  <circle cx="770" cy="178" r="54" fill="none" stroke="#d9dee6" stroke-width="13"/>
  <path d="M770 124a54 54 0 0 1 48 78" fill="none" stroke="#087b57" stroke-width="13" stroke-linecap="round"/>
  <text x="735" y="186" fill="#17212b" font-family="Arial" font-size="24" font-weight="700">12/25</text>
  <rect x="704" y="270" width="124" height="38" rx="8" fill="#1f4f46"/>
  <text x="724" y="295" fill="#fff" font-family="Arial" font-size="14" font-weight="700">Next question</text>
</svg>`;
}

function reviewPreviewSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="820" height="560" viewBox="0 0 820 560" role="img" aria-labelledby="title desc">
  <title id="title">Content review methodology preview</title>
  <desc id="desc">Stylised content quality workflow with taxonomy, duplicate groups, conflicts, and reports.</desc>
  <rect width="820" height="560" rx="20" fill="#f4f6f8"/>
  <rect x="42" y="42" width="736" height="476" rx="16" fill="#fff" stroke="#d9dee6"/>
  <text x="74" y="92" fill="#17212b" font-family="Arial" font-size="24" font-weight="700">Content quality workflow</text>
  <g font-family="Arial" font-size="15" font-weight="700">
    <rect x="74" y="132" width="190" height="88" rx="12" fill="#eef5f2" stroke="#b6d8ce"/><text x="98" y="168" fill="#1f4f46">Canonical taxonomy</text><text x="98" y="193" fill="#52606a" font-weight="400">Map category aliases</text>
    <rect x="314" y="132" width="190" height="88" rx="12" fill="#f7f8fb" stroke="#d9dee6"/><text x="338" y="168" fill="#1f4f46">Duplicate analysis</text><text x="338" y="193" fill="#52606a" font-weight="400">Group variants</text>
    <rect x="554" y="132" width="190" height="88" rx="12" fill="#fff7e0" stroke="#eac75b"/><text x="578" y="168" fill="#755300">Conflict queue</text><text x="578" y="193" fill="#52606a" font-weight="400">No silent answer picks</text>
    <rect x="194" y="278" width="190" height="88" rx="12" fill="#f7f8fb" stroke="#d9dee6"/><text x="218" y="314" fill="#1f4f46">Learner reports</text><text x="218" y="339" fill="#52606a" font-weight="400">Question problem action</text>
    <rect x="434" y="278" width="190" height="88" rx="12" fill="#eef5f2" stroke="#b6d8ce"/><text x="458" y="314" fill="#1f4f46">Admin decisions</text><text x="458" y="339" fill="#52606a" font-weight="400">Versioned and audited</text>
  </g>
  <path d="M264 176h50M504 176h50M409 220v58M384 322h50" fill="none" stroke="#8b96a3" stroke-width="3" stroke-linecap="round"/>
</svg>`;
}

function writePage(fileName, html) {
  fs.writeFileSync(path.join(publicDir, fileName), cleanHtml(html), "utf8");
}

function cleanHtml(html) {
  return String(html).replace(/[ \t]+$/gm, "");
}
