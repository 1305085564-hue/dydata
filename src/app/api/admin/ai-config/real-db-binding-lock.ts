import { createRequire } from "node:module";

const { Client } = createRequire(import.meta.url)("pg");
const LOCK_KEY: [number, number] = [1146707009, 1229087558];

/** Serializes local real-db tests that temporarily replace global AI feature bindings. */
export async function acquireRealDbAiFeatureBindingLock(connectionString: string): Promise<() => Promise<void>> {
  const url = new URL(connectionString);
  if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== "54322") {
    throw new Error("AI 功能绑定互斥锁只允许连接本地 Supabase PostgreSQL 54322");
  }

  const client = new Client({ connectionString: url.href });
  await client.connect();
  try {
    await client.query("select pg_advisory_lock($1, $2)", LOCK_KEY);
  } catch (error) {
    await client.end();
    throw error;
  }

  return async () => {
    try {
      const result = await client.query("select pg_advisory_unlock($1, $2)", LOCK_KEY);
      if (result.rows[0]?.pg_advisory_unlock !== true) throw new Error("AI 功能绑定互斥锁未持有");
    } finally {
      await client.end();
    }
  };
}
