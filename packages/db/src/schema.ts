import { sql } from "drizzle-orm";
import { check, integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const reservationStatus = pgEnum("reservation_status", ["confirmed", "cancelled"]);

export const rooms = pgTable(
  "rooms",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    name: text("name").notNull(),
    capacity: integer("capacity").notNull(),
  },
  (t) => [check("rooms_capacity_positive", sql`${t.capacity} > 0`)],
);

export const reservations = pgTable(
  "reservations",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    roomId: uuid("room_id").notNull().references(() => rooms.id),
    userId: uuid("user_id").notNull(),
    title: text("title").notNull(),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    status: reservationStatus("status").notNull().default("confirmed"),
  },
  (t) => [check("reservations_time_order", sql`${t.startAt} < ${t.endAt}`)],
);
