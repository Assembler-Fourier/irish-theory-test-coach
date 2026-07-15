import assert from "node:assert/strict";
import { checkRateLimit } from "../lib/rate-limit.js";
import {
  classifyLoginToken,
  isValidEmail,
  loginRequestSafeMessage,
  validateRequestOrigin,
} from "../lib/auth.js";
import {
  classifyAccess,
  collapseOperationsById,
  maskEmail,
  mergeProgressSnapshots,
  remainingAccessDays,
} from "../lib/account-data.js";
import { renderTransactionalEmail } from "../lib/email-templates.js";

testMalformedEmail();
testAntiEnumerationMessage();
testRateLimiting();
testTokenStates();
testOriginValidation();
testEntitlementExpiry();
testSyncConflictRules();
testOfflineQueueReplay();
testEmailTemplates();

console.log("Account/auth policy tests passed.");

function testMalformedEmail() {
  assert.equal(isValidEmail("not-an-email"), false);
  assert.equal(isValidEmail("learner@example.com"), true);
}

function testAntiEnumerationMessage() {
  const unknown = loginRequestSafeMessage();
  const known = loginRequestSafeMessage();
  assert.equal(unknown, known, "Known and unknown emails should receive the same public restore response.");
  assert.match(known, /If that email has access/);
}

function testRateLimiting() {
  const key = `account-auth-test:${Date.now()}:${Math.random()}`;
  assert.equal(checkRateLimit({ key, limit: 2, windowMs: 60_000 }).allowed, true);
  assert.equal(checkRateLimit({ key, limit: 2, windowMs: 60_000 }).allowed, true);
  assert.equal(checkRateLimit({ key, limit: 2, windowMs: 60_000 }).allowed, false);
}

function testTokenStates() {
  const future = new Date(Date.now() + 60_000).toISOString();
  const past = new Date(Date.now() - 60_000).toISOString();
  assert.equal(classifyLoginToken(null), "not_found");
  assert.equal(classifyLoginToken({ expires_at: future, consumed_at: new Date().toISOString() }), "used_link");
  assert.equal(classifyLoginToken({ expires_at: past, consumed_at: null }), "expired_link");
  assert.equal(classifyLoginToken({ expires_at: future, consumed_at: null }), "valid");
}

function testOriginValidation() {
  const okReq = { headers: { origin: "https://example.com" } };
  const badReq = { headers: { origin: "https://attacker.example" } };
  assert.equal(validateRequestOrigin(okReq, "https://example.com", { isProduction: true }).ok, true);
  assert.equal(validateRequestOrigin(badReq, "https://example.com", { isProduction: true }).ok, false);
  assert.equal(validateRequestOrigin({ headers: {} }, "https://example.com", { isProduction: true }).ok, true);
}

function testEntitlementExpiry() {
  const now = new Date("2026-07-11T12:00:00.000Z");
  const active = classifyAccess({ active: true, expires_at: "2026-07-20T12:00:00.000Z" }, now);
  const expired = classifyAccess({ active: true, expires_at: "2026-07-01T12:00:00.000Z" }, now);
  const revoked = classifyAccess({ active: true, expires_at: "2026-07-20T12:00:00.000Z", revoked_at: now.toISOString() }, now);
  assert.equal(active.status, "active");
  assert.equal(remainingAccessDays("2026-07-20T12:00:00.000Z", now), 9);
  assert.equal(expired.status, "expired");
  assert.equal(revoked.status, "revoked");
}

function testSyncConflictRules() {
  const merged = mergeProgressSnapshots({
    server: {
      answers: {
        10: { attempts: 4, correct: 3, wrong: 1 },
        11: { attempts: 2, correct: 1, wrong: 1 },
      },
      missed: [11],
      flagged: [12],
      categories: [{ category: "Rules", answered: 6 }],
    },
    local: {
      answers: {
        10: { attempts: 1, correct: 1, wrong: 0 },
        13: { attempts: 3, correct: 2, wrong: 1 },
      },
      flagged: [14],
    },
    pendingAttempts: [{ questionId: 11, correct: true }],
    pendingFlags: [{ questionId: 12, active: false }],
  });

  assert.equal(merged.answers[10].attempts, 4, "Richer server answer history should not be overwritten by stale local data.");
  assert.equal(merged.answers[13].attempts, 3, "Local-only answer history should be retained for sync.");
  assert.deepEqual(merged.missed, [], "Pending correct answer should clear server missed state.");
  assert.deepEqual(merged.flagged, [14], "Pending flag removal should replay over server flags.");
}

function testOfflineQueueReplay() {
  const collapsed = collapseOperationsById([
    { operationId: "op-1", questionId: 1, active: true, updatedAt: "2026-07-11T10:00:00.000Z" },
    { operationId: "op-1", questionId: 1, active: false, updatedAt: "2026-07-11T10:01:00.000Z" },
    { operationId: "op-2", questionId: 2, active: true, updatedAt: "2026-07-11T10:02:00.000Z" },
  ]);
  assert.equal(collapsed.length, 2);
  assert.equal(collapsed.find((item) => item.operationId === "op-1").active, false);
}

function testEmailTemplates() {
  const login = renderTransactionalEmail("login_link", { link: "https://example.com/account?login_token=test" });
  const reminder = renderTransactionalEmail("access_expiry_reminder");
  assert.match(login.subject, /access link/i);
  assert.match(login.text, /one-time/i);
  assert.match(login.text, /Not affiliated with RSA or Prometric/);
  assert.match(reminder.text, /must not be sent until notification preference and legal basis are defined/);
  assert.equal(maskEmail("learner@example.com").includes("learner"), false);
}
