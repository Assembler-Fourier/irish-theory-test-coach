import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), "..");
const vercelPath = path.join(root, "vercel.json");
const config = JSON.parse(fs.readFileSync(vercelPath, "utf8"));

const headers = config.headers || [];
const globalHeaders = headersForSource("/(.*)");
const apiHeaders = headersForSource("/api/(.*)");
const adminHeaders = headersForSource("/admin.html");
const accountHeaders = headersForSource("/account.html");

assertHeader(globalHeaders, "Content-Security-Policy", (value) => {
  assert.match(value, /default-src 'self'/);
  assert.match(value, /frame-ancestors 'none'/);
  assert.match(value, /base-uri 'self'/);
});
assertHeader(globalHeaders, "Strict-Transport-Security", (value) => {
  assert.match(value, /max-age=\d+/);
  assert.match(value, /includeSubDomains/);
});
assertHeader(globalHeaders, "X-Content-Type-Options", (value) => assert.equal(value, "nosniff"));
assertHeader(globalHeaders, "Referrer-Policy", (value) => assert.equal(value, "strict-origin-when-cross-origin"));
assertHeader(globalHeaders, "Permissions-Policy", (value) => {
  assert.match(value, /camera=\(\)/);
  assert.match(value, /microphone=\(\)/);
  assert.match(value, /geolocation=\(\)/);
});
assertHeader(apiHeaders, "Cache-Control", assertNoStore);
assertHeader(adminHeaders, "Cache-Control", assertNoStore);
assertHeader(accountHeaders, "Cache-Control", assertNoStore);

console.log("Security header checks passed.");

function headersForSource(source) {
  const entry = headers.find((item) => item.source === source);
  assert.ok(entry, `Missing vercel header source: ${source}`);
  return new Map((entry.headers || []).map((item) => [item.key.toLowerCase(), item.value]));
}

function assertHeader(headerMap, name, assertion) {
  const value = headerMap.get(name.toLowerCase());
  assert.ok(value, `Missing ${name}`);
  assertion(value);
}

function assertNoStore(value) {
  assert.match(value, /no-store/);
}
