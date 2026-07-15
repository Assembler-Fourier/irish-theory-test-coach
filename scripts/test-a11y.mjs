import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { loadPlaywright, startStaticServer } from "./browser-test-helpers.mjs";

const require = createRequire(import.meta.url);
const axeSource = await readFile(require.resolve("axe-core/axe.min.js"), "utf8");
const playwright = loadPlaywright();
const server = await startStaticServer({ mockApi: true, premiumAccess: true });

const states = [
  { name: "mobile privacy choices", path: "/", viewport: { width: 390, height: 844 }, ready: "#privacyConsentPanel:not([hidden])", allowUnsetConsent: true },
  { name: "legal centre", path: "/legal.html", viewport: { width: 390, height: 844 }, ready: ".legal-page" },
  { name: "cancellation form", path: "/cancellation.html", viewport: { width: 390, height: 844 }, ready: ".model-cancellation-form" },
  { name: "mobile app", path: "/app", viewport: { width: 390, height: 844 }, ready: ".question-view" },
  { name: "mobile paywall", path: "/app", viewport: { width: 390, height: 844 }, ready: ".paywall-view", setup: async (page) => page.selectOption("#mobileModeSelect", "highYield") },
  { name: "mobile restore", path: "/app", viewport: { width: 390, height: 844 }, ready: "#restoreEmail", setup: async (page) => {
    await page.locator("#restoreAccessLink").evaluate((node) => node.click());
  } },
  { name: "pricing", path: "/pricing", viewport: { width: 390, height: 844 }, ready: "main" },
  { name: "account", path: "/account", viewport: { width: 390, height: 844 }, ready: "main" },
  { name: "admin locked", path: "/admin.html", viewport: { width: 390, height: 844 }, ready: "#adminProtectedState:not(.hidden)" },
  { name: "desktop app", path: "/app", viewport: { width: 1280, height: 900 }, ready: ".question-view" },
];

let browser;
const violations = [];

try {
  browser = await playwright.chromium.launch({ headless: true });
  for (const state of states) {
    const context = await browser.newContext({ viewport: state.viewport, deviceScaleFactor: 1 });
    if (!state.allowUnsetConsent) {
      await context.addInitScript(() => {
        window.localStorage.setItem("ittc-privacy-preferences-v1", JSON.stringify({
          analytics: "denied",
          version: "2026-07-15-v1",
          updatedAt: "2026-07-15T00:00:00.000Z",
        }));
      });
    }
    const page = await context.newPage();
    try {
      await page.goto(`${server.baseUrl}${state.path}`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(".shell", { timeout: 12000 });
      if (state.setup) await state.setup(page);
      await page.waitForSelector(state.ready, { timeout: 12000 });
      await page.addScriptTag({ content: axeSource });
      const result = await page.evaluate(async () => window.axe.run(document, {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
        },
      }));
      const critical = result.violations.filter((violation) => violation.impact === "critical");
      critical.forEach((violation) => {
        violations.push({
          state: state.name,
          id: violation.id,
          help: violation.help,
          nodes: violation.nodes.map((node) => node.target.join(" ")).slice(0, 5),
        });
      });
    } finally {
      await context.close();
    }
  }
} finally {
  if (browser) await browser.close();
  await server.close();
}

if (violations.length) {
  console.error(JSON.stringify(violations, null, 2));
}

assert.equal(violations.length, 0, "Critical axe accessibility violations must be zero.");
console.log(`A11Y axe check passed (${states.length} states, 0 critical violations).`);
