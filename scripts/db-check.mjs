import pg from "pg";
import { requireDatabaseUrl } from "./db-utils.mjs";

const { Client } = pg;
const client = new Client({
  connectionString: requireDatabaseUrl(),
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  const result = await client.query(`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_name in (
        'users',
        'schema_migrations',
        'purchases',
        'entitlements',
        'login_tokens',
        'sessions',
        'attempts',
        'flags',
        'admin_audit_log',
        'question_sources',
        'question_reviews',
        'question_versions',
        'ai_explanations',
        'ai_explanation_rate_limits',
        'source_documents',
        'source_chunks',
        'generated_questions',
        'operational_events',
        'reconciliation_runs',
        'reconciliation_findings',
        'restore_drills'
      )
    order by table_name
  `);
  console.log(`Connected to Neon. Tables: ${result.rows.map((row) => row.table_name).join(", ") || "none yet"}`);
} finally {
  await client.end();
}
