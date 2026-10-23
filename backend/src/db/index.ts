import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import { config } from "@/server/config";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export { schema };

type Cache = { db?: Db; ready?: Promise<void>; close?: () => Promise<void> };
const g = globalThis as unknown as { __cctvDb?: Cache };
const cache: Cache = (g.__cctvDb ??= {});

const migrationsFolder = () => path.join(process.cwd(), "drizzle");

async function init(): Promise<void> {
  const cfg = config();
  if (cfg.DATABASE_URL) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const client = postgres(cfg.DATABASE_URL, { max: cfg.isLive ? 5 : 3, prepare: false });
    cache.db = drizzle(client, { schema }) as unknown as Db;
    cache.close = async () => {
      await client.end();
    };
    return;
  }
  if (cfg.isLive) throw new Error("DATABASE_URL is required in staging/production");

  // Development / tests: embedded PostgreSQL (PGlite). Memory-only in tests, on disk in development.
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dataDir = cfg.APP_ENV === "test" ? undefined : path.join(process.cwd(), ".pglite");
  const client = new PGlite(dataDir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: migrationsFolder() });
  cache.db = db as unknown as Db;
  cache.close = async () => {
    await client.close();
  };
}

export async function getDb(): Promise<Db> {
  if (!cache.db) {
    cache.ready ??= init().catch((e) => {
      cache.ready = undefined;
      throw e;
    });
    await cache.ready;
  }
  return cache.db!;
}

/** Tests only: drop the cached connection so the next getDb() builds a fresh database. */
export async function resetDbForTests() {
  if (cache.close) await cache.close();
  cache.db = undefined;
  cache.ready = undefined;
  cache.close = undefined;
}
