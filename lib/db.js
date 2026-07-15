import pg from "pg";

const { Client } = pg;

const LEGACY_TLS_MODES = new Set(["prefer", "require", "verify-ca"]);

export function normalizeDatabaseConnectionString(databaseUrl) {
  const value = String(databaseUrl || "").trim();
  if (!value) return value;

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return value;
  }

  const sslMode = String(parsed.searchParams.get("sslmode") || "").toLowerCase();
  if (LEGACY_TLS_MODES.has(sslMode)) {
    parsed.searchParams.set("sslmode", "verify-full");
  }
  return parsed.toString();
}

export function createDbClient(databaseUrl) {
  return new Client({
    connectionString: normalizeDatabaseConnectionString(databaseUrl),
  });
}

export function createDbPool(databaseUrl) {
  return new pg.Pool({
    connectionString: normalizeDatabaseConnectionString(databaseUrl),
  });
}

export async function withDb(databaseUrl, callback) {
  const client = createDbClient(databaseUrl);
  try {
    await client.connect();
    return await callback(client);
  } finally {
    await client.end().catch(() => {});
  }
}

export async function withTransaction(databaseUrl, callback) {
  return withDb(databaseUrl, async (client) => {
    await client.query("begin");
    try {
      const result = await callback(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => {});
      throw error;
    }
  });
}
