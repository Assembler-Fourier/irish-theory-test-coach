import pg from "pg";

const { Client } = pg;

export function createDbClient(databaseUrl) {
  return new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
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
