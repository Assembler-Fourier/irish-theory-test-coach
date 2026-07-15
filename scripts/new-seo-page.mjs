import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalSiteOrigin } from "../shared/growth-config.js";

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), "..");
const siteUrl = canonicalSiteOrigin(process.env);
const slug = cleanSlug(process.argv[2] || "");
const title = process.argv.slice(3).join(" ") || "New Irish Theory Test Guide";

if (!slug) {
  console.error("Usage: node scripts/new-seo-page.mjs page-slug.html \"Page title\"");
  process.exit(1);
}

const filePath = path.join(root, "public", slug);
if (fs.existsSync(filePath)) {
  console.error(`${slug} already exists.`);
  process.exit(1);
}

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="Placeholder meta description for an independent Irish theory test practice guide. Replace before publishing.">
    <link rel="canonical" href="${siteUrl}/${slug}">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="Irish Theory Test Coach">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="Placeholder description. Replace before publishing.">
    <meta property="og:url" content="${siteUrl}/${slug}">
    <meta property="og:image" content="${siteUrl}/marketing/og-home.svg">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:description" content="Placeholder description. Replace before publishing.">
    <meta name="twitter:image" content="${siteUrl}/marketing/og-home.svg">
    <link rel="stylesheet" href="./styles.css?v=20260710-rebuild">
  </head>
  <body>
    <div class="shell seo-shell">
      <main class="seo-main">
        <h1>${escapeHtml(title)}</h1>
        <p>Independent practice tool. Not affiliated with RSA or Prometric.</p>
        <section>
          <h2>Draft content checklist</h2>
          <ul>
            <li>Unique H1 and metadata.</li>
            <li>Helpful body content and visible FAQ if FAQ schema is added.</li>
            <li>Internal links to app, pricing, road signs, mock exam, and study plan.</li>
            <li>No official, guaranteed-pass, official-frequency, or copied-question claims.</li>
          </ul>
        </section>
      </main>
    </div>
    <script src="./growth-config.js?v=20260710-rebuild"></script>
    <script type="module" src="./privacy-consent.js?v=20260715-legal-v1"></script>
    <script type="module" src="./growth-tracking.js?v=20260710-rebuild"></script>
    <script type="module" src="./frontend-monitoring.js?v=20260710-rebuild"></script>
  </body>
</html>
`;

fs.writeFileSync(filePath, html, "utf8");
console.log(`Created public/${slug}`);

function cleanSlug(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9.-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function escapeHtml(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
