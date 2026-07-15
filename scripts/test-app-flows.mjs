import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(repoRoot, "public");
const nonAffiliation = "Independent practice tool. Not affiliated with RSA or Prometric.";

const flowChecks = [
  checkMarketingHomeContract,
  checkPreviewLoads,
  checkAnswerFlowContract,
  checkPremiumPaywallContract,
  checkLegalPagesLoad,
  checkRestoreAccessContract,
  checkAccountPageContract,
  checkMockTestContract,
];

const server = await startStaticServer();

try {
  const context = {
    baseUrl: server.baseUrl,
    html: await fetchText(server.baseUrl, "/"),
    appHtml: await fetchText(server.baseUrl, "/app"),
    appJs: await fetchText(server.baseUrl, "/app.js"),
    previewPackage: await fetchJson(server.baseUrl, "/data/preview-questions.json"),
    productSummary: await fetchJson(server.baseUrl, "/product-summary.json"),
  };

  for (const check of flowChecks) {
    await check(context);
  }

  console.log(`App flow QA passed (${flowChecks.length} checks).`);
} finally {
  await server.close();
}

async function checkMarketingHomeContract({ html }) {
  assert.match(html, /<body class="marketing-page">/, "Homepage should use the commercial marketing surface.");
  assert.match(html, /Irish theory test practice, organised around what you miss./, "Homepage should present the current learner value proposition.");
  assert.match(html, /class="marketing-hero"/, "Homepage should include the commercial hero.");
  assert.doesNotMatch(html, /id="questionMount"/, "Homepage must not show the learner dashboard question mount.");
  assert.doesNotMatch(html, /src="\.\/app\.js/, "Homepage must not load the learner app bundle.");
  assert.match(html, /href="\/app"/, "Homepage should link to the learner app route.");
}

async function checkPreviewLoads({ appHtml, appJs, previewPackage }) {
  assert.match(appHtml, /id="questionMount"/, "Preview workspace is missing.");
  assert.match(appHtml, /id="questionTemplate"/, "Question template is missing.");
  assert.match(appHtml, /id="mobileModeSelect"/, "Accessible mobile mode selector is missing.");
  assert.match(appHtml, /id="answerLiveRegion"/, "Answer live region is missing.");
  assert.match(appHtml, /type="module"\s+src="\.\/app\.js(?:\?[^\"]+)?"/, "Frontend app module script is missing.");
  assert.match(appJs, /DATA_URLS = \["\.\/data\/preview-questions\.json"/, "App is not loading the preview package first.");
  assert.ok(Array.isArray(previewPackage.questions), "Preview package should include a questions array.");
  assert.ok(previewPackage.questions.length > 0, "Preview package should include questions.");
  assert.ok(previewPackage.questions.length <= previewPackage.previewLimit, "Preview package exceeds its preview limit.");

  const sample = previewPackage.questions.find((question) => Array.isArray(question.options) && question.options.length >= 2);
  assert.ok(sample, "Preview package should include answer options.");
  assert.equal(typeof sample.question, "string", "Question text should be present.");
  assertNoAnswerKeys(previewPackage);
}

function checkAnswerFlowContract({ appHtml, appJs }) {
  assert.match(appHtml, /<div class="answer-list"><\/div>/, "Answer list mount is missing.");
  assert.match(appJs, /button\.className = "answer-option"/, "Answer buttons are not created.");
  assert.match(appJs, /revealAnswerFromServer\(question, index\)/, "Answer reveal is not routed through the secure API.");
  assert.match(appJs, /paintAnswers\(answerList, question, index\)/, "Answer selection does not paint answers.");
  assert.match(appJs, /showFeedback\(feedback, question, index\)/, "Answer selection does not show feedback.");
  assert.match(appJs, /recordAnswer\(question, index, correct\)/, "Answer selection does not record server-confirmed progress.");
  assert.match(appJs, /Report a problem/, "Question problem-report action is missing.");
  assert.match(appJs, /\/api\/question-feedback/, "Question problem reports are not wired to the API.");
  assert.match(appJs, /eventName: "question_answered"/, "Answer analytics event is missing.");
}

function checkPremiumPaywallContract({ appHtml, appJs }) {
  assert.match(appHtml, /id="paywallTemplate"/, "Paywall template is missing.");
  assert.match(appHtml, /id="modeHighYield"/, "High-yield premium mode button is missing.");
  assert.match(appHtml, /id="modeHardest"/, "Hardest premium mode button is missing.");
  assert.match(appHtml, /id="modeSigns"/, "Road-sign premium mode button is missing.");
  assert.match(appHtml, /id="modeExam"/, "Mock-test premium mode button is missing.");
  assert.match(appHtml, /Unlock for EUR 4\.99/, "Paywall price copy is missing.");
  assert.match(appHtml, /pricing-config\.js/, "Frontend pricing config is missing.");
  assert.match(appHtml, /Have a code\?/, "Referral code form is missing.");
  assert.match(appJs, /function requiresAccess\(mode\)/, "Premium access guard is missing.");
  assert.match(appJs, /\["highYield", "hardest", "signs", "exam", "review"\]\.includes\(mode\)/, "Premium modes are not guarded.");
  assert.match(appJs, /trackEvent\("paywall_viewed"/, "Paywall analytics event is missing.");
}

async function checkLegalPagesLoad({ baseUrl }) {
  const pages = [
    ["/legal.html", "Legal and Trust Centre"],
    ["/privacy.html", "Privacy Notice"],
    ["/data-rights.html", "Your Data Rights"],
    ["/cookies.html", "Cookie &amp; Storage Notice"],
    ["/terms.html", "Terms &amp; Conditions"],
    ["/refunds.html", "Refund Policy"],
    ["/cancellation.html", "Cancellation Form"],
    ["/security.html", "Security &amp; Responsible Disclosure"],
    ["/contact.html", "Contact"],
    ["/accessibility.html", "Accessibility Statement"],
    ["/content-methodology.html", "Content Methodology"],
  ];

  for (const [urlPath, title] of pages) {
    const page = await fetchText(baseUrl, urlPath);
    assert.match(page, new RegExp(`<h1>${escapeRegExp(title)}</h1>`), `${urlPath} does not include the expected heading.`);
    assert.ok(page.includes(nonAffiliation), `${urlPath} is missing the non-affiliation disclaimer.`);
    assert.doesNotMatch(page, /<meta\s+name="robots"\s+content="noindex/i, `${urlPath} should be indexable before launch.`);
    assert.match(page, /privacy-consent\.js/, `${urlPath} should load privacy choices before analytics.`);
  }
}

function checkRestoreAccessContract({ appHtml, appJs }) {
  assert.match(appHtml, /id="restoreAccessLink"/, "Restore access link is missing.");
  assert.match(appHtml, /id="restoreForm"/, "Restore access form is missing.");
  assert.match(appHtml, /id="restoreEmail"\s+type="email"/, "Restore email input is missing.");
  assert.match(appJs, /function focusRestoreAccess\(event, source = "unknown"\)/, "Restore access focus handler is missing.");
  assert.match(appJs, /function requestLoginLink\(event\)/, "Magic-link request handler is missing.");
  assert.match(appJs, /\/api\/request-login-link/, "Restore access form is not wired to the API.");
}

async function checkAccountPageContract({ baseUrl }) {
  const accountHtml = await fetchText(baseUrl, "/account");
  const accountJs = await fetchText(baseUrl, "/account.js");
  assert.match(accountHtml, /id="accountApp"/, "Account app shell is missing.");
  assert.match(accountHtml, /id="accountRestoreForm"/, "Account restore form is missing.");
  assert.match(accountHtml, /id="accountLogoutAllBtn"/, "Logout-all action is missing.");
  assert.match(accountHtml, /id="accountExportBtn"/, "Account export action is missing.");
  assert.match(accountHtml, /id="accountDeleteForm"/, "Delete-account request form is missing.");
  assert.match(accountHtml, /src="\.\/account\.js(?:\?[^\"]+)?"/, "Account page module is missing.");
  assert.match(accountJs, /\/api\/account/, "Account page is not wired to the account API.");
  assert.match(accountJs, /\/api\/account-export/, "Account page is not wired to data export.");
  assert.match(accountJs, /\/api\/logout-all/, "Account page is not wired to logout-all.");
  assert.match(accountJs, /expired_link/, "Account page does not handle expired login links.");
  assert.match(accountJs, /used_link/, "Account page does not handle already-used login links.");
}

function checkMockTestContract({ appHtml, appJs, productSummary }) {
  assert.match(appHtml, /id="startExamBtn"/, "Start mock test button is missing.");
  assert.match(appHtml, /id="examBar"/, "Mock test status bar is missing.");
  assert.equal(productSummary.mockSize, 40, "Product summary should expose the 40-question mock size.");
  assert.equal(productSummary.mockDurationMinutes, 45, "Product summary should expose the 45-minute mock duration.");
  assert.match(appJs, /const EXAM_SIZE = positiveNumber\(PRODUCT_SUMMARY\.mockSize, 40\);/, "Mock test should use product summary mock size.");
  assert.match(appJs, /const PASS_MARK = 35;/, "Mock test should use the 35 pass mark.");
  assert.match(appJs, /async function startExam\(\)/, "Mock test start function is missing.");
  assert.match(appJs, /completeStudySession\(state\.studySession\.id/, "Mock test completion should use the secure study-session API.");
  assert.match(appJs, /trackEvent\("mock_started"/, "Mock test start analytics event is missing.");
  assert.match(appJs, /renderExamQuestion\(\)/, "Mock test does not render exam questions.");
}

function assertNoAnswerKeys(payload) {
  const text = JSON.stringify(payload);
  assert.doesNotMatch(text, /"correct(Index|Answer|_index|_answer)"\s*:/i, "Preview package exposes correct-answer fields.");
  assert.doesNotMatch(text, /"isCorrect"\s*:\s*true/i, "Preview package exposes option correctness.");
  assert.doesNotMatch(text, /"is_correct"\s*:\s*true/i, "Preview package exposes option correctness.");
  assert.doesNotMatch(text, /"explanation"\s*:\s*"[^\"]+/i, "Preview package exposes explanations.");
}

async function startStaticServer() {
  const server = createServer(async (req, res) => {
    try {
      const filePath = resolvePublicPath(req.url || "/");
      if (!filePath) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }

      const fileStat = await stat(filePath);
      const resolvedPath = fileStat.isDirectory() ? path.join(filePath, "index.html") : filePath;
      const body = await readFile(resolvedPath);
      res.writeHead(200, { "Content-Type": contentTypeFor(resolvedPath) });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

function resolvePublicPath(requestUrl) {
  const url = new URL(requestUrl, "http://127.0.0.1");
  const pathname = decodeURIComponent(url.pathname);
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const resolved = path.resolve(publicDir, relativePath);
  if (!(resolved === publicDir || resolved.startsWith(`${publicDir}${path.sep}`))) return null;
  if (path.extname(resolved)) return resolved;
  return `${resolved}.html`;
}

async function fetchText(baseUrl, urlPath) {
  const response = await fetch(`${baseUrl}${urlPath}`);
  assert.equal(response.status, 200, `${urlPath} should return 200.`);
  return response.text();
}

async function fetchJson(baseUrl, urlPath) {
  const response = await fetch(`${baseUrl}${urlPath}`);
  assert.equal(response.status, 200, `${urlPath} should return 200.`);
  return response.json();
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".xml": "application/xml; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".png": "image/png",
    ".webp": "image/webp",
  }[ext] || "application/octet-stream";
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
