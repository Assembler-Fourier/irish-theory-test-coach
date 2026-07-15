import assert from "node:assert/strict";
import fs from "node:fs";

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));

assert.equal(lock.name, pkg.name, "package-lock name must match package.json");
assert.ok(lock.lockfileVersion >= 3, "package-lock should use npm lockfileVersion 3 or newer");
assert.ok(lock.packages?.[""], "package-lock must include root package metadata");

for (const dependency of Object.keys(pkg.dependencies || {})) {
  assert.ok(
    lock.packages?.[`node_modules/${dependency}`] || lock.dependencies?.[dependency],
    `package-lock is missing dependency: ${dependency}`
  );
}

for (const dependency of Object.keys(pkg.devDependencies || {})) {
  assert.ok(
    lock.packages?.[`node_modules/${dependency}`] || lock.dependencies?.[dependency],
    `package-lock is missing dev dependency: ${dependency}`
  );
}

console.log("Lockfile validation passed.");
