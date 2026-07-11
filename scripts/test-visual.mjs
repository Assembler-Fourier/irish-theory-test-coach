import assert from "node:assert/strict";
import path from "node:path";
import { loadPlaywright, reportsDir, resetDirectory, startStaticServer, writeJson } from "./browser-test-helpers.mjs";

const outputDir = path.join(reportsDir, "ui", "pass4");
const playwright = loadPlaywright();
const server = await startStaticServer({ mockApi: true, premiumAccess: true });

const mobile = { width: 390, height: 844 };
const tablet = { width: 768, height: 1024 };
const desktop = { width: 1280, height: 900 };

const states = [
  { name: "mobile-first-load", viewport: mobile, path: "/app", ready: ".question-view" },
  { name: "tablet-first-load", viewport: tablet, path: "/app", ready: ".question-view" },
  { name: "desktop-first-load", viewport: desktop, path: "/app", ready: ".question-view" },
  { name: "mobile-question", viewport: mobile, path: "/app", ready: ".answer-option" },
  { name: "mobile-selected-answer", viewport: mobile, path: "/app", ready: ".answer-option.selected", setup: async (page) => {
    await page.locator(".answer-option").first().evaluate((button) => {
      button.classList.add("selected");
      button.querySelector(".answer-state-label").textContent = "Selected";
    });
  } },
  { name: "mobile-correct-answer", viewport: mobile, path: "/app", ready: ".feedback.is-correct", setup: async (page) => {
    await page.locator(".answer-option").first().click();
  } },
  { name: "mobile-incorrect-answer", viewport: mobile, path: "/app", ready: ".feedback.is-wrong", setup: async (page) => {
    await page.locator(".answer-option").nth(1).click();
  } },
  { name: "mobile-paywall", viewport: mobile, path: "/app", ready: ".paywall-view", setup: async (page) => {
    await page.selectOption("#mobileModeSelect", "highYield");
  } },
  { name: "mobile-restore-modal", viewport: mobile, path: "/app", ready: "#restoreEmail", setup: async (page) => {
    await page.locator("#restoreAccessLink").evaluate((node) => node.click());
  } },
  { name: "mobile-mock", viewport: mobile, path: "/app", ready: ".is-exam-question", setup: async (page) => {
    await enableLocalAccess(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#mobileModeSelect", { timeout: 12000 });
    await page.selectOption("#mobileModeSelect", "exam");
  } },
  { name: "mobile-account", viewport: mobile, path: "/account", ready: "main" },
  { name: "mobile-pricing", viewport: mobile, path: "/pricing", ready: "main" },
  { name: "mobile-admin-locked", viewport: mobile, path: "/admin.html", ready: "#adminProtectedState:not(.hidden)" },
  { name: "tablet-question", viewport: tablet, path: "/app", ready: ".question-view" },
  { name: "desktop-pricing", viewport: desktop, path: "/pricing", ready: "main" },
];

let browser;
const manifest = {
  capturedAt: new Date().toISOString(),
  baseUrl: server.baseUrl,
  screenshots: [],
};

try {
  await resetDirectory(outputDir);
  browser = await playwright.chromium.launch({ headless: true });
  for (const state of states) {
    const fileName = `${state.name}.png`;
    const filePath = path.join(outputDir, fileName);
    await capture(browser, state, filePath);
    manifest.screenshots.push({
      name: state.name,
      path: path.relative(path.dirname(reportsDir), filePath).replace(/\\/g, "/"),
      viewport: state.viewport,
    });
    console.log(`Captured ${manifest.screenshots.at(-1).path}`);
  }
  await writeJson(path.join(outputDir, "manifest.json"), manifest);
} finally {
  if (browser) await browser.close();
  await server.close();
}

assert.equal(manifest.screenshots.length, states.length, "Every requested visual state should be captured.");
console.log(`Visual baseline passed (${states.length} deterministic screenshots).`);

async function capture(browserInstance, state, filePath) {
  const context = await browserInstance.newContext({ viewport: state.viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  try {
    await page.goto(`${server.baseUrl}${state.path}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".shell", { timeout: 12000 });
    if (state.setup) await state.setup(page);
    await page.waitForSelector(state.ready, { timeout: 12000 });
    await page.locator(state.ready).first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
    await page.screenshot({ path: filePath, fullPage: false });
  } finally {
    await context.close();
  }
}

async function enableLocalAccess(page) {
  await page.evaluate(() => {
    window.localStorage.setItem("irish-theory-practice-access-v1", JSON.stringify({
      active: true,
      email: "learner@example.com",
      sessionId: "visual-test",
    }));
  });
}
