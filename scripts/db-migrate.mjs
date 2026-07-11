import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { requireDatabaseUrl, root } from "./db-utils.mjs";

const { Client } = pg;
const migrationsDir = path.join(root, "database", "migrations");
const dryRun = process.argv.includes("--dry-run");

const migrations = loadMigrations();
if (dryRun) {
  for (const migration of migrations) {
    console.log(`DRY RUN ${migration.version} ${migration.name} ${migration.checksum}`);
  }
  console.log(`Migration dry run OK: ${migrations.length} migrations.`);
  process.exit(0);
}

const client = new Client({
  connectionString: requireDatabaseUrl(),
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  await ensureMigrationTable(client);
  await client.query("select pg_advisory_lock(hashtext('irish-theory-test-coach:migrations'))");
  try {
    const applied = await loadAppliedMigrations(client);
    for (const migration of migrations) {
      const existing = applied.get(migration.version);
      if (existing) {
        if (existing.checksum !== migration.checksum) {
          throw new Error(`Migration ${migration.version} checksum changed after being applied.`);
        }
        console.log(`Skipping ${migration.version} ${migration.name}; already applied.`);
        continue;
      }
      await applyMigration(client, migration);
    }
  } finally {
    await client.query("select pg_advisory_unlock(hashtext('irish-theory-test-coach:migrations'))").catch(() => {});
  }
  console.log("Database migrations complete.");
} finally {
  await client.end();
}

function loadMigrations() {
  if (!fs.existsSync(migrationsDir)) return [];
  const files = fs.readdirSync(migrationsDir)
    .filter((file) => /^\d{4}_[a-z0-9_]+\.sql$/i.test(file))
    .sort();
  return files.map((file) => {
    const version = file.slice(0, 4);
    const name = file.replace(/^\d{4}_/, "").replace(/\.sql$/i, "");
    const filePath = path.join(migrationsDir, file);
    const sql = expandIncludes(fs.readFileSync(filePath, "utf8"), filePath);
    return {
      version,
      name,
      file,
      sql,
      checksum: crypto.createHash("sha256").update(sql).digest("hex"),
    };
  });
}

function expandIncludes(sql, filePath) {
  return sql.replace(/^--\s*codex-include:\s*(.+)$/gm, (_, includePath) => {
    const resolved = path.resolve(path.dirname(filePath), includePath.trim());
    if (!resolved.startsWith(root)) {
      throw new Error(`Migration include escapes repository root: ${includePath}`);
    }
    return fs.readFileSync(resolved, "utf8");
  });
}

async function ensureMigrationTable(client) {
  await client.query(`
    create table if not exists schema_migrations (
      version text primary key,
      name text not null,
      checksum text not null,
      applied_at timestamptz not null default now(),
      duration_ms integer not null default 0,
      success boolean not null default true,
      log jsonb not null default '{}'::jsonb
    )
  `);
}

async function loadAppliedMigrations(client) {
  const result = await client.query("select version, checksum from schema_migrations");
  return new Map(result.rows.map((row) => [row.version, row]));
}

async function applyMigration(client, migration) {
  const started = Date.now();
  console.log(`Applying ${migration.version} ${migration.name}...`);
  await client.query("begin");
  try {
    await client.query(migration.sql);
    await client.query(
      `
        insert into schema_migrations (version, name, checksum, duration_ms, success, log)
        values ($1, $2, $3, $4, true, $5::jsonb)
      `,
      [
        migration.version,
        migration.name,
        migration.checksum,
        Math.max(0, Date.now() - started),
        JSON.stringify({ file: migration.file }),
      ],
    );
    await client.query("commit");
    console.log(`Applied ${migration.version} ${migration.name}.`);
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  }
}
