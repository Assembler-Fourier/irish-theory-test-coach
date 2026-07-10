import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), "..");
const publicDir = path.join(root, "public");
const errors = [];
const htmlBudgetBytes = 140_000;

for (const file of fs.readdirSync(publicDir).filter((name) => name.endsWith(".html"))) {
  const filePath = path.join(publicDir, file);
  const html = fs.readFileSync(filePath, "utf8");
  const size = fs.statSync(filePath).size;
  if (size > htmlBudgetBytes) errors.push(`${file} exceeds HTML budget (${size} bytes).`);
  if (file !== "index.html" && file !== "offline.html" && /src="\.\/app\.js"/.test(html)) {
    errors.push(`${file} loads app.js unnecessarily.`);
  }
  if (file !== "index.html" && /questions\.enriched\.json|questions\.json/.test(html)) {
    errors.push(`${file} references full question data.`);
  }
  for (const img of html.matchAll(/<img\b([^>]*)>/gi)) {
    const attrs = img[1];
    if (!/\bwidth="/i.test(attrs) || !/\bheight="/i.test(attrs)) {
      errors.push(`${file} has an img without width/height.`);
    }
    if (!/\bloading="/i.test(attrs)) {
      errors.push(`${file} has an img without lazy/eager loading.`);
    }
  }
}

if (errors.length) {
  for (const error of errors) console.error(error);
  process.exit(1);
}

console.log("Performance budget check passed.");
