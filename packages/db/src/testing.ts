// テスト専用。開発用 DB とは別のデータベースを使い、テストのたびに中身を空にする
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { createDb, type Db } from "./client.ts";
import { rooms, users } from "./schema.ts";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://heyawari:heyawari@localhost:5432/heyawari_test";

const migrationsFolder = new URL("../drizzle", import.meta.url).pathname;

/** テスト用 DB が無ければ作り、マイグレーションを当てた状態の接続を返す */
export async function setupTestDb(): Promise<Db> {
  const url = new URL(TEST_DATABASE_URL);
  const dbName = url.pathname.slice(1);

  // データベースの作成は、別のデータベース（postgres）に接続して行う
  const admin = new pg.Client({ connectionString: Object.assign(new URL(url), { pathname: "/postgres" }).toString() });
  await admin.connect();
  try {
    const { rowCount } = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
    if (rowCount === 0) await admin.query(`CREATE DATABASE "${dbName.replaceAll('"', '""')}"`);
  } finally {
    await admin.end();
  }

  const db = createDb(TEST_DATABASE_URL);
  await migrate(db, { migrationsFolder });
  return db;
}

export async function resetTestDb(db: Db) {
  await db.execute(sql`TRUNCATE reservations, rooms, users, sessions, accounts, verifications`);
}

export async function closeTestDb(db: Db) {
  await db.$client.end();
}

export async function insertRoom(db: Db, values: { name?: string; capacity?: number } = {}) {
  const [room] = await db
    .insert(rooms)
    .values({ name: values.name ?? "会議室A", capacity: values.capacity ?? 8 })
    .returning();
  return room!;
}

/** 予約の持ち主にするユーザーを直接作る（ログインが要らない DB のテスト用） */
export async function insertUser(db: Db, values: { name?: string; email?: string } = {}) {
  const [user] = await db
    .insert(users)
    .values({
      name: values.name ?? "テスト太郎",
      email: values.email ?? `user-${crypto.randomUUID()}@example.com`,
    })
    .returning();
  return user!;
}
