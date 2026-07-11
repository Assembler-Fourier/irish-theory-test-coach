import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), "..");
const migrationsDir = path.join(root, "database", "migrations");
const schemaPath = path.join(root, "database", "schema.sql");
const errors = [];

const schema = readText(schemaPath);
for (const phrase of [
  "create table if not exists schema_migrations",
  "create table if not exists operational_events",
  "create table if not exists reconciliation_runs",
  "create table if not exists reconciliation_findings",
  "create table if not exists restore_drills",
]) {
  if (!schema.includes(phrase)) errors.push(`database/schema.sql missing ${phrase}.`);
}

const files = fs.existsSync(migrationsDir)
  ? fs.readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort()
  : [];

if (!files.length) errors.push("database/migrations must contain numbered SQL migrations.");

let previous = 0;
const seenVersions = new Set();
for (const file of files) {
  const match = file.match(/^(\d{4})_[a-z0-9_]+\.sql$/i);
  if (!match) {
    errors.push(`${file} must use the form 0001_short_name.sql.`);
    continue;
  }
  const version = Number(match[1]);
  if (seenVersions.has(match[1])) errors.push(`${file} duplicates migration version ${match[1]}.`);
  seenVersions.add(match[1]);
  if (version !== previous + 1) errors.push(`${file} is out of sequence; expected ${String(previous + 1).padStart(4, "0")}.`);
  previous = version;

  const filePath = path.join(migrationsDir, file);
  const raw = readText(filePath);
  const expanded = expandIncludes(raw, filePath);
  if (!expanded.trim()) errors.push(`${file} expands to empty SQL.`);
  if (/drop\s+(table|database|schema)\s+/i.test(expanded) && !/if\s+exists/i.test(expanded)) {
    errors.push(`${file} contains a destructive drop without IF EXISTS.`);
  }
  if (/create\s+table\s+(?!if\s+not\s+exists)/i.test(expanded)) {
    errors.push(`${file} creates a table without IF NOT EXISTS.`);
  }
  crypto.createHash("sha256").update(expanded).digest("hex");
}

const migrateScript = readText(path.join(root, "scripts", "db-migrate.mjs"));
for (const phrase of ["schema_migrations", "begin", "commit", "rollback", "checksum", "pg_advisory_lock"]) {
  if (!migrateScript.includes(phrase)) errors.push(`db-migrate.mjs missing ${phrase}.`);
}

if (errors.length) {
  for (const error of errors) console.error(error);
  process.exit(1);
}

assert.ok(files.includes("0001_baseline_schema.sql"), "baseline migration is required");
console.log(`Migration check passed (${files.length} migrations).`);

function expandIncludes(sql, filePath) {
  return sql.replace(/^--\s*codex-include:\s*(.+)$/gm, (_, includePath) => {
    const resolved = path.resolve(path.dirname(filePath), includePath.trim());
    if (!resolved.startsWith(root)) {
      errors.push(`${path.basename(filePath)} include escapes repository root: ${includePath}`);
      return "";
    }
    if (!fs.existsSync(resolved)) {
      errors.push(`${path.basename(filePath)} include not found: ${includePath}`);
      return "";
    }
    return readText(resolved);
  });
}

function readText(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}
