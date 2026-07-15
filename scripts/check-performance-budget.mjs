import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PERFORMANCE_BUDGETS } from "../shared/growth-config.js";

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), "..");
const publicDir = path.join(root, "public");
const errors = [];
const budgets = PERFORMANCE_BUDGETS;

for (const file of fs.readdirSync(publicDir).filter((name) => name.endsWith(".html"))) {
  const filePath = path.join(publicDir, file);
  const html = fs.readFileSync(filePath, "utf8");
  const size = fs.statSync(filePath).size;
  if (size > budgets.htmlBytes) errors.push(`${file} exceeds HTML budget (${size} bytes).`);
  if (!["app.html", "index.html", "offline.html"].includes(file) && /src="\.\/app\.js"/.test(html)) {
    errors.push(`${file} loads app.js unnecessarily.`);
  }
  if (!["app.html", "index.html"].includes(file) && /questions\.enriched\.json|questions\.json/.test(html)) {
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
    const src = attr(attrs, "src");
    const loading = attr(attrs, "loading");
    if (src && loading === "eager") {
      const imageFile = path.join(publicDir, src.replace(/^\.\//, ""));
      if (fs.existsSync(imageFile) && fs.statSync(imageFile).size > budgets.initialImageBytes) {
        errors.push(`${file} eager image ${src} exceeds initial image budget.`);
      }
    }
  }
}

const cssFiles = fs.readdirSync(publicDir).filter((name) => name.endsWith(".css"));
const cssBytes = cssFiles.reduce((total, file) => total + fs.statSync(path.join(publicDir, file)).size, 0);
if (cssBytes > budgets.cssBytes) {
  errors.push(`Public CSS exceeds budget (${cssBytes} bytes across ${cssFiles.length} files).`);
}

const appJsBudgetFiles = ["app.js", "analytics-client.js", "api-client.js", "session-store.js", "question-renderer.js", "access-controller.js", "progress-controller.js"];
const appJsBytes = appJsBudgetFiles
  .map((file) => path.join(publicDir, file))
  .filter((file) => fs.existsSync(file))
  .reduce((total, file) => total + fs.statSync(file).size, 0);
if (appJsBytes > budgets.javascriptBytes) errors.push(`Learner app JavaScript exceeds budget (${appJsBytes} bytes).`);

const marketingDir = path.join(publicDir, "marketing");
if (fs.existsSync(marketingDir)) {
  for (const file of fs.readdirSync(marketingDir).filter((name) => name.endsWith(".svg"))) {
    const size = fs.statSync(path.join(marketingDir, file)).size;
    if (size > budgets.initialImageBytes) errors.push(`${file} exceeds generated SVG budget (${size} bytes).`);
  }
}

if (errors.length) {
  for (const error of errors) console.error(error);
  process.exit(1);
}

console.log("Performance budget check passed.");

function attr(attrs, name) {
  const match = attrs.match(new RegExp(`\\b${name}="([^"]*)"`, "i"));
  return match ? match[1] : "";
}
