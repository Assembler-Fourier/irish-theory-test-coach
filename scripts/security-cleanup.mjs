import pg from "pg";

const { Client } = pg;

const databaseUrl = process.env.DATABASE_URL;
const apply = process.env.SECURITY_CLEANUP_APPLY === "true";

const retention = {
  expiredLoginTokensDays: Number(process.env.RETENTION_EXPIRED_LOGIN_TOKENS_DAYS || 30),
  revokedSessionsDays: Number(process.env.RETENTION_REVOKED_SESSIONS_DAYS || 90),
  expiredSessionsDays: Number(process.env.RETENTION_EXPIRED_SESSIONS_DAYS || 180),
  anonymousAnalyticsDays: Number(process.env.RETENTION_ANONYMOUS_ANALYTICS_DAYS || 180),
  webhookPayloadDays: Number(process.env.RETENTION_WEBHOOK_PAYLOAD_DAYS || 365),
};

if (!databaseUrl) {
  console.error("DATABASE_URL is required to run security cleanup.");
  process.exit(1);
}

const client = new Client({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes("localhost") ? false : { rejectUnauthorized: false },
});

const jobs = [
  {
    name: "expired_login_tokens",
    table: "login_tokens",
    where: "expires_at < now() - ($1::int * interval '1 day')",
    args: [retention.expiredLoginTokensDays],
  },
  {
    name: "revoked_sessions",
    table: "sessions",
    where: "revoked_at is not null and revoked_at < now() - ($1::int * interval '1 day')",
    args: [retention.revokedSessionsDays],
  },
  {
    name: "expired_sessions",
    table: "sessions",
    where: "expires_at < now() - ($1::int * interval '1 day')",
    args: [retention.expiredSessionsDays],
  },
  {
    name: "anonymous_analytics",
    table: "events",
    where: "user_id is null and created_at < now() - ($1::int * interval '1 day')",
    args: [retention.anonymousAnalyticsDays],
  },
  {
    name: "processed_webhook_payload_metadata",
    table: "stripe_events",
    where: "processed_at is not null and processed_at < now() - ($1::int * interval '1 day')",
    args: [retention.webhookPayloadDays],
    action: "redact_payload",
  },
];

try {
  await client.connect();
  console.log(`Security cleanup running in ${apply ? "apply" : "dry-run"} mode.`);
  for (const job of jobs) {
    const count = await countRows(job);
    if (!apply) {
      console.log(`${job.name}: ${count} rows would be affected.`);
      continue;
    }
    const changed = await applyJob(job);
    console.log(`${job.name}: ${changed} rows affected.`);
  }
  console.log("Retention cleanup complete.");
} finally {
  await client.end();
}

async function countRows(job) {
  const result = await client.query(
    `select count(*)::int as count from ${job.table} where ${job.where}`,
    job.args
  );
  return result.rows[0]?.count || 0;
}

async function applyJob(job) {
  if (job.action === "redact_payload") {
    const result = await client.query(
      `update ${job.table}
       set payload = jsonb_build_object('redacted', true, 'retentionPolicy', $2::text)
       where ${job.where}`,
      [...job.args, job.name]
    );
    return result.rowCount;
  }

  const result = await client.query(
    `delete from ${job.table} where ${job.where}`,
    job.args
  );
  return result.rowCount;
}
