import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), "..");
const ignoredDirs = new Set([".git", ".vercel", "node_modules", "output", "tmp", "__pycache__"]);
const files = [];

walk(root);

for (const file of files) {
  execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
}

console.log(`JavaScript syntax check passed (${files.length} files).`);

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (fullPath.includes(`${path.sep}public${path.sep}data${path.sep}`)) continue;
      walk(fullPath);
      continue;
    }
    if (/\.(?:js|mjs)$/i.test(entry.name)) files.push(fullPath);
  }
}
