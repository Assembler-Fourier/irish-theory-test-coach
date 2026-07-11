import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), "..");

const EXCLUDED_DIRS = new Set([
  ".git",
  ".vercel",
  "node_modules",
]);

const EXCLUDED_PATH_PARTS = [
  path.join("data", "assets"),
  path.join("data", "raw"),
  path.join("public", "data"),
];

const SKIP_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".pdf",
  ".zip",
  ".gz",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".pyc",
]);

const SECRET_PATTERNS = [
  { name: "Stripe live secret key", regex: /\bsk_live_[A-Za-z0-9]{20,}\b/g },
  { name: "Stripe restricted live key", regex: /\brk_live_[A-Za-z0-9]{20,}\b/g },
  { name: "Stripe webhook secret", regex: /\bwhsec_[A-Za-z0-9]{20,}\b/g },
  { name: "Resend email API key", regex: /\bre_[A-Za-z0-9]{20,}\b/g },
  { name: "OpenAI project API key", regex: /\bsk-proj-[A-Za-z0-9_-]{20,}\b/g },
  { name: "Neon password token", regex: /\bnpg_[A-Za-z0-9]{10,}\b/g },
  {
    name: "Postgres connection string with credentials",
    regex: /postgres(?:ql)?:\/\/[^:\s"'`]+:[^@\s"'`]+@[^)\s"'`]+/g,
  },
];

const findings = [];

scanDirectory(root);

if (findings.length) {
  console.error("Potential secrets found. Values are intentionally not printed.");
  for (const finding of findings) {
    console.error(`${finding.file}:${finding.line} ${finding.pattern}`);
  }
  process.exit(1);
}

console.log("No obvious live secrets found in scanned project files.");

function scanDirectory(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    const relativePath = path.relative(root, fullPath);

    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      if (isExcludedPath(relativePath)) continue;
      scanDirectory(fullPath);
      continue;
    }

    if (!entry.isFile()) continue;
    if (isExcludedPath(relativePath)) continue;
    if (isLocalEnvFile(entry.name)) continue;
    if (SKIP_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
    scanFile(fullPath, relativePath);
  }
}

function isExcludedPath(relativePath) {
  const securityReports = path.join("reports", "security");
  if (
    relativePath === "reports" ||
    (relativePath.startsWith(`reports${path.sep}`) &&
      relativePath !== securityReports &&
      !relativePath.startsWith(`${securityReports}${path.sep}`))
  ) {
    return true;
  }
  return EXCLUDED_PATH_PARTS.some(
    (part) => relativePath === part || relativePath.startsWith(`${part}${path.sep}`)
  );
}

function isLocalEnvFile(fileName) {
  return fileName.startsWith(".env") && fileName !== ".env.example";
}

function scanFile(fullPath, relativePath) {
  let content;
  try {
    content = fs.readFileSync(fullPath, "utf8");
  } catch {
    return;
  }

  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const pattern of SECRET_PATTERNS) {
      pattern.regex.lastIndex = 0;
      if (pattern.regex.test(line)) {
        findings.push({
          file: relativePath,
          line: index + 1,
          pattern: pattern.name,
        });
      }
    }
  });
}
