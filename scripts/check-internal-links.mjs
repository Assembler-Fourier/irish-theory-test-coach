import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), "..");
const publicDir = path.join(root, "public");
const htmlFiles = fs.readdirSync(publicDir).filter((name) => name.endsWith(".html"));
const existing = new Set(htmlFiles);
const existingRoutes = new Set(htmlFiles.map((name) => name.replace(/\.html$/i, "")));
const errors = [];

for (const file of htmlFiles) {
  const html = fs.readFileSync(path.join(publicDir, file), "utf8");
  const links = Array.from(html.matchAll(/href="([^"]+)"/g)).map((match) => match[1]);
  const localHtmlLinks = links
    .filter((href) => href.startsWith("./") || href.startsWith("/"))
    .map((href) => href.replace(/^\.?\//, "").split("#")[0])
    .filter((href) => href.endsWith(".html") || href === "" || existingRoutes.has(href));
  for (const href of localHtmlLinks) {
    const target = href || "index.html";
    if (!existing.has(target) && !existing.has(`${target}.html`)) errors.push(`${file} links to missing ${target}.`);
  }
  if (!["admin.html", "offline.html"].includes(file) && localHtmlLinks.length < 4) {
    errors.push(`${file} has fewer than 4 internal HTML links.`);
  }
}

if (errors.length) {
  for (const error of errors) console.error(error);
  process.exit(1);
}

console.log("Internal link check passed.");
