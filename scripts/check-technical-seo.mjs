import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalSiteOrigin } from "../shared/growth-config.js";

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), "..");
const publicDir = path.join(root, "public");
const siteUrl = canonicalSiteOrigin(process.env);
const sitemap = fs.readFileSync(path.join(publicDir, "sitemap.xml"), "utf8");
const sitemapUrls = new Set(
  Array.from(sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)).map((match) => {
    const url = new URL(match[1]);
    return url.pathname.replace(/^\//, "");
  }),
);
const canonicalPattern = new RegExp(`<link\\s+rel="canonical"\\s+href="${escapeRegExp(siteUrl)}\\/[^\"]*"`, "i");
const ogImagePattern = new RegExp(`<meta\\s+property="og:image"\\s+content="${escapeRegExp(siteUrl)}\\/[^\"]+"`, "i");
const errors = [];
const seenTitles = new Map();
const seenDescriptions = new Map();

for (const file of fs.readdirSync(publicDir).filter((name) => name.endsWith(".html"))) {
  const html = fs.readFileSync(path.join(publicDir, file), "utf8");
  const noindex = /<meta\s+name="robots"\s+content="[^"]*noindex/i.test(html);
  if (noindex) continue;

  const route = file === "index.html" ? "" : file;
  const cleanRoute = file === "index.html" ? "" : file.replace(/\.html$/i, "");
  if (!sitemapUrls.has(route) && !sitemapUrls.has(cleanRoute)) {
    errors.push(`${file} is indexable but missing from sitemap.xml.`);
  }

  const title = matchContent(html, /<title>([^<]+)<\/title>/i);
  const description = matchContent(html, /<meta\s+name="description"\s+content="([^"]+)"/i);
  const h1Count = (html.match(/<h1[\s>]/gi) || []).length;

  requireMatch(file, html, canonicalPattern, "canonical");
  requireMatch(file, html, /<meta\s+property="og:title"\s+content="[^"]+"/i, "Open Graph title");
  requireMatch(file, html, /<meta\s+property="og:description"\s+content="[^"]+"/i, "Open Graph description");
  requireMatch(file, html, ogImagePattern, "Open Graph image");
  requireMatch(file, html, /<meta\s+name="twitter:card"\s+content="summary_large_image"/i, "Twitter card");

  if (!title || title.length < 12) errors.push(`${file} has a missing or weak title.`);
  if (!description || description.length < 50) errors.push(`${file} has a missing or weak meta description.`);
  if (h1Count !== 1) errors.push(`${file} should have exactly one H1; found ${h1Count}.`);
  trackDuplicate(seenTitles, title, file, "title");
  trackDuplicate(seenDescriptions, description, file, "meta description");
}

const robots = fs.readFileSync(path.join(publicDir, "robots.txt"), "utf8");
if (/^Disallow:\s*\/?\s*$/im.test(robots)) errors.push("robots.txt blocks important pages.");

if (errors.length) {
  for (const error of errors) console.error(error);
  process.exit(1);
}

console.log("Technical SEO check passed.");

function requireMatch(file, html, regex, label) {
  if (!regex.test(html)) errors.push(`${file} is missing ${label}.`);
}

function matchContent(html, regex) {
  return (html.match(regex)?.[1] || "").trim();
}

function trackDuplicate(map, value, file, label) {
  if (!value) return;
  if (map.has(value)) errors.push(`${file} duplicates ${label} with ${map.get(value)}.`);
  map.set(value, file);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
