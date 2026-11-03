import { Hono } from "hono";
import { z } from "zod";
import {
  cancelReservation,
  createDb,
  createReservation,
  findConfirmedReservations,
  isExclusionViolation,
  listRooms,
  pgErrorCode,
} from "@heyawari/db";
import { validate } from "./validator.ts";

z.config(z.locales.ja());
const db = createDb();

const isoWithOffset = z.iso.datetime({ offset: true }).transform((s) => new Date(s));

const createReservationSchema = z
  .object({
    roomId: z.uuid(),
    userId: z.uuid(), // TODO: 認証導入時にセッションから取得する
    title: z.string().trim().min(1).max(100),
    startAt: isoWithOffset,
    endAt: isoWithOffset,
  })
  .refine((v) => v.startAt < v.endAt, {
    path: ["endAt"],
    error: "endAt は startAt より後にしてください",
  });

const listQuerySchema = z
  .object({ from: isoWithOffset, to: isoWithOffset })
  .refine((v) => v.from < v.to, { path: ["to"], error: "to は from より後にしてください" });

const roomParamSchema = z.object({ roomId: z.uuid() });
const idParamSchema = z.object({ id: z.uuid() });

export const app = new Hono()
  .onError((err, c) => {
    console.error(err);
    return c.json({ error: "サーバーエラーが発生しました" }, 500);
  })
  .notFound((c) => c.json({ error: "指定されたURLは存在しません" }, 404))
  .get("/health", (c) => c.json({ ok: true }))
  .get("/rooms", async (c) => c.json(await listRooms(db)))
  .get(
    "/rooms/:roomId/reservations",
    validate("param", roomParamSchema),
    validate("query", listQuerySchema),
    async (c) => {
      const { roomId } = c.req.valid("param");
      const { from, to } = c.req.valid("query");
      return c.json(await findConfirmedReservations(db, { roomId, from, to }));
    },
  )
  .post("/reservations", validate("json", createReservationSchema), async (c) => {
    try {
      const created = await createReservation(db, c.req.valid("json"));
      return c.json(created, 201);
    } catch (err) {
      if (isExclusionViolation(err)) {
        return c.json({ error: "この時間帯はすでに予約されています" }, 409);
      }
      if (pgErrorCode(err) === "23503") {
        return c.json({ error: "会議室が見つかりません" }, 404);
      }
      throw err;
    }
  })
  .post("/reservations/:id/cancel", validate("param", idParamSchema), async (c) => {
    // TODO: 認証導入後、予約した本人だけがキャンセルできるようにする
    const cancelled = await cancelReservation(db, c.req.valid("param").id);
    if (!cancelled) return c.json({ error: "予約が見つかりません" }, 404);
    return c.json(cancelled);
  });

export type AppType = typeof app;
