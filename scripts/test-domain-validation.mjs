import assert from "node:assert/strict";
import { inspectCommercialDomain } from "../lib/domain-validation.js";

const origin = "https://irishtheorycoach.ie";
const okFetch = async (url) => response(url.includes("www."), url.includes("www.") ? 308 : 200, origin);

assert.equal((await inspectCommercialDomain("https://example.vercel.app")).valid, false);
assert.equal((await inspectCommercialDomain(origin, {
  resolve4: async () => { throw new Error("NXDOMAIN"); },
  lookup: async () => { throw new Error("ENOTFOUND"); },
  fetch: okFetch,
})).valid, false);
assert.equal((await inspectCommercialDomain(origin, {
  resolve4: async () => { throw new Error("ECONNREFUSED"); },
  lookup: async () => [{ address: "216.198.79.1", family: 4 }],
  fetch: okFetch,
})).valid, true);
assert.equal((await inspectCommercialDomain(origin, {
  resolve4: async () => ["216.198.79.1"],
  fetch: async (url) => response(url.includes("www."), url.includes("www.") ? 302 : 200, origin),
})).valid, false);
assert.equal((await inspectCommercialDomain(origin, {
  resolve4: async () => ["216.198.79.1"],
  fetch: okFetch,
})).valid, true);

console.log("Commercial domain validation tests passed.");

function response(isWww, status, apexOrigin) {
  return {
    status,
    headers: new Headers(isWww ? { location: `${apexOrigin}/` } : {}),
  };
}
