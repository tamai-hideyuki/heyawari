import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { createDb, isExclusionViolation, pgErrorCode, reservations, rooms } from "@heyawari/db";

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

export const app = new Hono()
  .onError((err, c) => {
    console.error(err);
    return c.json({ error: "サーバーエラーが発生しました" }, 500);
  })
  .get("/health", (c) => c.json({ ok: true }))
  .get("/rooms", async (c) => {
    const result = await db.select().from(rooms).orderBy(rooms.name);
    return c.json(result);
  })
  .post(
    "/reservations",
    zValidator("json", createReservationSchema, (result, c) => {
      if (!result.success) {
        return c.json(
          {
            error: "入力内容が正しくありません",
            issues: result.error.issues.map((i) => ({
              path: i.path.map(String).join("."),
              message: i.message,
            })),
          },
          400,
        );
      }
    }),
    async (c) => {
      const input = c.req.valid("json");
      try {
        const [created] = await db.insert(reservations).values(input).returning();
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
    },
  );

export type AppType = typeof app;
