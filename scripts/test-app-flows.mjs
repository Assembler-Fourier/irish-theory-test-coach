import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(repoRoot, "public");
const nonAffiliation = "Independent practice tool. Not affiliated with RSA or Prometric.";

const flowChecks = [
  checkPreviewLoads,
  checkAnswerFlowContract,
  checkPremiumPaywallContract,
  checkLegalPagesLoad,
  checkRestoreAccessContract,
  checkMockTestContract,
];

const server = await startStaticServer();

try {
  const context = {
    baseUrl: server.baseUrl,
    html: await fetchText(server.baseUrl, "/"),
    appJs: await fetchText(server.baseUrl, "/app.js"),
    questions: await fetchJson(server.baseUrl, "/data/questions.enriched.json"),
  };

  for (const check of flowChecks) {
    await check(context);
  }

  console.log(`App flow QA passed (${flowChecks.length} checks).`);
} finally {
  await server.close();
}

async function checkPreviewLoads({ html, appJs, questions }) {
  assert.match(html, /id="questionMount"/, "Preview workspace is missing.");
  assert.match(html, /id="questionTemplate"/, "Question template is missing.");
  assert.match(html, /src="\.\/app\.js"/, "Frontend app script is missing.");
  assert.match(appJs, /DATA_URLS = \["\.\/data\/questions\.enriched\.json"/, "App is not loading the enriched question bank first.");
  assert.ok(Array.isArray(questions), "Question bank should be a JSON array.");
  assert.ok(questions.length >= 500, `Expected a substantial question bank, got ${questions.length}.`);

  const sample = questions.find((question) => Array.isArray(question.options) && question.options.length >= 2);
  assert.ok(sample, "Question bank should include answer options.");
  assert.equal(typeof sample.question, "string", "Question text should be present.");
}

function checkAnswerFlowContract({ html, appJs }) {
  assert.match(html, /<div class="answer-list"><\/div>/, "Answer list mount is missing.");
  assert.match(appJs, /button\.className = "answer-option"/, "Answer buttons are not created.");
  assert.match(appJs, /paintAnswers\(answerList, question, index\)/, "Answer selection does not paint answers.");
  assert.match(appJs, /showFeedback\(feedback, question, index\)/, "Answer selection does not show feedback.");
  assert.match(appJs, /recordAnswer\(question, index\)/, "Answer selection does not record progress.");
  assert.match(appJs, /eventName: "question_answered"/, "Answer analytics event is missing.");
}

function checkPremiumPaywallContract({ html, appJs }) {
  assert.match(html, /id="paywallTemplate"/, "Paywall template is missing.");
  assert.match(html, /id="modeHighYield"/, "High-yield premium mode button is missing.");
  assert.match(html, /id="modeHardest"/, "Hardest premium mode button is missing.");
  assert.match(html, /id="modeSigns"/, "Road-sign premium mode button is missing.");
  assert.match(html, /id="modeExam"/, "Mock-test premium mode button is missing.");
  assert.match(html, /Unlock for EUR 0\.99/, "Paywall price copy is missing.");
  assert.match(appJs, /function requiresAccess\(mode\)/, "Premium access guard is missing.");
  assert.match(appJs, /\["highYield", "hardest", "signs", "exam", "review"\]\.includes\(mode\)/, "Premium modes are not guarded.");
  assert.match(appJs, /trackEvent\("paywall_viewed"/, "Paywall analytics event is missing.");
}

async function checkLegalPagesLoad({ baseUrl }) {
  const pages = [
    ["/privacy.html", "Privacy Policy"],
    ["/terms.html", "Terms of Use"],
    ["/refunds.html", "Refund Policy"],
    ["/contact.html", "Contact"],
  ];

  for (const [urlPath, title] of pages) {
    const page = await fetchText(baseUrl, urlPath);
    assert.match(page, new RegExp(`<h1>${escapeRegExp(title)}</h1>`), `${urlPath} does not include the expected heading.`);
    assert.ok(page.includes(nonAffiliation), `${urlPath} is missing the non-affiliation disclaimer.`);
    assert.doesNotMatch(page, /<meta\s+name="robots"\s+content="noindex/i, `${urlPath} should be indexable before launch.`);
  }
}

function checkRestoreAccessContract({ html, appJs }) {
  assert.match(html, /id="restoreAccessLink"/, "Restore access link is missing.");
  assert.match(html, /id="restoreForm"/, "Restore access form is missing.");
  assert.match(html, /id="restoreEmail"\s+type="email"/, "Restore email input is missing.");
  assert.match(appJs, /function focusRestoreAccess\(event, source = "unknown"\)/, "Restore access focus handler is missing.");
  assert.match(appJs, /function requestLoginLink\(event\)/, "Magic-link request handler is missing.");
  assert.match(appJs, /\/api\/request-login-link/, "Restore access form is not wired to the API.");
}

function checkMockTestContract({ html, appJs }) {
  assert.match(html, /id="startExamBtn"/, "Start mock test button is missing.");
  assert.match(html, /id="examBar"/, "Mock test status bar is missing.");
  assert.match(appJs, /const EXAM_SIZE = 40;/, "Mock test should use 40 questions.");
  assert.match(appJs, /const PASS_MARK = 35;/, "Mock test should use the 35 pass mark.");
  assert.match(appJs, /function startExam\(\)/, "Mock test start function is missing.");
  assert.match(appJs, /trackEvent\("mock_started"/, "Mock test start analytics event is missing.");
  assert.match(appJs, /renderExamQuestion\(\)/, "Mock test does not render exam questions.");
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
  return resolved === publicDir || resolved.startsWith(`${publicDir}${path.sep}`) ? resolved : null;
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
