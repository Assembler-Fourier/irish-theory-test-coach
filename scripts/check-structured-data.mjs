import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), "..");
const publicDir = path.join(root, "public");
const errors = [];

for (const file of fs.readdirSync(publicDir).filter((name) => name.endsWith(".html"))) {
  const html = fs.readFileSync(path.join(publicDir, file), "utf8");
  if (/<meta\s+name="robots"\s+content="[^"]*noindex/i.test(html)) continue;
  const blocks = Array.from(html.matchAll(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi));
  if (isLanding(file) && !blocks.length) errors.push(`${file} has no JSON-LD blocks.`);
  for (const block of blocks) {
    let parsed;
    try {
      parsed = JSON.parse(block[1]);
    } catch {
      errors.push(`${file} has invalid JSON-LD.`);
      continue;
    }
    if (!parsed["@context"]) errors.push(`${file} JSON-LD missing @context.`);
    if (!parsed["@type"]) errors.push(`${file} JSON-LD missing @type.`);
    if (parsed["@type"] === "FAQPage" && !/class="seo-card-band faq-section"|<h2>FAQ<\/h2>/i.test(html)) {
      errors.push(`${file} has FAQPage JSON-LD without visible FAQ.`);
    }
    if (/AggregateRating|reviewRating|"ratingValue"/i.test(JSON.stringify(parsed))) {
      errors.push(`${file} includes rating structured data, which is not allowed.`);
    }
  }
  if (isLanding(file) && !blocks.some((block) => /"@type":"BreadcrumbList"|"@type":\s*"BreadcrumbList"/.test(block[1]))) {
    errors.push(`${file} is missing BreadcrumbList JSON-LD.`);
  }
}

if (errors.length) {
  for (const error of errors) console.error(error);
  process.exit(1);
}

console.log("Structured data check passed.");

function isLanding(file) {
  return !["privacy.html", "terms.html", "refunds.html", "contact.html", "offline.html", "admin.html"].includes(file);
}
