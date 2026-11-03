import { Hono } from "hono";
import { createDb, rooms } from "@heyawari/db";

const db = createDb();

export const app = new Hono()
  .get("/health", (c) => c.json({ ok: true }))
  .get("/rooms", async (c) => {
    const result = await db.select().from(rooms).orderBy(rooms.name);
    return c.json(result);
  });

export type AppType = typeof app;
