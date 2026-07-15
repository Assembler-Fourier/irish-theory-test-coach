import assert from "node:assert/strict";
import { isHorizontalScrollSafe, loadPlaywright, pageMetrics, startStaticServer } from "./browser-test-helpers.mjs";

const mobileWidths = [320, 360, 375, 390, 412, 430];
const tabletViewport = { width: 768, height: 1024 };
const desktopViewport = { width: 1280, height: 900 };

const playwright = loadPlaywright();
const server = await startStaticServer({ mockApi: true, premiumAccess: true });
let browser;

try {
  browser = await playwright.chromium.launch({ headless: true });
  await testNoHorizontalScroll(browser);
  await testPrivacyChoices(browser);
  await testKeyboardAnswerFlow(browser);
  await testCorrectAndWrongStates(browser);
  await testPaywallRestoreMockAndRoutes(browser);
  console.log("E2E mobile/accessibility flow tests passed.");
} finally {
  if (browser) await browser.close();
  await server.close();
}

async function testNoHorizontalScroll(browserInstance) {
  for (const width of mobileWidths) {
    const page = await newPage(browserInstance, { width, height: 820 });
    try {
      await gotoReady(page, "/app", ".question-view");
      let metrics = await pageMetrics(page);
      assert.ok(isHorizontalScrollSafe(metrics), `/app has document-level horizontal scroll at ${width}px: ${JSON.stringify(metrics)}`);

      await gotoReady(page, "/pricing", "main");
      metrics = await pageMetrics(page);
      assert.ok(isHorizontalScrollSafe(metrics), `/pricing has document-level horizontal scroll at ${width}px: ${JSON.stringify(metrics)}`);

      await gotoReady(page, "/account", "main");
      metrics = await pageMetrics(page);
      assert.ok(isHorizontalScrollSafe(metrics), `/account has document-level horizontal scroll at ${width}px: ${JSON.stringify(metrics)}`);

      for (const route of ["/legal.html", "/cookies.html", "/cancellation.html"]) {
        await gotoReady(page, route, ".legal-page");
        metrics = await pageMetrics(page);
        assert.ok(isHorizontalScrollSafe(metrics), `${route} has document-level horizontal scroll at ${width}px: ${JSON.stringify(metrics)}`);
      }
    } finally {
      await page.context().close();
    }
  }
}

async function testPrivacyChoices(browserInstance) {
  const page = await newPage(browserInstance, { width: 390, height: 844 });
  try {
    await gotoReady(page, "/", "#privacyConsentPanel:not([hidden])");
    assert.equal(await page.evaluate(() => localStorage.getItem("irish-theory-practice-anonymous-id-v1")), null, "Analytics ID must not exist before consent.");
    await page.locator("[data-consent-reject]").click();
    assert.equal(await page.locator("#privacyConsentPanel:not([hidden])").count(), 0, "Consent panel should close after rejection.");
    assert.match(await page.evaluate(() => localStorage.getItem("ittc-privacy-preferences-v1") || ""), /"analytics":"denied"/);

    await gotoReady(page, "/cookies.html", "[data-privacy-settings]");
    await page.locator("[data-privacy-settings]").first().click();
    await page.waitForSelector("#privacyConsentPanel:not([hidden])", { timeout: 8000 });
    await page.locator("[data-consent-allow]").click();
    await page.waitForFunction(() => Boolean(localStorage.getItem("irish-theory-practice-anonymous-id-v1")));
    assert.match(await page.evaluate(() => localStorage.getItem("ittc-privacy-preferences-v1") || ""), /"analytics":"granted"/);
  } finally {
    await page.context().close();
  }
}

async function testKeyboardAnswerFlow(browserInstance) {
  const page = await newPage(browserInstance, { width: 390, height: 844 });
  try {
    await gotoReady(page, "/app", ".answer-option");
    await page.locator(".answer-option").first().focus();
    await page.keyboard.press("Enter");
    await page.waitForSelector(".feedback:not(.hidden)", { timeout: 8000 });
    await expectVisible(page, ".answer-option.selected");
    await expectVisible(page, ".feedback-next-actions .primary");
    const liveText = await page.locator("#answerLiveRegion").textContent();
    assert.match(liveText || "", /Correct|Not quite/, "Answer result should be announced through the live region.");
  } finally {
    await page.context().close();
  }
}

async function testCorrectAndWrongStates(browserInstance) {
  const correctPage = await newPage(browserInstance, { width: 390, height: 844 });
  try {
    await gotoReady(correctPage, "/app", ".answer-option");
    await correctPage.locator(".answer-option").first().click();
    await correctPage.waitForSelector(".answer-option.correct", { timeout: 8000 });
    await expectVisible(correctPage, ".answer-state-label:text('Selected, correct')");
    await expectVisible(correctPage, ".feedback.is-correct");
  } finally {
    await correctPage.context().close();
  }

  const wrongPage = await newPage(browserInstance, { width: 390, height: 844 });
  try {
    await gotoReady(wrongPage, "/app", ".answer-option");
    await wrongPage.locator(".answer-option").nth(1).click();
    await wrongPage.waitForSelector(".answer-option.wrong", { timeout: 8000 });
    await expectVisible(wrongPage, ".answer-state-label:text('Selected, not correct')");
    await expectVisible(wrongPage, ".feedback.is-wrong");
  } finally {
    await wrongPage.context().close();
  }
}

async function testPaywallRestoreMockAndRoutes(browserInstance) {
  const page = await newPage(browserInstance, { width: 390, height: 844 });
  try {
    await gotoReady(page, "/app", ".question-view");
    await page.selectOption("#mobileModeSelect", "highYield");
    await page.waitForSelector(".paywall-view", { timeout: 8000 });
    assert.equal(await page.locator(".mobile-sticky-cta:not(.hidden)").count(), 0, "Paywall should not show the mobile purchase strip.");

    await page.locator(".paywall-restore-link").click();
    await page.waitForSelector("#restoreEmail", { timeout: 8000 });
    await expectVisible(page, "#restoreForm[role='dialog']");

    await page.goto(`${server.baseUrl}/app`, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      window.localStorage.setItem("irish-theory-practice-access-v1", JSON.stringify({ active: true, email: "learner@example.com" }));
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#mobileModeSelect", { timeout: 8000 });
    await page.selectOption("#mobileModeSelect", "exam");
    await page.waitForSelector(".is-exam-question", { timeout: 8000 });
    await expectVisible(page, "#examBar:not(.hidden)");
    assert.equal(await page.locator(".mobile-sticky-cta:not(.hidden)").count(), 0, "Mock mode should hide purchase prompts.");

    await gotoReady(page, "/account", "main");
    await gotoReady(page, "/pricing", "main");
    await gotoReady(page, "/admin.html", "#adminProtectedState:not(.hidden)");
  } finally {
    await page.context().close();
  }

  for (const viewport of [tabletViewport, desktopViewport]) {
    const routedPage = await newPage(browserInstance, viewport);
    try {
      await gotoReady(routedPage, "/app", ".question-view");
      const metrics = await pageMetrics(routedPage);
      assert.ok(isHorizontalScrollSafe(metrics), `/app has document-level horizontal scroll at ${viewport.width}px.`);
    } finally {
      await routedPage.context().close();
    }
  }
}

async function newPage(browserInstance, viewport) {
  const context = await browserInstance.newContext({ viewport, deviceScaleFactor: 1 });
  return context.newPage();
}

async function gotoReady(page, path, readySelector) {
  await page.goto(`${server.baseUrl}${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(readySelector, { timeout: 12000 });
}

async function expectVisible(page, selector) {
  assert.ok(await page.locator(selector).first().isVisible(), `${selector} should be visible.`);
}
