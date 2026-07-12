import assert from "node:assert/strict";
import {
  REQUIRED_PAYMENT_TESTS,
  validatePaymentTestEvidence,
} from "../lib/payment-test-evidence.js";

const now = new Date("2026-07-12T12:00:00.000Z");
const context = {
  now,
  commit: "a".repeat(40),
  branch: "codex/commercial-v1",
  deploymentId: "dpl_TestEvidence123",
  previewOrigin: "https://preview.example.test",
  launchOfferEnabled: true,
};

assert.equal(validatePaymentTestEvidence(null, context).ok, false, "missing evidence cannot pass");

const fabricated = validEvidence();
fabricated.tests.fullStudyPassCheckout = { status: "PASS" };
assert.equal(validatePaymentTestEvidence(fabricated, context).ok, false, "bare PASS strings cannot pass");

const wrongCommit = validEvidence();
wrongCommit.commit = "b".repeat(40);
assert.equal(validatePaymentTestEvidence(wrongCommit, context).ok, false, "wrong commit cannot pass");

const wrongDeployment = validEvidence();
wrongDeployment.vercelDeploymentId = "dpl_DifferentDeployment";
assert.equal(validatePaymentTestEvidence(wrongDeployment, context).ok, false, "wrong deployment cannot pass");

const liveMode = validEvidence();
liveMode.stripeMode = "live";
assert.equal(validatePaymentTestEvidence(liveMode, context).ok, false, "live mode cannot pass");

const partial = validEvidence();
delete partial.tests.fullRefund;
assert.equal(validatePaymentTestEvidence(partial, context).ok, false, "partial evidence cannot pass");

const leakedIdentifier = validEvidence();
leakedIdentifier.tests.fullRefund.objectSuffixes = ["re_test_full_identifier_123456"];
assert.equal(validatePaymentTestEvidence(leakedIdentifier, context).ok, false, "full Stripe IDs cannot pass");

const complete = validatePaymentTestEvidence(validEvidence(), context);
assert.equal(complete.ok, true, complete.errors.join("\n"));
assert.deepEqual(complete.errors, []);

console.log("Payment evidence validation tests passed.");

function validEvidence() {
  const observedAt = "2026-07-12T11:30:00.000Z";
  const keys = [...REQUIRED_PAYMENT_TESTS, "launchOfferCheckout"];
  return {
    schemaVersion: 1,
    generatedAt: observedAt,
    commit: context.commit,
    branch: context.branch,
    vercelDeploymentId: context.deploymentId,
    previewOrigin: context.previewOrigin,
    environment: "preview",
    stripeMode: "test",
    tests: Object.fromEntries(keys.map((key) => [key, {
      status: "PASS",
      observedAt,
      assertions: [{
        name: `${key} observed state`,
        expected: true,
        actual: true,
        source: key === "reconciliation" ? "neon_query" : "application_api",
      }],
      objectSuffixes: [],
      ...(key === "reconciliation" ? { unresolvedFindings: 0 } : {}),
    }])),
  };
}
