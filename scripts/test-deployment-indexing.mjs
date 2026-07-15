import assert from "node:assert/strict";
import { applyDeploymentIndexingToHtml, isPreviewDeployment } from "../lib/deployment-indexing.js";

const page = "<!doctype html><html><head><title>Test</title></head><body></body></html>";
const preview = applyDeploymentIndexingToHtml(page, { VERCEL_ENV: "preview" });

assert.equal(isPreviewDeployment({ VERCEL_ENV: "preview" }), true);
assert.equal(isPreviewDeployment({ VERCEL_ENV: "production" }), false);
assert.match(preview, /name="robots" content="noindex,nofollow" data-deployment-indexing="preview"/);
assert.equal((preview.match(/data-deployment-indexing="preview"/g) || []).length, 1);
assert.equal(applyDeploymentIndexingToHtml(preview, { VERCEL_ENV: "preview" }), preview);
assert.doesNotMatch(applyDeploymentIndexingToHtml(preview, { VERCEL_ENV: "production" }), /data-deployment-indexing="preview"/);
assert.match(
  applyDeploymentIndexingToHtml('<html><head><meta name="robots" content="noindex,nofollow"></head></html>', { VERCEL_ENV: "preview" }),
  /name="robots" content="noindex,nofollow"/,
);

console.log("Deployment indexing tests passed.");
