/**
 * Applies SQL migrations from db/migrations in lexical order, once each.
 * Usage: DATABASE_URL=postgres://... npm run db:migrate
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

export async function migrate(databaseUrl: string, ssl = false): Promise<string[]> {
  const client = new Client({ connectionString: databaseUrl, ssl: ssl ? { rejectUnauthorized: true } : undefined });
  await client.connect();
  const applied: string[] = [];
  try {
    await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
    const dir = path.resolve(process.cwd(), "db/migrations");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      const done = await client.query("SELECT 1 FROM schema_migrations WHERE name = $1", [file]);
      if (done.rowCount) continue;
      await client.query("BEGIN");
      try {
        await client.query(readFileSync(path.join(dir, file), "utf8"));
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
        applied.push(file);
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
    }
  } finally {
    await client.end();
  }
  return applied;
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]).endsWith(path.join("scripts", "migrate.ts"));
if (isDirectRun) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL lipsește");
    process.exit(1);
  }
  migrate(url, process.env.DATABASE_SSL === "true")
    .then((applied) => console.info(applied.length ? `Migrări aplicate: ${applied.join(", ")}` : "Baza de date este la zi."))
    .catch((e: Error) => {
      console.error(`Migrarea a eșuat: ${e.name}`);
      process.exit(1);
    });
}
