const baseUrl = cleanBaseUrl(process.argv[2] || process.env.POST_DEPLOY_SMOKE_BASE_URL || process.env.PUBLIC_SITE_URL || "");

if (!baseUrl) {
  console.error("Usage: node scripts/post-deploy-smoke.mjs https://your-site.example");
  process.exit(1);
}

const checks = [
  ["homepage", () => expectHtml("/", /Irish Theory Test Coach|Independent/i)],
  ["app preview shell", () => expectHtml("/app", /question-view|Start free preview|Irish Theory Test Coach/i)],
  ["preview package", () => expectJson("/data/preview-questions.json", (json) => Array.isArray(json.questions) && json.questions.length <= Number(json.previewLimit || 15))],
  ["api health", () => expectJson("/api/health", (json) => json.ok === true)],
  ["pricing config", () => expectJson("/pricing.json", (json) => Array.isArray(json.plans) && json.plans.length > 0)],
  ["legal centre", () => expectHtml("/legal.html", /Legal and Trust Centre/i)],
  ["terms", () => expectHtml("/terms.html", /Terms &amp; Conditions|Terms & Conditions/i)],
  ["privacy consent", () => expectHtml("/cookies.html", /Optional first-party analytics remain off until you allow them/i)],
  ["security assurance", () => expectHtml("/security.html", /not currently represented as SOC 2 certified/i)],
  ["restore generic response", () => postRestore()],
  ["unauthorised admin rejection", () => expectStatus("/api/admin/stats", [401, 403, 500])],
  ["sitemap", () => expectText("/sitemap.xml", /<urlset/i)],
  ["robots", () => expectText("/robots.txt", /Sitemap:/i)],
  ["pwa manifest", () => expectJson("/manifest.webmanifest", (json) => Boolean(json.name && json.start_url))],
  ["protected premium rejection", () => postProtectedSession()],
];

for (const [name, check] of checks) {
  try {
    await check();
    console.log(`Smoke passed: ${name}`);
  } catch (error) {
    console.error(`Smoke failed: ${name}: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.exitCode) process.exit(process.exitCode);
console.log(`Post-deploy smoke checks passed for ${baseUrl}`);

async function expectHtml(path, pattern) {
  const response = await fetchUrl(path);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = await response.text();
  if (!pattern.test(text)) throw new Error("Expected content missing.");
}

async function expectText(path, pattern) {
  const response = await fetchUrl(path);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = await response.text();
  if (!pattern.test(text)) throw new Error("Expected text missing.");
}

async function expectJson(path, predicate) {
  const response = await fetchUrl(path);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const json = await response.json();
  if (!predicate(json)) throw new Error("JSON predicate failed.");
}

async function expectStatus(path, allowed) {
  const response = await fetchUrl(path);
  if (!allowed.includes(response.status)) throw new Error(`HTTP ${response.status}`);
}

async function postRestore() {
  const response = await fetchUrl("/api/request-login-link", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: baseUrl,
    },
    body: JSON.stringify({ email: "smoke-test-no-access@example.invalid", source: "post_deploy_smoke" }),
  });
  if (![200, 400, 429, 503].includes(response.status)) throw new Error(`HTTP ${response.status}`);
  const json = await response.json().catch(() => ({}));
  if (response.status === 200 && !json.message) throw new Error("Missing generic restore message.");
}

async function postProtectedSession() {
  const response = await fetchUrl("/api/v1/study-sessions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: baseUrl,
    },
    body: JSON.stringify({ mode: "highYield" }),
  });
  if (![401, 402, 403, 429].includes(response.status)) throw new Error(`HTTP ${response.status}`);
}

function fetchUrl(path, options = {}) {
  return fetch(new URL(path, baseUrl), {
    redirect: "follow",
    ...options,
  });
}

function cleanBaseUrl(value) {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}
