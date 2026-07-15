import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "public");
const keywordMapPath = path.join(root, "docs", "seo-keyword-map.md");
const errors = [];

const priorityPages = [
  "irish-theory-test-practice.html",
  "driver-theory-test-ireland.html",
  "category-b-theory-test-ireland.html",
  "mock-theory-test-ireland.html",
  "irish-road-signs-test.html",
  "rules-of-the-road-practice.html",
  "theory-test-study-plan.html",
  "failed-theory-test-ireland.html",
  "theory-test-questions-and-answers-ireland.html",
  "hardest-theory-test-questions-ireland.html",
  "theory-test-ireland-40-questions.html",
];

const requiredKeywords = [
  "irish theory test practice",
  "theory test ireland practice",
  "driver theory test ireland practice",
  "category b theory test ireland",
  "car theory test ireland",
  "mock theory test ireland",
  "car theory test mock exam",
  "driver theory mock test ireland",
  "irish road signs test",
  "road signs ireland quiz",
  "road signs practice ireland",
  "rules of the road practice test",
  "theory test study plan ireland",
  "failed theory test ireland",
  "irish theory test questions and answers",
  "theory test questions ireland",
  "hardest theory test questions ireland",
  "most missed theory test questions ireland",
  "theory test ireland 40 questions",
  "theory test pass mark ireland",
  "35 out of 40 theory test ireland",
];

const editorialTokenSets = [];

for (const file of priorityPages) {
  const filePath = path.join(publicDir, file);
  if (!fs.existsSync(filePath)) {
    errors.push(`${file} is missing.`);
    continue;
  }

  const html = fs.readFileSync(filePath, "utf8");
  const main = match(html, /<main\b[\s\S]*?<\/main>/i);
  const editorial = match(html, /<article class="seo-card-band">([\s\S]*?)<\/article>/i);
  const words = text(main).split(/\s+/).filter(Boolean);
  const internalLinks = [...main.matchAll(/<a\b[^>]*href="\/(?!\/|api\/|admin)[^"]*"/gi)].length;
  const editorialHeadings = [...editorial.matchAll(/<h2\b/gi)].length;

  if (words.length < 650) errors.push(`${file} has only ${words.length} visible main-content words; expected at least 650.`);
  if (internalLinks < 6) errors.push(`${file} has only ${internalLinks} internal links; expected at least 6.`);
  if (editorialHeadings < 4) errors.push(`${file} needs at least four topic-specific editorial sections.`);
  if (!html.includes('class="content-method-note"')) errors.push(`${file} is missing the visible preparation/methodology note.`);
  if (!html.includes('<meta name="author" content="Irish Theory Test Coach">')) errors.push(`${file} is missing the truthful publisher metadata.`);
  if (!html.includes("Independent practice tool. Not affiliated with RSA or Prometric.")) errors.push(`${file} is missing the non-affiliation statement.`);

  editorialTokenSets.push({ file, tokens: tokenSet(text(editorial)) });
}

for (let left = 0; left < editorialTokenSets.length; left += 1) {
  for (let right = left + 1; right < editorialTokenSets.length; right += 1) {
    const score = jaccard(editorialTokenSets[left].tokens, editorialTokenSets[right].tokens);
    if (score > 0.72) {
      errors.push(`${editorialTokenSets[left].file} and ${editorialTokenSets[right].file} are too similar (${score.toFixed(2)} token Jaccard).`);
    }
  }
}

if (!fs.existsSync(keywordMapPath)) {
  errors.push("docs/seo-keyword-map.md is missing.");
} else {
  const map = fs.readFileSync(keywordMapPath, "utf8").toLowerCase();
  for (const keyword of requiredKeywords) {
    if (!map.includes(`## ${keyword}`)) errors.push(`SEO keyword map is missing: ${keyword}`);
  }
}

if (errors.length) {
  errors.forEach((error) => console.error(error));
  process.exit(1);
}

console.log(`SEO content quality check passed (${priorityPages.length} priority pages, ${requiredKeywords.length} mapped keyword targets).`);

function match(value, pattern) {
  return String(value || "").match(pattern)?.[0] || "";
}

function text(value) {
  return String(value || "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:amp|quot|#39|lt|gt);/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(value) {
  return new Set(String(value || "").toLowerCase().match(/[a-z0-9]{3,}/g) || []);
}

function jaccard(left, right) {
  const intersection = [...left].filter((token) => right.has(token)).length;
  const union = new Set([...left, ...right]).size;
  return union ? intersection / union : 0;
}
