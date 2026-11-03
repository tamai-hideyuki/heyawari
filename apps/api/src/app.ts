import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { z } from "zod";
import {
  cancelReservation,
  createReservation,
  type Db,
  findConfirmedReservations,
  isExclusionViolation,
  listRooms,
  pgErrorCode,
} from "@heyawari/db";
import type { Auth } from "./auth.ts";
import { validate } from "./validator.ts";

z.config(z.locales.ja());

const isoWithOffset = z.iso.datetime({ offset: true }).transform((s) => new Date(s));

// zod v4 は、項目のどれかが不正でもオブジェクトの refine を実行する。
// 日時の変換前の文字列を比べて的外れなエラーを足さないよう、全項目が正しいときだけ前後関係を確かめる
const whenFieldsValid = { when: (payload: { issues: unknown[] }) => payload.issues.length === 0 };

const createReservationSchema = z
  .object({
    roomId: z.uuid(),
    title: z.string().trim().min(1).max(100),
    startAt: isoWithOffset,
    endAt: isoWithOffset,
  })
  .refine((v) => v.startAt < v.endAt, {
    path: ["endAt"],
    error: "endAt は startAt より後にしてください",
    ...whenFieldsValid,
  });

const listQuerySchema = z
  .object({ from: isoWithOffset, to: isoWithOffset })
  .refine((v) => v.from < v.to, { path: ["to"], error: "to は from より後にしてください", ...whenFieldsValid });

const roomParamSchema = z.object({ roomId: z.uuid() });
const idParamSchema = z.object({ id: z.uuid() });

type User = Auth["$Infer"]["Session"]["user"];

/** DB と認証を外から受け取る（本番は index.ts、テストではテスト用のものを渡す） */
export const createApp = ({ db, auth }: { db: Db; auth: Auth }) => {
  /** ログインしていなければ 401。ログイン中のユーザーは c.var.user で取れる */
  const requireUser = createMiddleware<{ Variables: { user: User } }>(async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "ログインしてください" }, 401);
    c.set("user", session.user);
    await next();
  });

  return new Hono()
    .onError((err, c) => {
      console.error(err);
      return c.json({ error: "サーバーエラーが発生しました" }, 500);
    })
    .notFound((c) => c.json({ error: "指定されたURLは存在しません" }, 404))
    .get("/health", (c) => c.json({ ok: true }))
    // サインアップ・ログイン・ログアウト・セッション取得など（Better Auth）
    .on(["GET", "POST"], "/auth/*", (c) => auth.handler(c.req.raw))
    .get("/rooms", requireUser, async (c) => c.json(await listRooms(db)))
    .get(
      "/rooms/:roomId/reservations",
      requireUser,
      validate("param", roomParamSchema),
      validate("query", listQuerySchema),
      async (c) => {
        const { roomId } = c.req.valid("param");
        const { from, to } = c.req.valid("query");
        return c.json(await findConfirmedReservations(db, { roomId, from, to }));
      },
    )
    .get("/reservations", requireUser, validate("query", listQuerySchema), async (c) => {
      const { from, to } = c.req.valid("query");
      return c.json(await findConfirmedReservations(db, { from, to }));
    })
    .post("/reservations", requireUser, validate("json", createReservationSchema), async (c) => {
      try {
        // 予約者は送られてきた値ではなく、ログイン中のユーザーにする
        const created = await createReservation(db, { ...c.req.valid("json"), userId: c.var.user.id });
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
    .post("/reservations/:id/cancel", requireUser, validate("param", idParamSchema), async (c) => {
      const result = await cancelReservation(db, { id: c.req.valid("param").id, userId: c.var.user.id });
      if (result.ok) return c.json(result.reservation);
      if (result.reason === "forbidden") {
        return c.json({ error: "自分の予約だけキャンセルできます" }, 403);
      }
      return c.json({ error: "予約が見つかりません" }, 404);
    });
};

export type AppType = ReturnType<typeof createApp>;
