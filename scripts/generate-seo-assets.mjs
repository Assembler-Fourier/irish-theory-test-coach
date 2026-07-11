import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildProductSummary,
  formatAccessDuration,
} from "../shared/product-summary.js";
import {
  finalCta as sharedFinalCta,
  siteFooter as sharedSiteFooter,
} from "../shared/static-components.js";
import { canonicalSiteOrigin } from "../shared/growth-config.js";

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), "..");
const publicDir = path.join(root, "public");
const docsDir = path.join(root, "docs");
const templatesDir = path.join(docsDir, "seo-templates");
const siteUrl = canonicalSiteOrigin(process.env);
const disclaimer = "Independent practice tool. Not affiliated with RSA or Prometric.";
const productSummary = buildProductSummary({ root, env: process.env });
const activePlan = productSummary.pricing?.plans?.find((plan) => plan.active) || productSummary.pricing?.plans?.[0];

fs.mkdirSync(publicDir, { recursive: true });
fs.mkdirSync(docsDir, { recursive: true });
fs.mkdirSync(templatesDir, { recursive: true });

const keywordPages = [
  page("irish-theory-test-practice.html", "Irish Theory Test Practice for Category B Learners", "Practice Irish theory test topics with a free preview, estimated high-yield drills, road signs, mock exams, and a simple study plan.", "Irish theory test practice", "irish theory test practice", ["theory test ireland practice", "driver theory test ireland practice"], "Use this page when you want a practical place to start. It explains how to move from short practice sessions into timed mocks without pretending that any practice app can predict a live exam.", "Start free preview"),
  page("driver-theory-test-ireland.html", "Driver Theory Test Ireland Practice Guide", "Prepare for the Irish driver theory test with Category B practice, road signs, mock exams, and weak-area review from an independent tool.", "Driver theory test Ireland practice", "driver theory test ireland practice", ["theory test ireland practice", "car theory test ireland"], "This guide is for learner drivers who want a structured route through the main study areas: rules, risk, signs, vehicle control, and mock timing.", "Open the practice app"),
  page("category-b-theory-test-ireland.html", "Category B Theory Test Ireland Practice", "Study Category B car theory test topics with free preview questions, estimated priority drills, road signs, and 40-question mock practice.", "Category B theory test Ireland", "category b theory test ireland", ["car theory test ireland", "irish theory test questions and answers"], "Category B learners need broad coverage. The best sessions mix rules, signs, safe driving, vehicle control, and timed mock practice.", "Practise Category B"),
  page("mock-theory-test-ireland.html", "Mock Theory Test Ireland: 40-Question Practice Flow", "Take a timed 40-question mock theory test flow and learn how to review missed questions after each attempt.", "Mock theory test Ireland", "mock theory test ireland", ["car theory test mock exam", "driver theory mock test ireland"], "A useful mock is not just a score. It should show what to review next, especially repeated weak areas and road-sign recognition.", "Start mock practice"),
  page("irish-road-signs-test.html", "Irish Road Signs Test Practice", "Practise Irish road signs with image-focused drills, recognition tips, and links into road-sign mock practice.", "Irish road signs test", "irish road signs test", ["road signs ireland quiz", "road signs practice ireland"], "Road signs reward fast recognition. This page explains how to practise shape, colour, instruction, warning, and road-marking cues.", "Practise road signs"),
  page("rules-of-the-road-practice.html", "Rules of the Road Practice Test for Irish Learners", "Practise rules of the road topics with clear study steps, common mistakes, mock test links, and legal-safe guidance.", "Rules of the road practice test", "rules of the road practice test", ["theory test questions ireland", "theory test pass mark ireland"], "Rules questions can turn on small wording differences. Build the habit of slowing down and identifying the safest legal action.", "Drill rules questions"),
  page("theory-test-study-plan.html", "Theory Test Study Plan Ireland", "A simple Irish theory test study plan covering daily practice, road signs, high-yield review, mock exams, and missed-question cleanup.", "Theory test study plan Ireland", "theory test study plan ireland", ["failed theory test ireland", "mock theory test ireland"], "The best plan is repeatable: short daily practice, review missed items, repeat road signs, and use mock tests to check timing.", "Build your study plan"),
  page("failed-theory-test-ireland.html", "Failed Theory Test Ireland: What To Review Next", "A calm recovery plan after a failed Irish theory test attempt, focused on weak areas, road signs, timing, and mock review.", "Failed theory test Ireland", "failed theory test ireland", ["hardest theory test questions ireland", "most missed theory test questions ireland"], "Failing once gives you useful information. Use the next week to identify weak categories, redo signs, and practise timed mocks.", "Restart with review mode"),
  page("theory-test-questions-and-answers-ireland.html", "Theory Test Questions and Answers Ireland Practice", "Learn how to practise Irish theory test questions and answers safely with explanations, estimated priority, and review mode.", "Theory test questions and answers Ireland", "irish theory test questions and answers", ["theory test questions ireland", "irish theory test practice"], "Question practice works best when you study the reason behind the answer instead of memorising a single sentence.", "Preview questions"),
  page("hardest-theory-test-questions-ireland.html", "Hardest Theory Test Questions Ireland Practice", "Focus on harder Irish theory test practice areas with estimated high-yield signals, commonly missed themes, and review tips.", "Hardest theory test questions Ireland", "hardest theory test questions ireland", ["most missed theory test questions ireland", "35 out of 40 theory test ireland"], "Hard questions often combine risk, rules, exceptions, and wording. Practise them slowly, then revisit them under timed conditions.", "Drill hard questions"),
  page("theory-test-ireland-40-questions.html", "Theory Test Ireland 40 Questions and 35 Pass Mark", "Understand the 40-question mock flow, the 35 out of 40 pass mark, and how to review after each timed attempt.", "Theory test Ireland 40 questions", "theory test ireland 40 questions", ["theory test pass mark ireland", "35 out of 40 theory test ireland"], "A mock should train pacing and review. Aim to understand why each missed answer was wrong before chasing another score.", "Take a 40-question mock"),
];

const legacyPages = [
  page("category-b-theory-test.html", "Category B Theory Test Practice Guide", "Independent Category B theory test practice guide with road signs, rules, mock exams, and weak-area review.", "Category B theory test practice", "category b theory test ireland", ["car theory test ireland", "driver theory test ireland practice"], "This shorter guide links into the deeper Category B page and the practice app.", "Start Category B practice"),
  page("irish-theory-test-road-signs.html", "Irish Theory Test Road Signs Practice", "Road-sign practice for Irish theory test learners with signs, markings, mock exams, and study tips.", "Irish theory test road signs", "irish road signs test", ["road signs ireland quiz", "road signs practice ireland"], "Use this road-sign hub when you want image-first practice and recognition tips.", "Open road-sign drills"),
  page("car-theory-test-mock-exam.html", "Car Theory Test Mock Exam Ireland", "Practise car theory test mock exam timing with 40-question sessions, review mode, and road-sign drills.", "Car theory test mock exam", "car theory test mock exam", ["driver theory mock test ireland", "mock theory test ireland"], "Use mock exams after you have covered rules, signs, and the most missed categories.", "Start a mock exam"),
];

const categoryPages = [
  categoryPage("legal-matters-rules-of-the-road.html", "Legal Matters and Rules of the Road Practice", "Legal Matters/Rules of the Road", "Legal and rules questions often ask what a driver must do, should do, or must not do. Practise these slowly because exact wording matters."),
  categoryPage("safe-and-responsible-driving.html", "Safe and Responsible Driving Practice", "Safe and Responsible Driving", "Safe driving questions focus on judgement, observation, courtesy, and reducing risk for other road users."),
  categoryPage("control-of-vehicle-practice.html", "Control of Vehicle Theory Test Practice", "Control of Vehicle", "Vehicle control questions cover steering, braking, positioning, speed choice, and how the vehicle responds in different conditions."),
  categoryPage("managing-risk-theory-test.html", "Managing Risk Theory Test Practice", "Managing Risk", "Managing risk means recognising hazards early and choosing the safest action before pressure builds."),
  categoryPage("technical-matters-theory-test.html", "Technical Matters Theory Test Practice", "Technical Matters", "Technical matters include vehicle condition, lights, tyres, warning symbols, loading, and checks that affect safety."),
  categoryPage("traffic-signs-regulatory-matters.html", "Traffic Signs and Regulatory Matters Practice", "Traffic Signs and Regulatory Matters", "Traffic sign and regulatory questions combine recognition with what the sign or marking requires you to do."),
  categoryPage("road-markings-ireland-practice.html", "Road Markings Ireland Practice", "Road markings", "Road markings help you read lanes, priorities, restrictions, and safe positioning before you reach a hazard."),
  categoryPage("regulatory-signs-ireland.html", "Regulatory Signs Ireland Practice", "Regulatory signs", "Regulatory signs tell you what you must or must not do. Practise shape, colour, and instruction together."),
  categoryPage("warning-signs-ireland.html", "Warning Signs Ireland Practice", "Warning signs", "Warning signs help you prepare early for bends, junctions, crossings, road works, and hazards."),
];

const assetPages = [
  assetPage("learn.html", "Irish Theory Test Learning Hub", "Browse all Irish theory test practice guides, road-sign resources, category pages, pricing, and launch checklists.", "Irish theory test learning hub", "Use this hub to reach every major guide within a couple of clicks.", "Explore all guides"),
  assetPage("pricing.html", "Pricing for Irish Theory Test Coach", "Compare free preview, launch offer, Full Study Pass, and instructor packs for Irish Theory Test Coach.", "Pricing", "Choose a learner plan or instructor pack. Access is independent, digital, and focused on practice.", "Unlock the full coach", true),
  assetPage("for-driving-instructors.html", "Irish Theory Test Practice for Driving Instructors", "A referral and student-code page for instructors who want to recommend Irish Theory Test Coach to learners.", "For driving instructors", "Driving instructors can request codes for learners and track a clear manual outreach workflow.", "Request instructor codes"),
  assetPage("free-road-signs-quiz.html", "Free Road Signs Quiz Ireland", "A free road-signs quiz asset for learners who want a quick image-focused practice round.", "Free road signs quiz", "Use this free page to warm up road-sign recognition before unlocking the full road-sign drill.", "Start free preview"),
  assetPage("irish-theory-test-study-checklist.html", "Irish Theory Test Study Checklist", "A printable Irish theory test study checklist covering rules, signs, mocks, weak areas, and launch-week review.", "Irish theory test study checklist", "Print or save this checklist before your next study week.", "Open the study plan"),
];

const allPages = [...keywordPages, ...legacyPages, ...categoryPages, ...assetPages];

for (const item of allPages) {
  fs.writeFileSync(path.join(publicDir, item.slug), cleanGeneratedHtml(renderPage(item)), "utf8");
}

writeHomeMetadata();
writeSitemap(allPages);
writeRobots();
writeDocs();

console.log(`Generated ${allPages.length} SEO pages and launch docs.`);

function page(slug, title, description, h1, primaryKeyword, secondaryKeywords, intro, cta) {
  return {
    slug,
    title,
    description,
    h1,
    primaryKeyword,
    secondaryKeywords,
    intro,
    cta,
    type: "guide",
    sections: [
      ["How to use this guide", `${intro} Start with a short session, then review every missed answer. The goal is not to memorise a page of text; it is to build a repeatable way to spot the safest answer, understand road-sign cues, and keep timing under control.`],
      ["What to practise first", "Begin with rules of the road, safe and responsible driving, traffic signs, vehicle control, managing risk, and technical matters. Mix easy recall with harder review. If you only practise one topic, you can feel prepared while still missing another common category."],
      ["A simple practice loop", "Try 15 preview questions, note the categories you miss, switch into targeted review, repeat road signs, and then use a 40-question mock. After the mock, do not chase another score immediately. Review missed questions and ask why the correct answer is safer or more precise."],
      ["Common mistakes", "Common mistakes include rushing words like must or should, treating road signs as picture memory only, ignoring wet-road or vulnerable-road-user clues, and skipping the explanation after a wrong answer. Use estimated high-yield labels as study priority, not exam prediction."],
    ],
    faqs: defaultFaqs(h1),
    related: defaultRelated(slug),
  };
}

function categoryPage(slug, title, category, intro) {
  return {
    slug,
    title,
    description: `${category} practice for Irish theory test learners with common mistakes, sample prompts, and links into mocks, road signs, pricing, and the app.`,
    h1: `${category} practice`,
    primaryKeyword: `${category.toLowerCase()} theory test practice`,
    secondaryKeywords: ["theory test questions ireland", "irish theory test practice"],
    intro,
    cta: "Practise this category",
    type: "category",
    sections: [
      ["Why this category matters", `${intro} This topic affects how quickly you identify the safest action in a real driving situation. Practise the idea behind the answer so you can recognise the same rule in different wording.`],
      ["Common mistakes", "Learners often rush the question stem, choose an answer that sounds familiar, or ignore a clue about weather, road users, signs, or legal wording. Slow practice helps you notice those clues before timed mocks."],
      ["Sample practice prompts", "Example prompts to practise: identify the safest action at a junction, choose the correct response to a warning sign, decide when to slow down for conditions, or explain why a vehicle check matters. These examples are paraphrased learning prompts, not copied competitor questions."],
      ["Next links", "After this category, open the mock exam page, repeat road signs, review the study plan, and check pricing if you want the full coach. Keeping category pages linked makes study flow smoother and keeps every important guide within a few clicks."],
    ],
    faqs: defaultFaqs(category),
    related: ["mock-theory-test-ireland.html", "irish-road-signs-test.html", "theory-test-study-plan.html", "pricing.html", "index.html"],
  };
}

function assetPage(slug, title, description, h1, intro, cta, pricing = false) {
  const sections = pricing
    ? [
        ["Free preview", `The free preview includes ${productSummary.previewLimit} questions and basic progress. It is enough to see the flow before paying.`],
        ["Launch offer", `When enabled, the launch offer is ${planPrice("launch_offer")} for the beta or launch period. It is a real launch price, not fake urgency.`],
        ["Full Study Pass", `The normal learner plan is ${planPrice("full_study_pass")} one-time for ${formatAccessDuration(productSummary)} to the full study path: question bank, estimated high-yield drills, road-sign drills, hardest questions, mock exams, review mode, restore access, and progress tools.`],
        ["Instructor packs", "Instructor packs are EUR 29 for 10 codes and EUR 69 for 25 codes. They are built for manual instructor referrals and student access-code workflows."],
      ]
    : [
        ["What this resource gives you", `${intro} It is designed as a useful public asset that can be shared with learners, instructors, or study groups without exposing the full premium question bank.`],
        ["How to use it", "Read the checklist or guide, open a free preview, then move into road signs, mock exams, or weak-area review. The strongest results come from repeating small sessions and checking explanations."],
        ["For instructors and referrals", "Instructor pages and code workflows are intended for manual outreach and learner support. Do not scrape email addresses or automate outreach without legal review."],
      ];

  return {
    slug,
    title,
    description,
    h1,
    primaryKeyword: h1.toLowerCase(),
    secondaryKeywords: ["irish theory test practice", "theory test ireland practice"],
    intro,
    cta,
    type: pricing ? "pricing" : "asset",
    sections,
    faqs: defaultFaqs(h1),
    related: defaultRelated(slug),
  };
}

function defaultFaqs(topic) {
  return [
    ["Is Irish Theory Test Coach official?", `No. ${disclaimer}`],
    ["Does high-yield mean these questions will appear?", "No. High-yield means estimated study priority based on signals such as difficulty, images, safety topics, and category coverage. It is not official exam frequency."],
    ["Can this guarantee a pass?", "No practice tool can guarantee a pass. Use it to practise, review weak areas, and build confidence with mock timing."],
    ["What should I do next?", "Start with the free preview, review missed answers, repeat road signs, then try a 40-question mock when you are ready."],
  ];
}

function defaultRelated(currentSlug) {
  return [
    "irish-theory-test-practice.html",
    "mock-theory-test-ireland.html",
    "irish-road-signs-test.html",
    "theory-test-study-plan.html",
    "pricing.html",
    "index.html",
  ].filter((slug) => slug !== currentSlug);
}

function renderPage(item) {
  const canonical = `${siteUrl}/${item.slug}`;
  const ogImage = `${siteUrl}/marketing/${ogImageFileForSlug(item.slug)}`;
  const jsonLd = [
    breadcrumbJsonLd(item),
    faqJsonLd(item),
    item.type === "pricing" ? softwareJsonLd(canonical) : null,
    item.slug === "learn.html" ? websiteJsonLd() : null,
  ].filter(Boolean);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(item.title)}</title>
    <meta name="description" content="${escapeHtml(item.description)}">
    <link rel="canonical" href="${canonical}">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="Irish Theory Test Coach">
    <meta property="og:title" content="${escapeHtml(item.title)}">
    <meta property="og:description" content="${escapeHtml(item.description)}">
    <meta property="og:url" content="${canonical}">
    <meta property="og:image" content="${ogImage}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(item.title)}">
    <meta name="twitter:description" content="${escapeHtml(item.description)}">
    <meta name="twitter:image" content="${ogImage}">
    <link rel="stylesheet" href="./styles.css?v=20260710-rebuild">
${jsonLd.map((data) => `    <script type="application/ld+json">${JSON.stringify(data)}</script>`).join("\n")}
  </head>
  <body>
    <div class="shell seo-shell">
      <header class="seo-topbar">
        <a class="brand-mark" href="/">Irish Theory Test Coach</a>
        <nav class="site-nav" aria-label="Primary navigation">
          <a href="/app">App</a>
          <a href="/learn">Learn</a>
          <a href="/road-signs">Road signs</a>
          <a href="/mock-exam">Mock exam</a>
          <a href="/pricing">Pricing</a>
        </nav>
      </header>
      <main class="seo-main">
        <nav class="breadcrumbs" aria-label="Breadcrumb">
          <a href="/">Home</a>
          <span>${escapeHtml(item.h1)}</span>
        </nav>
        <section class="seo-hero seo-hero-compact">
          <div class="seo-hero-content">
            <p class="eyebrow">${escapeHtml(item.primaryKeyword)}</p>
            <h1>${escapeHtml(item.h1)}</h1>
            <p>${escapeHtml(item.intro)}</p>
            <div class="seo-cta-row">
              <a class="button-primary" href="/app">${escapeHtml(item.cta)}</a>
              <a class="button-secondary" href="/pricing">View pricing</a>
            </div>
            <p class="hero-disclaimer">${disclaimer}</p>
          </div>
        </section>
        <section class="seo-band">
          <div class="seo-benefit-grid">
            ${benefitCards()}
          </div>
        </section>
        <article class="seo-card-band">
          ${item.sections.map(([heading, body]) => `<section><h2>${escapeHtml(heading)}</h2><p>${escapeHtml(body)}</p></section>`).join("\n          ")}
        </article>
        ${item.type === "pricing" ? pricingCards() : samplePractice()}
        <section class="seo-card-band related-articles">
          <h2>Related practice guides</h2>
          <div class="seo-link-grid">
            ${item.related.slice(0, 8).map((slug) => relatedLink(slug)).join("\n            ")}
          </div>
        </section>
        <section class="seo-card-band faq-section">
          <h2>FAQ</h2>
          ${item.faqs.map(([q, a]) => `<details open><summary>${escapeHtml(q)}</summary><p>${escapeHtml(a)}</p></details>`).join("\n          ")}
        </section>
        ${sharedFinalCta({ root: "", body: `${disclaimer} No outcome promises or live-test prediction claims.` })}
      </main>
      ${footer()}
    </div>
    <script src="./config.js?v=20260710-rebuild"></script>
    <script src="./pricing-config.js?v=20260710-rebuild"></script>
    <script src="./growth-config.js?v=20260710-rebuild"></script>
    <script type="module" src="./growth-tracking.js?v=20260710-rebuild"></script>
    <script type="module" src="./frontend-monitoring.js?v=20260710-rebuild"></script>
    ${item.type === "pricing" ? '<script type="module" src="./pricing.js?v=20260710-rebuild"></script>' : ""}
    <script src="./trust.js?v=20260710-rebuild"></script>
  </body>
</html>
`;
}

function benefitCards() {
  return [
    ["Drill high-yield", "Use estimated priority to decide what to review first."],
    ["Clear weak areas", "Turn missed and flagged questions into the next study round."],
    ["Practise road signs", "Repeat visual/sign questions until recognition feels quicker."],
    ["Take mock exams", "Use 40-question timed mocks to practise pacing and review."],
  ].map(([title, body]) => `<article class="seo-feature-card"><h2>${title}</h2><p>${body}</p></article>`).join("\n            ");
}

function samplePractice() {
  return `<section class="seo-card-band sample-practice">
          <h2>Sample practice flow</h2>
          <ol>
            <li>Answer 15 preview questions and note which category slows you down.</li>
            <li>Repeat road signs or rules if those answers feel uncertain.</li>
            <li>Take a 40-question mock only after reviewing missed answers.</li>
            <li>Use the study plan page to decide tomorrow's first topic.</li>
          </ol>
        </section>`;
}

function pricingCards() {
  return `<section class="seo-card-band pricing-grid">
          ${[
            ["Free preview", "EUR 0", `${productSummary.previewLimit} questions, basic progress, and a quick look at the study flow.`, ""],
            ["Launch offer", planPrice("launch_offer"), "One-time launch access for the beta/launch period when enabled.", "launch_offer"],
            ["Full Study Pass", planPrice("full_study_pass"), `One-time ${formatAccessDuration(productSummary)} to the full coach, mocks, review, signs, and restore access. Repeat purchases extend access.`, "full_study_pass"],
            ["Instructor 10", planPrice("instructor_10", "EUR 29.00"), "Ten learner codes for instructors and small groups.", "instructor_10"],
            ["Instructor 25", planPrice("instructor_25", "EUR 69.00"), "Twenty-five learner codes for instructors with larger groups.", "instructor_25"],
          ].map(([label, price, copy, plan]) => `<article class="pricing-plan-card"><h2>${label}</h2><strong>${price}</strong><p>${copy}</p>${plan ? `<button class="button-primary" data-plan-checkout="${plan}" type="button">Choose ${label}</button>` : '<a class="button-secondary" href="/app">Start preview</a>'}<p class="pricing-plan-status" role="status" aria-live="polite"></p><p><a href="/app#restoreEmail">Restore access</a>, <a href="/refunds.html">refunds</a>, <a href="/terms.html">terms</a>, or <a href="/support">support</a>.</p></article>`).join("\n          ")}
        </section>`;
}

function planPrice(planKey, fallback = "EUR 0.00") {
  return productSummary.pricing?.plans?.find((plan) => plan.key === planKey)?.displayPrice || fallback;
}

function relatedLink(slug) {
  const item = allPages.find((pageItem) => pageItem.slug === slug);
  const title = item?.h1 || (slug === "index.html" ? "Practice app" : slug.replace(/[-.]/g, " "));
  return `<a href="./${slug}">${escapeHtml(title)}</a>`;
}

function ogImageFileForSlug(slug) {
  if (slug.includes("pricing")) return "og-pricing.svg";
  if (slug.includes("mock") || slug.includes("40-questions")) return "og-mock-exam.svg";
  if (slug.includes("sign") || slug.includes("road-marking")) return "og-road-signs.svg";
  if (slug === "learn.html" || slug.includes("study-plan") || slug.includes("checklist")) return "og-learn.svg";
  if (slug.includes("instructor")) return "og-instructors.svg";
  return "og-home.svg";
}

function footer() {
  return sharedSiteFooter({ root: "", disclaimer });
}

function breadcrumbJsonLd(item) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${siteUrl}/` },
      { "@type": "ListItem", position: 2, name: item.h1, item: `${siteUrl}/${item.slug}` },
    ],
  };
}

function faqJsonLd(item) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: item.faqs.map(([name, text]) => ({
      "@type": "Question",
      name,
      acceptedAnswer: { "@type": "Answer", text },
    })),
  };
}

function softwareJsonLd(url) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Irish Theory Test Coach",
    applicationCategory: "EducationalApplication",
    operatingSystem: "Web",
    url,
    description: "Independent Irish Category B theory-test practice app with road signs, mock exams, estimated high-yield drills, and progress tracking.",
    offers: { "@type": "Offer", price: String((activePlan?.amountCents || 0) / 100), priceCurrency: activePlan?.currency || "EUR" },
  };
}

function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Irish Theory Test Coach",
    url: siteUrl,
    description: "Independent Irish theory test practice guides and app.",
  };
}

function writeSitemap(pages) {
  const entries = [
    ["/", "weekly", "1.0"],
    ...pages.map((item) => [`/${item.slug}`, item.type === "asset" ? "monthly" : "weekly", item.type === "pricing" ? "0.9" : "0.8"]),
    ["/privacy.html", "yearly", "0.3"],
    ["/terms.html", "yearly", "0.3"],
    ["/refunds.html", "yearly", "0.3"],
    ["/contact.html", "yearly", "0.3"],
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map(([urlPath, changefreq, priority]) => `  <url>
    <loc>${siteUrl}${urlPath}</loc>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`).join("\n")}
</urlset>
`;
  fs.writeFileSync(path.join(publicDir, "sitemap.xml"), xml, "utf8");
}

function writeRobots() {
  fs.writeFileSync(
    path.join(publicDir, "robots.txt"),
    `User-agent: *\nAllow: /\nDisallow: /admin\nSitemap: ${siteUrl}/sitemap.xml\n`,
    "utf8",
  );
}

function writeHomeMetadata() {
  const homePath = path.join(publicDir, "index.html");
  if (!fs.existsSync(homePath)) return;

  const html = fs.readFileSync(homePath, "utf8").replace(
    /https:\/\/irish-theory-test-coach(?:\.com|\.vercel\.app)/g,
    siteUrl,
  );
  fs.writeFileSync(homePath, html, "utf8");
}

function writeLegalPages() {
  const legal = [
    {
      slug: "privacy.html",
      title: "Privacy Policy - Irish Theory Test Coach",
      description: "Privacy policy for Irish Theory Test Coach, including first-party analytics, progress storage, payments, and support contact.",
      h1: "Privacy Policy",
      sections: [
        ["Who we are", "Irish Theory Test Coach is an independent practice tool for Irish Category B theory-test study. It is not affiliated with RSA or Prometric."],
        ["Information we collect", "The app may store local progress, anonymous first-party analytics events, purchase status, and email addresses used for restore access."],
        ["Payments", "Payments are handled by Stripe. We do not store card numbers on this website."],
        ["Contact", "For privacy questions, contact support using the contact page."],
      ],
    },
    {
      slug: "terms.html",
      title: "Terms of Use - Irish Theory Test Coach",
      description: "Terms of use for Irish Theory Test Coach, an independent Category B practice and study tool.",
      h1: "Terms of Use",
      sections: [
        ["Independent practice tool", "Irish Theory Test Coach is independent and is not affiliated with RSA or Prometric."],
    ["No outcome promise", "The app helps you practise and review weak areas. It does not promise any test outcome or claim knowledge of live-test content."],
        ["Digital access", "Paid learner access is one-time digital access for the plan duration shown at checkout."],
        ["Acceptable use", "Do not scrape, resell, overload, or interfere with the service."],
      ],
    },
    {
      slug: "refunds.html",
      title: "Refund Policy - Irish Theory Test Coach",
      description: "Refund policy for Irish Theory Test Coach digital study access, duplicate purchases, and technical access issues.",
      h1: "Refund Policy",
      sections: [
        ["Simple digital refunds", "If you purchased by mistake, bought duplicate access, or cannot access the product because of a technical issue we cannot resolve, contact support."],
        ["Refund window", "Please contact support within 14 days of purchase and include the email used at checkout."],
        ["When refunds may be declined", "Refunds may be declined where access was delivered and substantially used, or where the request is abusive."],
        ["No outcome refunds", "We do not offer refunds based on test outcomes because the app does not guarantee a pass."],
      ],
    },
    {
      slug: "contact.html",
      title: "Contact Irish Theory Test Coach",
      description: "Contact Irish Theory Test Coach support for access, refunds, privacy, pricing, instructor codes, and purchase questions.",
      h1: "Contact",
      sections: [
        ["Support email", "For support, purchase questions, refund requests, privacy questions, or instructor-code requests, email support from this page."],
        ["What to include", "If your message is about a purchase, include the checkout email and a short description. Do not send card numbers."],
        ["Independent status", "Irish Theory Test Coach cannot book, change, cancel, or manage theory-test appointments."],
      ],
    },
  ];

  for (const item of legal) {
    fs.writeFileSync(path.join(publicDir, item.slug), cleanGeneratedHtml(renderLegalPage(item)), "utf8");
  }
}

function renderLegalPage(item) {
  const canonical = `${siteUrl}/${item.slug}`;
  const ogImage = `${siteUrl}/marketing/${ogImageFileForSlug(item.slug)}`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(item.title)}</title>
    <meta name="description" content="${escapeHtml(item.description)}">
    <link rel="canonical" href="${canonical}">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="Irish Theory Test Coach">
    <meta property="og:title" content="${escapeHtml(item.title)}">
    <meta property="og:description" content="${escapeHtml(item.description)}">
    <meta property="og:url" content="${canonical}">
    <meta property="og:image" content="${ogImage}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(item.title)}">
    <meta name="twitter:description" content="${escapeHtml(item.description)}">
    <meta name="twitter:image" content="${ogImage}">
    <link rel="stylesheet" href="./styles.css?v=20260710-rebuild">
  </head>
  <body>
    <div class="shell legal-shell">
      <header class="legal-header">
        <a href="/">Irish Theory Test Coach</a>
        <p>${disclaimer}</p>
      </header>
      <main class="legal-page">
        <h1>${escapeHtml(item.h1)}</h1>
        <p>Last updated: July 10, 2026</p>
        ${item.sections.map(([heading, body]) => `<section><h2>${escapeHtml(heading)}</h2><p>${escapeHtml(body)}</p></section>`).join("\n        ")}
        <section><h2>Contact</h2><p>Email <a data-support-email href="mailto:support@irish-theory-test-coach.com">support@irish-theory-test-coach.com</a>.</p></section>
      </main>
      ${footer()}
    </div>
    <script src="./config.js?v=20260710-rebuild"></script>
    <script src="./trust.js?v=20260710-rebuild"></script>
  </body>
</html>
`;
}

function writeDocs() {
  fs.writeFileSync(path.join(docsDir, "seo-keyword-map.md"), keywordMapDoc(), "utf8");
  fs.writeFileSync(path.join(docsDir, "seo-style-rules.md"), seoStyleRules(), "utf8");
  fs.writeFileSync(path.join(docsDir, "pricing-strategy.md"), pricingStrategy(), "utf8");
  fs.writeFileSync(path.join(docsDir, "revenue-dashboard.md"), revenueDashboard(), "utf8");
  fs.writeFileSync(path.join(docsDir, "structured-data.md"), structuredDataDoc(), "utf8");
  fs.writeFileSync(path.join(docsDir, "search-console-launch.md"), searchConsoleDoc(), "utf8");
  fs.writeFileSync(path.join(docsDir, "seo-weekly-report-template.md"), weeklyReportDoc(), "utf8");
  fs.writeFileSync(path.join(docsDir, "instructor-outreach.md"), instructorOutreachDoc(), "utf8");
  fs.writeFileSync(path.join(docsDir, "content-calendar-90-days.md"), contentCalendarDoc(), "utf8");
  fs.writeFileSync(path.join(docsDir, "ui-qa-report.md"), uiQaReportDoc(), "utf8");

  const templateBody = (name) => `# ${name}

Use this template for Irish Theory Test Coach SEO pages.

- Unique H1:
- Unique title:
- Unique meta description:
- Primary keyword:
- Secondary keywords:
- Disclaimer: ${disclaimer}
- CTA: Start free preview / Unlock full coach
- Internal links: app, pricing, road signs, mock exam, study plan
- FAQ: only add FAQPage JSON-LD when FAQ is visible on-page
- Claims check: no official affiliation, no guaranteed pass, no official frequency, no copied competitor questions.
`;
  for (const name of [
    "guide-page-template.md",
    "road-sign-page-template.md",
    "category-page-template.md",
    "failed-test-recovery-template.md",
    "comparison-page-template.md",
  ]) {
    fs.writeFileSync(path.join(templatesDir, name), templateBody(name.replace(/-/g, " ").replace(".md", "")), "utf8");
  }
}

function keywordMapDoc() {
  const clusters = [
    ["irish theory test practice", "irish-theory-test-practice.html"],
    ["theory test ireland practice", "irish-theory-test-practice.html"],
    ["driver theory test ireland practice", "driver-theory-test-ireland.html"],
    ["category b theory test ireland", "category-b-theory-test-ireland.html"],
    ["car theory test ireland", "category-b-theory-test-ireland.html"],
    ["mock theory test ireland", "mock-theory-test-ireland.html"],
    ["irish road signs test", "irish-road-signs-test.html"],
    ["road signs ireland quiz", "free-road-signs-quiz.html"],
    ["rules of the road practice test", "rules-of-the-road-practice.html"],
    ["theory test study plan ireland", "theory-test-study-plan.html"],
    ["failed theory test ireland", "failed-theory-test-ireland.html"],
    ["hardest theory test questions ireland", "hardest-theory-test-questions-ireland.html"],
  ];
  return (`# SEO Keyword Map

${clusters.map(([keyword, url]) => `## ${keyword}

- Primary keyword: ${keyword}
- Secondary keywords: ${keywordPages.find((p) => p.slug === url)?.secondaryKeywords.join(", ") || "irish theory test practice, theory test ireland practice"}
- Search intent: learner wants practical Irish theory test study help.
- Target URL: /${url}
- Page type: guide / landing page
- CTA: Start free preview, then view pricing.
- Internal links: /learn.html, /pricing.html, /mock-theory-test-ireland.html, /irish-road-signs-test.html, /theory-test-study-plan.html
`).join("\n")}
`).trimEnd() + "\n";
}

function seoStyleRules() {
  return `# SEO Style Rules

- No official RSA, Prometric, TheoryTest.ie, or testing-provider affiliation claims.
- No guaranteed-pass claims.
- No official-frequency claims.
- No copied competitor questions.
- "High-yield" means estimated study priority, not exam prediction.
- Keep disclaimers visible on public pages.
`;
}

function pricingStrategy() {
  return `# Pricing Strategy

Plans:

- Free preview: ${productSummary.previewLimit} questions and basic progress.
- Launch offer: ${planPrice("launch_offer")} one-time only when \`LAUNCH_OFFER_ENABLED=true\` and \`LAUNCH_OFFER_ENDS_AT\` has not passed.
- Full Study Pass: ${planPrice("full_study_pass")} one-time for ${formatAccessDuration(productSummary)}.
- Instructor 10: ${planPrice("instructor_10")} for 10 codes.
- Instructor 25: ${planPrice("instructor_25")} for 25 codes.

Stripe env vars:

- \`STRIPE_PRICE_ID_LAUNCH\`
- \`STRIPE_PRICE_ID_FULL\`
- \`STRIPE_PRICE_ID_INSTRUCTOR_10\`
- \`STRIPE_PRICE_ID_INSTRUCTOR_25\`
- \`STRIPE_PRICE_ID\` remains a backward-compatible fallback only.

To switch the launch offer off, set \`LAUNCH_OFFER_ENABLED=false\` in Vercel production env vars, redeploy, and run checkout tests for the Full Study Pass.
`;
}

function revenueDashboard() {
  return `# Revenue Dashboard

The admin dashboard tracks gross revenue, estimated Stripe fees, estimated net revenue, sales by plan, refund count when available, active entitlements, and instructor/referral revenue.

CSV exports:

- Purchases: \`/api/admin/export?type=purchases\`
- Referrals: \`/api/admin/export?type=referrals\`

Exports require server-side admin authorization. Do not expose card data, secret keys, webhook secrets, or raw stack traces.
`;
}

function structuredDataDoc() {
  return `# Structured Data

Use BreadcrumbList on landing pages, FAQPage only where FAQ is visible, and SoftwareApplication on the app/pricing pages with independent-tool wording.

Do not add fake review stars, fake aggregate ratings, fake organisation affiliation, or fake official status.

The site does not currently expose a crawlable search-results URL, so WebSite JSON-LD is added without SearchAction.
`;
}

function searchConsoleDoc() {
  return `# Search Console Launch

1. Connect the custom domain.
2. Verify the domain property in Google Search Console.
3. Submit \`${siteUrl}/sitemap.xml\`.
4. Inspect homepage, app, pricing, mock exam, road signs, study plan, and Category B pages.
5. Request indexing for priority pages.
6. Check the rendered HTML screenshot in URL Inspection.
7. Monitor indexing, impressions, clicks, CTR, and average position weekly.
`;
}

function weeklyReportDoc() {
  return `# SEO Weekly Report Template

- Week:
- Pages published:
- Pages indexed:
- Priority keywords:
- Impressions:
- Clicks:
- CTR:
- Average position:
- Internal links added:
- Issues found:
- Next actions:
`;
}

function instructorOutreachDoc() {
  return `# Instructor Outreach

Do not scrape instructor emails automatically unless legally reviewed. Use manual outreach.

## Email snippet

Subject: Independent theory-test practice tool for your learners

Hi [Name],

I built Irish Theory Test Coach, an independent Category B practice app with free preview questions, road signs, mock exams, and review mode. It is not affiliated with RSA or Prometric and does not make guaranteed-pass claims.

Would you like a small set of student access codes to test with learners?

Thanks,
[Your name]
`;
}

function contentCalendarDoc() {
  const ideas = Array.from({ length: 36 }, (_, index) => {
    const seed = [
      "Road signs learners mix up",
      "How to review a failed mock",
      "Rules wording traps",
      "Wet road practice plan",
      "Category B weekly study schedule",
      "Most missed safety themes",
    ][index % 6];
    return `${index + 1}. ${seed} - article with CTA to free preview and related guide links.`;
  }).join("\n");
  return `# 90-Day SEO Content Calendar

Publish three pieces per week for 12 weeks.

${ideas}
`;
}

function uiQaReportDoc() {
  return `# UI QA Report

Generated by \`npm run generate:seo\`; refresh screenshots with \`npm run screenshots:ui\`.

## Screenshots Checked

Expected output directory: \`reports/ui/latest/\`.

- \`desktop-app-preview.png\` - app preview, study plan, question card, sidebar progress.
- \`desktop-paywall.png\` - locked premium mode and full-study-path paywall.
- \`answer-feedback.png\` - answer state, feedback panel, explanation action, quiz footer.
- \`restore-access.png\` - restore-access form and support copy.
- \`seo-landing-page.png\` - study-plan landing page hierarchy, FAQ, CTA, related links.
- \`pricing-page.png\` - pricing hero, feature cards, plan copy, independent-tool disclaimer.
- \`learn-hub.png\` - content hub and internal links.
- \`contact-page.png\` - mobile trust/legal page layout.
- \`admin-locked-state.png\` - logged-out/non-admin protected state.
- \`mobile-app-preview.png\` - mobile app preview and sticky CTA behavior.
- \`mobile-paywall.png\` - mobile paywall sheet, restore link, pricing copy.

## Automated Checks

- Run \`npm run qa\`.
- Run \`npm run check:seo\`.
- Run final \`node --check\` on changed JavaScript files.

## Issues Found

- Watch for stale pricing copy after plan changes.
- Watch for FAQ JSON-LD that does not match visible FAQ copy.
- Watch for landing-page contrast issues on dark hero overlays.
- Watch for sticky mobile CTAs covering quiz controls.

## Issues Fixed In The Pricing/SEO Pass

- Central pricing labels and plan-aware checkout CTAs.
- Pricing and learning hub links.
- Sitemap expansion and internal linking.
- Screenshot capture targeting responsive visible controls.

## Remaining Issues

- Run a real Stripe checkout in production after setting live price IDs.
- Verify referral-code purchase analytics with a real or seeded production-like checkout.
- Review all generated SEO copy before large-scale content publishing.
`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cleanSiteUrl(value) {
  const url = new URL(String(value || defaultSiteUrl));
  return url.origin;
}

function cleanGeneratedHtml(html) {
  return String(html).replace(/[ \t]+$/gm, "");
}
