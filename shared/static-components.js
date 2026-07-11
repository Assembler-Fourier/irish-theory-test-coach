export function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function siteHeader(options = {}) {
  const active = options.active || "";
  const root = options.root ?? ".";
  const links = [
    ["Home", `${root}/`, "home"],
    ["App", `${root}/app`, "app"],
    ["Pricing", `${root}/pricing`, "pricing"],
    ["Learn", `${root}/learn`, "learn"],
    ["Road signs", `${root}/road-signs`, "road-signs"],
    ["Mock exam", `${root}/mock-exam`, "mock-exam"],
    ["Support", `${root}/support`, "support"],
  ];

  return `<header class="site-header">
        <a class="brand-mark" href="${root}/" aria-label="Irish Theory Test Coach home">
          <span class="brand-symbol" aria-hidden="true">TC</span>
          <span class="brand-copy"><strong>Theory Coach</strong><small>Independent Irish learner practice</small></span>
        </a>
        <nav class="site-nav" aria-label="Primary navigation">
          ${links.map(([label, href, key]) => `<a${active === key ? ' class="active"' : ""} href="${href}">${label}</a>`).join("\n          ")}
        </nav>
        <div class="nav-actions">
          <a class="button-secondary" href="${root}/account">Restore access</a>
          <a class="button-primary" href="${root}/app">Start free preview</a>
        </div>
      </header>`;
}

export function siteFooter(options = {}) {
  const disclaimer = options.disclaimer || "Independent practice tool. Not affiliated with RSA or Prometric.";
  const root = options.root ?? ".";
  return `<footer class="site-footer">
        <div class="footer-brand">
          <a class="brand-mark" href="${root}/">
            <span class="brand-symbol" aria-hidden="true">TC</span>
            <span class="brand-copy"><strong>Theory Coach</strong><small>Irish Category B practice</small></span>
          </a>
          <p>Focused practice, transparent pricing, and review tools for Irish learner drivers.</p>
        </div>
        <nav aria-label="Product links">
          <strong>Product</strong>
          <a href="${root}/app">Learner app</a>
          <a href="${root}/pricing">Pricing</a>
          <a href="${root}/account">Account access</a>
          <a href="${root}/support">Support</a>
        </nav>
        <nav aria-label="Learning links">
          <strong>Learn</strong>
          <a href="${root}/learn">Learning hub</a>
          <a href="${root}/road-signs">Road signs</a>
          <a href="${root}/mock-exam">Mock exam</a>
          <a href="${root}/theory-test-study-plan.html">Study plan</a>
        </nav>
        <nav aria-label="Legal links">
          <strong>Trust</strong>
          <a href="${root}/privacy.html">Privacy</a>
          <a href="${root}/terms.html">Terms</a>
          <a href="${root}/refunds.html">Refunds</a>
          <a href="${root}/contact.html">Contact</a>
        </nav>
        <p class="footer-disclaimer">${escapeHtml(disclaimer)}</p>
      </footer>`;
}

export function finalCta(options = {}) {
  const title = options.title || "Start with the free preview, then unlock the full study path when it fits.";
  const body = options.body || "Independent practice tool. No outcome promises or live-test prediction claims.";
  const root = options.root ?? ".";
  return `<section class="site-cta-strip">
        <div>
          <p class="eyebrow">Ready when you are</p>
          <h2>${escapeHtml(title)}</h2>
          <p>${escapeHtml(body)}</p>
        </div>
        <div class="cta-row">
          <a class="button-primary" href="${root}/app">Start free preview</a>
          <a class="button-secondary" href="${root}/pricing">Compare plans</a>
        </div>
      </section>`;
}

export function featureCards(items) {
  return items.map((item) => `<article class="feature-card">
          <span>${escapeHtml(item.kicker || "")}</span>
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.body)}</p>
        </article>`).join("\n        ");
}

export function pricingCards(productSummary, options = {}) {
  const root = options.root ?? ".";
  const plans = productSummary.pricing?.plans || [];
  const plan = (key, fallback) => plans.find((item) => item.key === key) || fallback;
  const full = plan("full_study_pass", { displayPrice: productSummary.activePrice || "EUR 4.99", entitlementDays: productSummary.accessDurationDays || 90 });
  const launch = plan("launch_offer", { displayPrice: "EUR 2.99" });
  const instructor10 = plan("instructor_10", { displayPrice: "EUR 29.00" });
  const instructor25 = plan("instructor_25", { displayPrice: "EUR 69.00" });
  const accessLabel = `${full.entitlementDays || productSummary.accessDurationDays || 90}-day access`;

  return `<section class="pricing-comparison-grid" aria-label="Pricing comparison">
        <article class="pricing-card">
          <p class="eyebrow">Free preview</p>
          <h3>Try the workflow</h3>
          <strong>EUR 0</strong>
          <ul>
            <li>${productSummary.previewLimit || 15} questions</li>
            <li>Basic progress</li>
            <li>Sample answer feedback</li>
          </ul>
          <a class="button-secondary" href="${root}/app">Start preview</a>
        </article>
        <article class="pricing-card pricing-card-featured">
          <p class="eyebrow">Full Study Pass</p>
          <h3>Complete learner access</h3>
          <strong>${escapeHtml(full.displayPrice)}</strong>
          <p>${escapeHtml(accessLabel)}. One-time access to the full practice path. Repeat purchases extend access.</p>
          <ul>
            <li>${productSummary.totalPublishedQuestions?.toLocaleString("en-IE") || "Full"} practice questions</li>
            <li>${productSummary.estimatedPriorityQuestionCount?.toLocaleString("en-IE") || "Estimated"} priority drills</li>
            <li>${productSummary.signOrImageQuestionCount?.toLocaleString("en-IE") || "Road-sign"} sign and image questions</li>
            <li>Mock exams and review mode</li>
          </ul>
          <a class="button-primary" href="${root}/pricing">Unlock full coach</a>
          <p class="pricing-support-note"><a href="${root}/refunds.html">Refunds</a>, <a href="${root}/terms.html">terms</a>, and <a href="${root}/support">support</a> are visible before checkout.</p>
        </article>
        <article class="pricing-card">
          <p class="eyebrow">Launch offer</p>
          <h3>Beta-period learner price</h3>
          <strong>${escapeHtml(launch.displayPrice)}</strong>
          <p>Shown only when enabled. No fake scarcity or outcome-promise wording.</p>
          <a class="button-secondary" href="${root}/pricing">Check availability</a>
        </article>
        <article class="pricing-card">
          <p class="eyebrow">Instructor packs</p>
          <h3>Student access codes</h3>
          <strong>${escapeHtml(instructor10.displayPrice)} / ${escapeHtml(instructor25.displayPrice)}</strong>
          <p>Ten-code and twenty-five-code packs for instructors or learner groups.</p>
          <a class="button-secondary" href="${root}/for-driving-instructors.html">Instructor info</a>
        </article>
      </section>`;
}

export function pageMeta({ title, description, canonical, ogImage, noindex = false }) {
  return `<title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    ${noindex ? '<meta name="robots" content="noindex,nofollow">' : ""}
    <link rel="canonical" href="${canonical}">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="Irish Theory Test Coach">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:url" content="${canonical}">
    <meta property="og:image" content="${ogImage}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:description" content="${escapeHtml(description)}">
    <meta name="twitter:image" content="${ogImage}">`;
}
