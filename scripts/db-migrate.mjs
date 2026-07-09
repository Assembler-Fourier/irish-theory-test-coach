import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { requireDatabaseUrl, root } from "./db-utils.mjs";

const { Client } = pg;
const databaseUrl = requireDatabaseUrl();
const schemaPath = path.join(root, "database", "schema.sql");
const schema = fs.readFileSync(schemaPath, "utf8");

const client = new Client({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  await client.query(schema);
  console.log("Database migration complete.");
} finally {
  await client.end();
}
