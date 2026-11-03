import { and, eq, sql } from "drizzle-orm";
import type { Db } from "./client.ts";
import { reservations, rooms } from "./schema.ts";

export function listRooms(db: Db) {
  return db.select().from(rooms).orderBy(rooms.name);
}

export async function createReservation(db: Db, input: typeof reservations.$inferInsert) {
  const [row] = await db.insert(reservations).values(input).returning();
  return row;
}

export function findConfirmedReservations(
  db: Db,
  params: { roomId: string; from: Date; to: Date },
) {
  return db
    .select()
    .from(reservations)
    .where(
      and(
        eq(reservations.roomId, params.roomId),
        eq(reservations.status, "confirmed"),
        sql`tstzrange(${reservations.startAt}, ${reservations.endAt}, '[)')
            && tstzrange(${params.from.toISOString()}::timestamptz, ${params.to.toISOString()}::timestamptz, '[)')`,
      ),
    )
    .orderBy(reservations.startAt);
}

// 何度呼んでも同じ結果になる。戻り値が undefined なら、その予約は存在しない
export async function cancelReservation(db: Db, id: string) {
  const [row] = await db
    .update(reservations)
    .set({ status: "cancelled" })
    .where(eq(reservations.id, id))
    .returning();
  return row;
}
