import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), "..");
const publicDir = path.join(root, "public");

const requiredFiles = [
  "manifest.webmanifest",
  "service-worker.js",
  "offline.html",
  "product-summary.json",
  "release-manifest.json",
  "icons/app-icon.svg",
  "icons/maskable-icon.svg",
  "index.html",
  "app.html",
];

const errors = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(publicDir, file))) {
    errors.push(`Missing ${file}`);
  }
}

const index = readPublicFile("index.html");
const appHtml = readPublicFile("app.html");
const app = readPublicFile("app.js");
if (!index.includes('rel="manifest"')) errors.push("index.html does not link the manifest.");
if (!appHtml.includes('rel="manifest"')) errors.push("app.html does not link the manifest.");
if (!app.includes("service-worker.js")) errors.push("app.js does not register service-worker.js.");

const manifest = JSON.parse(readPublicFile("manifest.webmanifest"));
["name", "short_name", "start_url", "display", "theme_color", "background_color"].forEach((field) => {
  if (!manifest[field]) errors.push(`manifest.webmanifest missing ${field}`);
});

if (!Array.isArray(manifest.icons) || manifest.icons.length < 2) {
  errors.push("manifest.webmanifest needs app and maskable icons.");
}

const serviceWorker = readPublicFile("service-worker.js");
[
  "CACHE_VERSION",
  "install",
  "activate",
  "fetch",
  "preview-questions.json",
  "app.html",
  "product-summary.js",
  "offline.html",
].forEach((needle) => {
  if (!serviceWorker.includes(needle)) errors.push(`service-worker.js missing ${needle}`);
});

for (const forbidden of ["./data/questions.enriched.json", "./data/questions.json", "./data/study_report.json", "/data/assets/"]) {
  if (serviceWorker.includes(forbidden)) errors.push(`service-worker.js must not precache protected asset ${forbidden}.`);
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

console.log("PWA check passed.");

function readPublicFile(file) {
  return fs.readFileSync(path.join(publicDir, file), "utf8");
}
