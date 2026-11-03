import { and, eq, getTableColumns, sql } from "drizzle-orm";
import type { Db } from "./client.ts";
import { reservations, rooms, users } from "./schema.ts";

export function listRooms(db: Db) {
  return db.select().from(rooms).orderBy(rooms.name);
}

export async function createReservation(db: Db, input: typeof reservations.$inferInsert) {
  const [row] = await db.insert(reservations).values(input).returning();
  return row;
}

/** 期間と重なる確定済みの予約。roomId を省くと全会議室が対象。予約者の名前も付ける */
export function findConfirmedReservations(
  db: Db,
  params: { roomId?: string; from: Date; to: Date },
) {
  return db
    .select({ ...getTableColumns(reservations), userName: users.name })
    .from(reservations)
    .innerJoin(users, eq(users.id, reservations.userId))
    .where(
      and(
        params.roomId === undefined ? undefined : eq(reservations.roomId, params.roomId),
        eq(reservations.status, "confirmed"),
        sql`tstzrange(${reservations.startAt}, ${reservations.endAt}, '[)')
            && tstzrange(${params.from.toISOString()}::timestamptz, ${params.to.toISOString()}::timestamptz, '[)')`,
      ),
    )
    .orderBy(reservations.startAt);
}

export type CancelResult =
  | { ok: true; reservation: typeof reservations.$inferSelect }
  | { ok: false; reason: "not_found" | "forbidden" };

/**
 * 予約した本人だけがキャンセルできる。何度呼んでも同じ結果になる。
 * 本人の予約かどうかは UPDATE の条件に含め、確認と更新の間に競合が入らないようにする
 */
export async function cancelReservation(
  db: Db,
  params: { id: string; userId: string },
): Promise<CancelResult> {
  const [row] = await db
    .update(reservations)
    .set({ status: "cancelled" })
    .where(and(eq(reservations.id, params.id), eq(reservations.userId, params.userId)))
    .returning();
  if (row) return { ok: true, reservation: row };

  const [exists] = await db
    .select({ id: reservations.id })
    .from(reservations)
    .where(eq(reservations.id, params.id));
  return { ok: false, reason: exists ? "forbidden" : "not_found" };
}
