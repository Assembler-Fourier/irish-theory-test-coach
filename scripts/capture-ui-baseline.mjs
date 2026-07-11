import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(repoRoot, "public");
const outputDir = path.join(repoRoot, "reports", "ui", "latest");
const questionDataPath = path.join(publicDir, "data", "preview-questions.json");

const desktopViewport = { width: 1440, height: 1000 };
const desktopMediumViewport = { width: 1280, height: 900 };
const desktopSmallViewport = { width: 1024, height: 820 };
const mobileViewport = { width: 390, height: 844 };
const mobileSmallViewport = { width: 360, height: 780 };
const mobileLargeViewport = { width: 430, height: 932 };

const screenshotStates = [
  {
    name: "desktop-homepage",
    viewport: desktopViewport,
    path: "/",
    ready: ".hero-panel",
    noScroll: true,
  },
  {
    name: "desktop-homepage-1280",
    viewport: desktopMediumViewport,
    path: "/",
    ready: ".hero-panel",
    noScroll: true,
  },
  {
    name: "desktop-quiz-1024",
    viewport: desktopSmallViewport,
    path: "/",
    ready: ".question-view",
  },
  {
    name: "desktop-app-preview",
    viewport: desktopViewport,
    path: "/",
    ready: ".question-view",
  },
  {
    name: "desktop-paywall",
    viewport: desktopViewport,
    path: "/",
    ready: ".paywall-view",
    alignTop: true,
    setup: async (page) => {
      await clickMode(page, "highYield");
    },
  },
  {
    name: "answer-feedback",
    viewport: desktopViewport,
    path: "/",
    ready: ".feedback:not(.hidden)",
    setup: async (page) => {
      await page.click(".answer-option");
    },
  },
  {
    name: "restore-access",
    viewport: desktopViewport,
    path: "/",
    ready: "#restoreEmail",
    setup: async (page) => {
      await page.click("#restoreAccessLink");
    },
  },
  {
    name: "seo-landing-page",
    viewport: desktopViewport,
    path: "/theory-test-study-plan.html",
    ready: "main",
    noScroll: true,
  },
  {
    name: "pricing-page",
    viewport: desktopViewport,
    path: "/pricing.html",
    ready: "main",
    noScroll: true,
  },
  {
    name: "learn-hub",
    viewport: desktopViewport,
    path: "/learn.html",
    ready: "main",
    noScroll: true,
  },
  {
    name: "contact-page",
    viewport: mobileViewport,
    path: "/contact.html",
    ready: "main",
    noScroll: true,
  },
  {
    name: "admin-locked-state",
    viewport: desktopViewport,
    path: "/admin.html",
    ready: "#adminStatus",
    noScroll: true,
    setup: async (page) => {
      await page.waitForFunction(
        () => !document.querySelector("#adminStatus")?.textContent?.includes("Checking admin access"),
        null,
        { timeout: 8000 }
      ).catch(() => {});
    },
  },
  {
    name: "mobile-first-load",
    viewport: mobileViewport,
    path: "/",
    ready: ".hero-panel",
    noScroll: true,
  },
  {
    name: "mobile-first-load-360",
    viewport: mobileSmallViewport,
    path: "/",
    ready: ".hero-panel",
    noScroll: true,
  },
  {
    name: "mobile-quiz-360",
    viewport: mobileSmallViewport,
    path: "/",
    ready: ".question-view",
  },
  {
    name: "mobile-app-preview",
    viewport: mobileViewport,
    path: "/",
    ready: ".question-view",
  },
  {
    name: "mobile-first-load-430",
    viewport: mobileLargeViewport,
    path: "/",
    ready: ".hero-panel",
    noScroll: true,
  },
  {
    name: "mobile-quiz-430",
    viewport: mobileLargeViewport,
    path: "/",
    ready: ".question-view",
  },
  {
    name: "mobile-paywall",
    viewport: mobileViewport,
    path: "/",
    ready: ".paywall-view",
    alignTop: true,
    setup: async (page) => {
      await clickMode(page, "highYield");
    },
  },
];

if (!existsSync(questionDataPath)) {
  console.error("Missing public/data/preview-questions.json. Run `npm run build` before capturing screenshots.");
  process.exit(1);
}

const playwright = loadPlaywright();
const server = await startStaticServer();
const manifest = {
  capturedAt: new Date().toISOString(),
  baseUrl: server.baseUrl,
  outputDir: path.relative(repoRoot, outputDir).replace(/\\/g, "/"),
  screenshots: [],
};

let browser;

try {
  resetOutputDir();
  browser = await playwright.chromium.launch({ headless: true });

  for (const state of screenshotStates) {
    const fileName = `${state.name}.png`;
    const filePath = path.join(outputDir, fileName);
    await captureState(browser, server.baseUrl, state, filePath);
    manifest.screenshots.push({
      name: state.name,
      path: path.relative(repoRoot, filePath).replace(/\\/g, "/"),
      viewport: state.viewport,
    });
    console.log(`Captured ${manifest.screenshots.at(-1).path}`);
  }

  await writeFile(path.join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  console.log(`UI baseline screenshots captured in ${manifest.outputDir}`);
} finally {
  if (browser) await browser.close();
  await server.close();
}

async function captureState(browserInstance, baseUrl, state, filePath) {
  const context = await browserInstance.newContext({
    viewport: state.viewport,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  try {
    page.on("pageerror", (error) => {
      console.warn(`[${state.name}] page error: ${error.message}`);
    });

    await page.goto(`${baseUrl}${state.path}`, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
      window.scrollTo(0, 0);
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".shell", { timeout: 12000 });
    if (state.setup) await state.setup(page);
    await page.waitForSelector(state.ready, { timeout: 12000 });
    if (state.noScroll) {
      await page.evaluate(() => window.scrollTo(0, 0));
    } else if (state.alignTop) {
      await page.locator(state.ready).first().evaluate((element) => {
        const top = element.getBoundingClientRect().top + window.scrollY - 8;
        window.scrollTo(0, Math.max(0, top));
      });
    } else {
      await page.locator(state.ready).first().scrollIntoViewIfNeeded();
    }
    await page.waitForTimeout(250);
    await page.screenshot({ path: filePath, fullPage: false });
  } finally {
    await context.close();
  }
}

async function clickMode(page, mode) {
  await page.locator(`[data-mode-button][data-mode="${mode}"]:visible`).first().click();
}

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  const local = tryRequirePlaywright(require, "project dependencies");
  if (local) return local;

  const configuredRoot = process.env.PLAYWRIGHT_NODE_MODULES;
  if (configuredRoot) {
    const configured = tryRequirePlaywrightFromRoot(require, configuredRoot, "PLAYWRIGHT_NODE_MODULES");
    if (configured) return configured;
  }

  const bundledRoot = path.join(
    os.homedir(),
    ".cache",
    "codex-runtimes",
    "codex-primary-runtime",
    "dependencies",
    "node",
    "node_modules"
  );
  const bundled = tryRequirePlaywrightFromRoot(require, bundledRoot, "Codex bundled runtime");
  if (bundled) return bundled;

  console.error(
    [
      "Playwright is not available for screenshot capture.",
      "Install it with `npm install --save-dev playwright` and `npx playwright install chromium`,",
      "or set PLAYWRIGHT_NODE_MODULES to a node_modules directory that contains Playwright.",
    ].join("\n")
  );
  process.exit(2);
}

function tryRequirePlaywright(require, label) {
  try {
    return require("playwright");
  } catch (error) {
    if (process.env.UI_BASELINE_DEBUG) {
      console.warn(`Could not load Playwright from ${label}: ${error.message}`);
    }
    return null;
  }
}

function tryRequirePlaywrightFromRoot(require, moduleRoot, label) {
  if (!moduleRoot || !existsSync(moduleRoot)) return null;

  try {
    const resolved = require.resolve("playwright", { paths: [moduleRoot] });
    return require(resolved);
  } catch (error) {
    if (process.env.UI_BASELINE_DEBUG) {
      console.warn(`Direct Playwright load failed from ${label}: ${error.message}`);
    }
  }

  const pnpmRoot = path.join(moduleRoot, ".pnpm");
  if (!existsSync(pnpmRoot)) return null;

  for (const entry of readdirSync(pnpmRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith("playwright@")) continue;
    const candidate = path.join(pnpmRoot, entry.name, "node_modules", "playwright", "index.js");
    if (!existsSync(candidate)) continue;
    try {
      return require(candidate);
    } catch (error) {
      if (process.env.UI_BASELINE_DEBUG) {
        console.warn(`PNPM Playwright load failed from ${candidate}: ${error.message}`);
      }
    }
  }

  return null;
}

function resetOutputDir() {
  rmSync(outputDir, { recursive: true, force: true });
  mkdirSync(outputDir, { recursive: true });
}

async function startStaticServer() {
  const server = createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
      if (requestUrl.pathname.startsWith("/api/admin/")) {
        res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "admin_access_required" }));
        return;
      }

      const filePath = await resolvePublicPath(req.url || "/");
      if (!filePath) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }

      const body = await readFile(filePath);
      res.writeHead(200, { "Content-Type": contentTypeFor(filePath) });
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

async function resolvePublicPath(requestUrl) {
  const url = new URL(requestUrl, "http://127.0.0.1");
  const pathname = decodeURIComponent(url.pathname);
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const resolved = path.resolve(publicDir, relativePath);
  if (!(resolved === publicDir || resolved.startsWith(`${publicDir}${path.sep}`))) return null;

  if (existsSync(resolved) && (await stat(resolved)).isDirectory()) {
    return path.join(resolved, "index.html");
  }

  if (existsSync(resolved)) return resolved;

  const htmlPath = `${resolved}.html`;
  if (existsSync(htmlPath)) return htmlPath;

  return null;
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

assert.ok(screenshotStates.length >= 8, "UI baseline should cover at least the agreed eight screenshot states.");
