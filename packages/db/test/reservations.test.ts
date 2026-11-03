import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import { eq } from "drizzle-orm";
import {
  cancelReservation,
  createReservation,
  type Db,
  findConfirmedReservations,
  isExclusionViolation,
  pgErrorCode,
  reservations,
} from "../src/index.ts";
import { closeTestDb, insertRoom, insertUser, resetTestDb, setupTestDb } from "../src/testing.ts";

const at = (hhmm: string, day = "2026-11-10") => new Date(`${day}T${hhmm}:00+09:00`);

let db: Db;
let roomId: string;
let userId: string;

before(async () => {
  db = await setupTestDb();
});
after(() => closeTestDb(db));
beforeEach(async () => {
  await resetTestDb(db);
  roomId = (await insertRoom(db)).id;
  userId = (await insertUser(db, { name: "予約太郎" })).id;
});

const book = (start: string, end: string, opts: { roomId?: string; title?: string } = {}) =>
  createReservation(db, {
    roomId: opts.roomId ?? roomId,
    userId,
    title: opts.title ?? "会議",
    startAt: at(start),
    endAt: at(end),
  });

/** 排他制約違反（23P01）で失敗することを確かめる */
const cancel = (id: string) => cancelReservation(db, { id, userId });

const rejectsAsOverlap = (p: Promise<unknown>) => assert.rejects(p, (err) => isExclusionViolation(err));

describe("排他制約 reservations_no_overlap", () => {
  test("同じ会議室で時間が重なる予約は入らない", async () => {
    await book("10:00", "11:00");
    await rejectsAsOverlap(book("10:30", "11:30")); // 後ろが重なる
    await rejectsAsOverlap(book("09:30", "10:30")); // 前が重なる
    await rejectsAsOverlap(book("10:15", "10:45")); // 内側に収まる
    await rejectsAsOverlap(book("09:00", "12:00")); // 外側から包む
    await rejectsAsOverlap(book("10:00", "11:00")); // まったく同じ
  });

  test("半開区間 [) なので、終了時刻と開始時刻が同じなら続けて予約できる", async () => {
    await book("10:00", "11:00");
    await book("11:00", "12:00");
    await book("09:00", "10:00");
    const rows = await db.select().from(reservations);
    assert.equal(rows.length, 3);
  });

  test("別の会議室なら同じ時間帯でも予約できる", async () => {
    const other = await insertRoom(db, { name: "会議室B" });
    await book("10:00", "11:00");
    await book("10:00", "11:00", { roomId: other.id });
  });

  test("キャンセル済みの予約は重複の判定から外れる", async () => {
    const first = await book("10:00", "11:00");
    await cancel(first!.id);
    await book("10:00", "11:00");
  });

  test("キャンセル済みの予約を確定に戻そうとして重なる場合も防ぐ", async () => {
    const first = await book("10:00", "11:00");
    await cancel(first!.id);
    await book("10:30", "11:30");
    await rejectsAsOverlap(
      db.update(reservations).set({ status: "confirmed" }).where(eq(reservations.id, first!.id)),
    );
  });

  test("同時に同じ枠を予約しても、成功するのは 1 件だけ", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) => book("10:00", "11:00", { title: `同時 ${i}` })),
    );
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 9);
    for (const r of rejected) assert.ok(isExclusionViolation(r.reason));
  });
});

describe("その他の制約", () => {
  test("開始時刻が終了時刻より後の予約は入らない（CHECK 違反 23514）", async () => {
    await assert.rejects(book("11:00", "10:00"), (err) => pgErrorCode(err) === "23514");
    await assert.rejects(book("10:00", "10:00"), (err) => pgErrorCode(err) === "23514");
  });

  test("存在しないユーザーの予約は入らない（外部キー違反 23503）", async () => {
    await assert.rejects(
      createReservation(db, {
        roomId,
        userId: "00000000-0000-4000-8000-0000000000ff",
        title: "会議",
        startAt: at("10:00"),
        endAt: at("11:00"),
      }),
      (err) => pgErrorCode(err) === "23503",
    );
  });

  test("存在しない会議室には予約できない（外部キー違反 23503）", async () => {
    await assert.rejects(
      book("10:00", "11:00", { roomId: "00000000-0000-4000-8000-0000000000ff" }),
      (err) => pgErrorCode(err) === "23503",
    );
  });

  test("定員は 1 以上でなければならない", async () => {
    await assert.rejects(insertRoom(db, { capacity: 0 }), (err) => pgErrorCode(err) === "23514");
  });
});

describe("findConfirmedReservations", () => {
  test("期間と重なる確定済みの予約だけを、開始時刻の順に返す", async () => {
    await book("13:00", "14:00", { title: "午後" });
    await book("09:00", "10:00", { title: "朝" });
    const cancelled = await book("11:00", "12:00", { title: "キャンセル済み" });
    await cancel(cancelled!.id);
    await book("17:00", "18:00", { title: "範囲外" });

    const rows = await findConfirmedReservations(db, { roomId, from: at("09:30"), to: at("16:00") });
    assert.deepEqual(
      rows.map((r) => r.title),
      ["朝", "午後"],
    );
  });

  test("予約者の名前を付けて返す", async () => {
    await book("10:00", "11:00");
    const [row] = await findConfirmedReservations(db, { roomId, from: at("00:00"), to: at("23:00") });
    assert.equal(row?.userName, "予約太郎");
    assert.equal(row?.userId, userId);
  });

  test("期間の境界にちょうど接するだけの予約は含めない", async () => {
    await book("09:00", "10:00", { title: "直前" });
    await book("12:00", "13:00", { title: "直後" });
    await book("10:00", "10:30", { title: "先頭" });
    const rows = await findConfirmedReservations(db, { roomId, from: at("10:00"), to: at("12:00") });
    assert.deepEqual(
      rows.map((r) => r.title),
      ["先頭"],
    );
  });

  test("日付をまたぐ予約も、重なっている日の検索で見つかる", async () => {
    await createReservation(db, {
      roomId,
      userId,
      title: "夜通し",
      startAt: at("22:00", "2026-11-09"),
      endAt: at("08:00", "2026-11-10"),
    });
    const rows = await findConfirmedReservations(db, { roomId, from: at("00:00"), to: at("00:00", "2026-11-11") });
    assert.deepEqual(
      rows.map((r) => r.title),
      ["夜通し"],
    );
  });

  test("roomId を省くと全会議室が対象になる", async () => {
    const other = await insertRoom(db, { name: "会議室B" });
    await book("10:00", "11:00", { title: "A" });
    await book("10:00", "11:00", { roomId: other.id, title: "B" });

    const one = await findConfirmedReservations(db, { roomId, from: at("00:00"), to: at("23:00") });
    const all = await findConfirmedReservations(db, { from: at("00:00"), to: at("23:00") });
    assert.deepEqual(one.map((r) => r.title), ["A"]);
    assert.deepEqual(all.map((r) => r.title).sort(), ["A", "B"]);
  });
});

describe("cancelReservation", () => {
  test("何度呼んでも同じ結果になる", async () => {
    const r = await book("10:00", "11:00");
    for (let i = 0; i < 2; i++) {
      const result = await cancel(r!.id);
      assert.ok(result.ok);
      assert.equal(result.reservation.status, "cancelled");
    }
  });

  test("他の人の予約はキャンセルできず、状態も変わらない", async () => {
    const r = await book("10:00", "11:00");
    const other = await insertUser(db, { name: "別の人" });
    assert.deepEqual(await cancelReservation(db, { id: r!.id, userId: other.id }), {
      ok: false,
      reason: "forbidden",
    });
    const [row] = await db.select().from(reservations).where(eq(reservations.id, r!.id));
    assert.equal(row?.status, "confirmed");
  });

  test("存在しない予約なら not_found", async () => {
    assert.deepEqual(await cancel("00000000-0000-4000-8000-0000000000ff"), {
      ok: false,
      reason: "not_found",
    });
  });
});
