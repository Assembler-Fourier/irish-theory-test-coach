import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import health from "../server/api/health.js";
import opsReconcile from "../server/api/ops-reconcile.js";
import { emitOperationalEvent } from "../lib/monitoring.js";
import { summarizeFindings } from "../lib/reconciliation.js";

await testHealthEndpoint();
await testOpsReconcileRequiresConfig();
await testOpsReconcileRejectsUnauthorized();
await testMonitoringRedactsSensitiveValues();
testReconciliationSummary();
testNestedApiRewrites();

console.log("Reliability system tests passed.");

async function testHealthEndpoint() {
  const ok = await callHandler(health, { method: "GET", headers: {} });
  assert.equal(ok.statusCode, 200);
  assert.deepEqual(ok.body, { ok: true, service: "irish-theory-test-coach" });

  const wrongMethod = await callHandler(health, { method: "POST", headers: {} });
  assert.equal(wrongMethod.statusCode, 405);
}

async function testOpsReconcileRequiresConfig() {
  await withEnv({ DATABASE_URL: "", OPS_CRON_SECRET: "" }, async () => {
    const res = await withSuppressedLogs(() => callHandler(opsReconcile, {
      method: "POST",
      headers: {},
    }));
    assert.equal(res.statusCode, 503);
    assert.deepEqual(res.body, { ok: false });
  });
}

async function testOpsReconcileRejectsUnauthorized() {
  await withEnv({ DATABASE_URL: "postgresql://localhost:5432/test", OPS_CRON_SECRET: "secret-value" }, async () => {
    const res = await callHandler(opsReconcile, {
      method: "POST",
      headers: { authorization: "Bearer wrong-value" },
    });
    assert.equal(res.statusCode, 401);
  });
}

async function testMonitoringRedactsSensitiveValues() {
  await withEnv({ MONITORING_ENABLED: "false" }, async () => {
    const captured = [];
    const originalInfo = console.info;
    console.info = (...args) => captured.push(args);
    try {
      const fakeDatabaseUrl = ["postgresql://user", "pass@example/db"].join(":");
      await emitOperationalEvent("test_event", "info", {
        message: `sk_live_should_not_print whsec_should_not_print ${fakeDatabaseUrl}`,
        token: "very-secret-token",
      });
    } finally {
      console.info = originalInfo;
    }
    const text = JSON.stringify(captured);
    assert.doesNotMatch(text, /sk_live_should_not_print/);
    assert.doesNotMatch(text, /whsec_should_not_print/);
    assert.doesNotMatch(text, /postgresql:\/\/user:pass/);
    assert.doesNotMatch(text, /very-secret-token/);
  });
}

function testReconciliationSummary() {
  const summary = summarizeFindings([
    { checkKey: "webhook_failures", severity: "error" },
    { checkKey: "webhook_failures", severity: "error" },
    { checkKey: "stale_login_tokens", severity: "info" },
  ]);
  assert.equal(summary.total, 3);
  assert.equal(summary.byCheck.webhook_failures, 2);
  assert.equal(summary.bySeverity.error, 2);
  assert.equal(summary.bySeverity.info, 1);
}

function testNestedApiRewrites() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const config = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
  const rewrites = new Map((config.rewrites || []).map((item) => [item.source, item.destination]));
  assert.equal(rewrites.get("/api/v1/:path*"), "/api/dispatch?dispatchRoute=v1/:path*");
  assert.equal(rewrites.get("/api/ops/reconcile"), "/api/ops-reconcile");
}

async function callHandler(handler, req) {
  const res = createMockResponse();
  await handler(req, res);
  return res;
}

function createMockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end(payload = "") {
      this.body = payload;
      return this;
    },
  };
}

async function withEnv(values, callback) {
  const previous = new Map(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await callback();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function withSuppressedLogs(callback) {
  const originalInfo = console.info;
  const originalError = console.error;
  console.info = () => {};
  console.error = () => {};
  try {
    return await callback();
  } finally {
    console.info = originalInfo;
    console.error = originalError;
  }
}
