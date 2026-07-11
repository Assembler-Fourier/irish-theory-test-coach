import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), "..");
const publicDir = path.join(root, "public");
const sitemapPath = path.join(publicDir, "sitemap.xml");
const siteUrl = new URL(process.env.PUBLIC_SITE_URL || "https://irish-theory-test-coach.vercel.app").origin;
const canonicalPattern = new RegExp(`<link\\s+rel="canonical"\\s+href="${escapeRegExp(siteUrl)}\\/[^\"]*"`, "i");

const sitemap = fs.readFileSync(sitemapPath, "utf8");
const locs = Array.from(sitemap.matchAll(/<loc>(.*?)<\/loc>/g)).map((match) => match[1]);

if (!locs.length) {
  throw new Error("sitemap.xml does not contain any <loc> entries.");
}

const errors = [];

for (const loc of locs) {
  const url = new URL(loc);
  const file = fileForPath(url.pathname);
  if (!fs.existsSync(file)) {
    errors.push(`${url.pathname} does not map to a public file.`);
    continue;
  }

  if (path.extname(file) !== ".html") continue;
  const html = fs.readFileSync(file, "utf8");
  const relative = path.relative(publicDir, file);

  for (const check of [
    [/<title>[^<]{12,}<\/title>/i, "title"],
    [/<meta\s+name="description"\s+content="[^"]{50,}"/i, "meta description"],
    [canonicalPattern, "canonical"],
  ]) {
    if (!check[0].test(html)) {
      errors.push(`${relative} is missing ${check[1]}.`);
    }
  }

  if (isLandingPage(relative) && !/"@type"\s*:\s*"FAQPage"/.test(html)) {
    errors.push(`${relative} is missing FAQPage JSON-LD.`);
  }

  if (containsBlockedClaim(html)) {
    errors.push(`${relative} contains a blocked claim phrase.`);
  }
}

const robots = fs.readFileSync(path.join(publicDir, "robots.txt"), "utf8");
if (!robots.includes(`Sitemap: ${siteUrl}/sitemap.xml`)) {
  errors.push("robots.txt does not point to sitemap.xml.");
}

if (errors.length) {
  for (const error of errors) {
    console.error(error);
  }
  process.exit(1);
}

console.log(`SEO check passed for ${locs.length} sitemap URLs.`);

function fileForPath(urlPath) {
  if (urlPath === "/") return path.join(publicDir, "index.html");
  const clean = decodeURIComponent(urlPath).replace(/^\/+/, "");
  const direct = path.join(publicDir, clean);
  if (fs.existsSync(direct)) return direct;
  return path.join(publicDir, `${clean}.html`);
}

function isLandingPage(relative) {
  return [
    "category-b-theory-test.html",
    "irish-theory-test-road-signs.html",
    "car-theory-test-mock-exam.html",
    "rules-of-the-road-practice.html",
    "theory-test-study-plan.html",
  ].includes(relative);
}

function containsBlockedClaim(html) {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").toLowerCase();
  const blocked = [
    "guaranteed pass",
    "official question",
    "official exam frequency",
  ];
  return blocked.some((phrase) => {
    const index = text.indexOf(phrase);
    if (index === -1) return false;
    const before = text.slice(Math.max(0, index - 60), index);
    return !/(not|no|does not|do not|without)[^.]{0,55}$/.test(before);
  });
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
