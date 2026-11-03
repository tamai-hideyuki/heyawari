import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.ts";

export function createDb(
  connectionString = process.env.DATABASE_URL ??
    "postgres://heyawari:heyawari@localhost:5432/heyawari",
) {
  const pool = new pg.Pool({ connectionString });
  return drizzle({ client: pool, schema });
}

export type Db = ReturnType<typeof createDb>;
