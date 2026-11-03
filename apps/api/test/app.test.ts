import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import type { Db } from "@heyawari/db";
import { closeTestDb, insertRoom, resetTestDb, setupTestDb } from "@heyawari/db/testing";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";

const MISSING_ID = "00000000-0000-4000-8000-0000000000ff";
const WEB_ORIGIN = "http://localhost:5173";
const PASSWORD = "correct-horse-battery";

let db: Db;
let app: ReturnType<typeof createApp>;
let roomId: string;

type Login = { userId: string; cookie: string };
/** 各テストの前にサインアップしておくユーザー。特に指定しなければ alice としてリクエストする */
let alice: Login;

before(async () => {
  db = await setupTestDb();
  const auth = createAuth(db, {
    secret: "test-secret-test-secret-test-secret",
    baseURL: "http://localhost",
    trustedOrigins: [WEB_ORIGIN],
  });
  app = createApp({ db, auth });
});
after(() => closeTestDb(db));
beforeEach(async () => {
  await resetTestDb(db);
  roomId = (await insertRoom(db, { name: "会議室A", capacity: 8 })).id;
  alice = await signUp("アリス");
});

/** 画面と同じオリジンから送ったことにして、ログイン中ならセッションの Cookie を付ける */
const req = async (path: string, init: RequestInit = {}, as: Login | null = alice) => {
  const headers = new Headers(init.headers);
  headers.set("origin", WEB_ORIGIN);
  if (as) headers.set("cookie", as.cookie);
  return app.request(path, { ...init, headers });
};

const cookieOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");

async function signUp(name: string, email = `${crypto.randomUUID()}@example.com`): Promise<Login> {
  const res = await postJson("/auth/sign-up/email", { name, email, password: PASSWORD }, null);
  assert.equal(res.status, 200, await res.clone().text());
  const body = (await res.json()) as { user: { id: string } };
  return { userId: body.user.id, cookie: cookieOf(res) };
}

const postJson = (path: string, body: unknown, as: Login | null = alice) =>
  req(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, as);

const reserve = (overrides: Record<string, unknown> = {}, as: Login = alice) =>
  postJson(
    "/reservations",
    {
    roomId,
    title: "定例",
    startAt: "2026-11-10T10:00:00+09:00",
    endAt: "2026-11-10T11:00:00+09:00",
    ...overrides,
    },
    as,
  );

const dayQuery = "from=2026-11-10T00:00:00%2B09:00&to=2026-11-11T00:00:00%2B09:00";

/** 400 の本文から、どの項目がエラーになったかを取り出す */
async function issuePaths(res: Response) {
  const body = (await res.json()) as { error: string; issues: { path: string; message: string }[] };
  assert.equal(body.error, "入力内容が正しくありません");
  return body.issues.map((i) => i.path);
}

describe("GET /health, 存在しない URL", () => {
  test("/health は ok を返す", async () => {
    const res = await app.request("/health");
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  });

  test("存在しない URL は JSON の 404 を返す", async () => {
    const res = await app.request("/nope");
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: "指定されたURLは存在しません" });
  });
});

describe("GET /rooms", () => {
  test("会議室を名前の順に返す", async () => {
    await insertRoom(db, { name: "大会議室", capacity: 20 });
    await insertRoom(db, { name: "会議室B", capacity: 4 });
    const res = await req("/rooms");
    assert.equal(res.status, 200);
    const rooms = (await res.json()) as { name: string }[];
    assert.deepEqual(
      rooms.map((r) => r.name),
      ["会議室A", "会議室B", "大会議室"],
    );
  });
});

describe("POST /reservations", () => {
  test("予約を作ると 201 と作成した予約を返す", async () => {
    const res = await reserve();
    assert.equal(res.status, 201);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.roomId, roomId);
    assert.equal(body.title, "定例");
    assert.equal(body.status, "confirmed");
    assert.equal(body.userId, alice.userId);
    // タイムゾーンのずれ付きで受け取った時刻を、UTC で保存・返却している
    assert.equal(body.startAt, "2026-11-10T01:00:00.000Z");
    assert.equal(body.endAt, "2026-11-10T02:00:00.000Z");
  });

  test("タイトルの前後の空白は取り除く", async () => {
    const res = await reserve({ title: "  定例  " });
    assert.equal(((await res.json()) as { title: string }).title, "定例");
  });

  test("時間が重なると 409 を返す", async () => {
    assert.equal((await reserve()).status, 201);
    const res = await reserve({ startAt: "2026-11-10T10:30:00+09:00", endAt: "2026-11-10T11:30:00+09:00" });
    assert.equal(res.status, 409);
    assert.deepEqual(await res.json(), { error: "この時間帯はすでに予約されています" });
  });

  test("別のタイムゾーン表記でも、同じ時刻なら重複と判定する", async () => {
    assert.equal((await reserve()).status, 201);
    const res = await reserve({ startAt: "2026-11-10T01:30:00Z", endAt: "2026-11-10T02:30:00Z" });
    assert.equal(res.status, 409);
  });

  test("続けての予約（前の予約の終了時刻に開始）は 201", async () => {
    assert.equal((await reserve()).status, 201);
    const res = await reserve({ startAt: "2026-11-10T11:00:00+09:00", endAt: "2026-11-10T12:00:00+09:00" });
    assert.equal(res.status, 201);
  });

  test("同時に同じ枠へ送っても、201 は 1 件だけで残りは 409", async () => {
    const statuses = await Promise.all(Array.from({ length: 5 }, () => reserve().then((r) => r.status)));
    assert.deepEqual(statuses.sort(), [201, 409, 409, 409, 409]);
  });

  test("存在しない会議室は 404", async () => {
    const res = await reserve({ roomId: MISSING_ID });
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: "会議室が見つかりません" });
  });

  test("終了時刻が開始時刻以前なら 400", async () => {
    const res = await reserve({ endAt: "2026-11-10T10:00:00+09:00" });
    assert.equal(res.status, 400);
    assert.deepEqual(await issuePaths(res), ["endAt"]);
  });

  test("タイムゾーンのずれが無い日時は 400 で、その項目のエラーだけを返す", async () => {
    // 不正な項目があるときに「endAt は startAt より後に」まで出ていた不具合の回帰テスト
    const res = await reserve({ startAt: "2026-11-10T10:00:00" });
    assert.equal(res.status, 400);
    assert.deepEqual(await issuePaths(res), ["startAt"]);
  });

  test("from が不正なときも、to のエラーは足さない", async () => {
    const res = await req("/reservations?from=2026-11-10&to=2026-11-11T00:00:00%2B09:00");
    assert.equal(res.status, 400);
    assert.deepEqual(await issuePaths(res), ["from"]);
  });

  test("タイトルが空、または 101 文字以上なら 400", async () => {
    for (const title of ["", "   ", "あ".repeat(101)]) {
      const res = await reserve({ title });
      assert.equal(res.status, 400, `title=${JSON.stringify(title)}`);
      assert.deepEqual(await issuePaths(res), ["title"]);
    }
    assert.equal((await reserve({ title: "あ".repeat(100) })).status, 201);
  });

  test("必須項目が無い、UUID でない場合は 400 で、エラーは日本語", async () => {
    const res = await postJson("/reservations", { roomId: "abc" });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { issues: { path: string; message: string }[] };
    assert.deepEqual(body.issues.map((i) => i.path).sort(), ["endAt", "roomId", "startAt", "title"]);
    for (const issue of body.issues) assert.match(issue.message, /[ぁ-んァ-ヶ一-龠]/, issue.message);
  });
});

describe("GET /rooms/:roomId/reservations と GET /reservations", () => {
  beforeEach(async () => {
    const roomB = await insertRoom(db, { name: "会議室B" });
    await reserve({ title: "A 朝", startAt: "2026-11-10T09:00:00+09:00", endAt: "2026-11-10T10:00:00+09:00" });
    await reserve({ title: "A 翌日", startAt: "2026-11-11T09:00:00+09:00", endAt: "2026-11-11T10:00:00+09:00" });
    await reserve({ roomId: roomB.id, title: "B 昼", startAt: "2026-11-10T12:00:00+09:00", endAt: "2026-11-10T13:00:00+09:00" });
    const cancelled = (await (
      await reserve({ title: "A キャンセル", startAt: "2026-11-10T15:00:00+09:00", endAt: "2026-11-10T16:00:00+09:00" })
    ).json()) as { id: string };
    await req(`/reservations/${cancelled.id}/cancel`, { method: "POST" });
  });

  const titles = async (res: Response) => ((await res.json()) as { title: string }[]).map((r) => r.title);

  test("予約者の名前も返す", async () => {
    const res = await req(`/reservations?${dayQuery}`);
    const rows = (await res.json()) as { userId: string; userName: string }[];
    assert.ok(rows.length > 0);
    for (const r of rows) {
      assert.equal(r.userId, alice.userId);
      assert.equal(r.userName, "アリス");
    }
  });

  test("会議室ごと：その会議室の、期間内の確定済み予約だけを返す", async () => {
    const res = await req(`/rooms/${roomId}/reservations?${dayQuery}`);
    assert.equal(res.status, 200);
    assert.deepEqual(await titles(res), ["A 朝"]);
  });

  test("全会議室：期間内の確定済み予約を、開始時刻の順に返す", async () => {
    const res = await req(`/reservations?${dayQuery}`);
    assert.equal(res.status, 200);
    assert.deepEqual(await titles(res), ["A 朝", "B 昼"]);
  });

  test("from / to が無い、または to が from 以前なら 400", async () => {
    assert.equal((await req("/reservations")).status, 400);
    const res = await req(
      "/reservations?from=2026-11-10T10:00:00%2B09:00&to=2026-11-10T10:00:00%2B09:00",
    );
    assert.equal(res.status, 400);
    assert.deepEqual(await issuePaths(res), ["to"]);
  });

  test("roomId が UUID でなければ 400", async () => {
    assert.equal((await req(`/rooms/abc/reservations?${dayQuery}`)).status, 400);
  });
});

describe("POST /reservations/:id/cancel", () => {
  test("キャンセルすると status が cancelled になり、同じ枠をまた予約できる", async () => {
    const created = (await (await reserve()).json()) as { id: string };
    const res = await req(`/reservations/${created.id}/cancel`, { method: "POST" });
    assert.equal(res.status, 200);
    assert.equal(((await res.json()) as { status: string }).status, "cancelled");
    assert.equal((await reserve()).status, 201);
  });

  test("2 回目のキャンセルも 200（何度呼んでも同じ結果）", async () => {
    const created = (await (await reserve()).json()) as { id: string };
    await req(`/reservations/${created.id}/cancel`, { method: "POST" });
    const res = await req(`/reservations/${created.id}/cancel`, { method: "POST" });
    assert.equal(res.status, 200);
  });

  test("他の人の予約は 403 で、キャンセルされない", async () => {
    const created = (await (await reserve()).json()) as { id: string };
    const bob = await signUp("ボブ");
    const res = await req(`/reservations/${created.id}/cancel`, { method: "POST" }, bob);
    assert.equal(res.status, 403);
    assert.deepEqual(await res.json(), { error: "自分の予約だけキャンセルできます" });
    // 同じ枠はまだ埋まっている
    assert.equal((await reserve({}, bob)).status, 409);
  });

  test("存在しない予約は 404、UUID でなければ 400", async () => {
    const missing = await req(`/reservations/${MISSING_ID}/cancel`, { method: "POST" });
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { error: "予約が見つかりません" });
    assert.equal((await req("/reservations/abc/cancel", { method: "POST" })).status, 400);
  });
});

describe("想定外のエラー", () => {
  test("DB に接続できないときは、詳細を隠して 500 を返す", async (t) => {
    t.mock.method(console, "error", () => {});
    const broken = createApp({
      db: {
        select: () => {
          throw new Error("connection refused");
        },
      } as unknown as Db,
      auth: { api: { getSession: async () => ({ user: { id: alice.userId } }) } } as never,
    });
    const res = await broken.request("/rooms");
    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), { error: "サーバーエラーが発生しました" });
  });
});

describe("認証", () => {
  test("ログインしていなければ、/health 以外の API は 401", async () => {
    const cases: [string, RequestInit?][] = [
      ["/rooms"],
      [`/reservations?${dayQuery}`],
      [`/rooms/${roomId}/reservations?${dayQuery}`],
      ["/reservations", { method: "POST" }],
      [`/reservations/${MISSING_ID}/cancel`, { method: "POST" }],
    ];
    for (const [path, init] of cases) {
      const res = await req(path, init, null);
      assert.equal(res.status, 401, path);
      assert.deepEqual(await res.json(), { error: "ログインしてください" });
    }
    assert.equal((await req("/health", {}, null)).status, 200);
  });

  test("予約者は送られてきた userId ではなく、ログイン中のユーザーになる", async () => {
    const bob = await signUp("ボブ");
    const res = await reserve({ userId: bob.userId });
    assert.equal(res.status, 201);
    assert.equal(((await res.json()) as { userId: string }).userId, alice.userId);
  });

  test("ログインするとセッションの Cookie が発行され、ログアウトすると使えなくなる", async () => {
    const email = "carol@example.com";
    await signUp("キャロル", email);

    const signIn = await postJson("/auth/sign-in/email", { email, password: PASSWORD }, null);
    assert.equal(signIn.status, 200);
    const carol = { userId: "", cookie: cookieOf(signIn) };
    assert.equal((await req("/rooms", {}, carol)).status, 200);

    const session = (await (await req("/auth/get-session", {}, carol)).json()) as { user: { name: string } };
    assert.equal(session.user.name, "キャロル");

    assert.equal((await req("/auth/sign-out", { method: "POST" }, carol)).status, 200);
    assert.equal((await req("/rooms", {}, carol)).status, 401);
  });

  test("パスワードが違えばログインできない", async () => {
    const email = "dave@example.com";
    await signUp("デイブ", email);
    const res = await postJson("/auth/sign-in/email", { email, password: "wrong-password" }, null);
    assert.equal(res.status, 401);
    assert.equal(res.headers.getSetCookie().length, 0);
  });

  test("同じメールアドレスでは 2 回サインアップできない", async () => {
    await signUp("イブ", "eve@example.com");
    const res = await postJson("/auth/sign-up/email", { name: "偽イブ", email: "eve@example.com", password: PASSWORD }, null);
    assert.equal(res.status, 422);
  });

  test("8 文字未満のパスワードではサインアップできない", async () => {
    const res = await postJson("/auth/sign-up/email", { name: "短い", email: "short@example.com", password: "1234567" }, null);
    assert.equal(res.status, 400);
  });

  test("信頼していないオリジンからのログインは拒否する（CSRF 対策）", async () => {
    const res = await app.request("/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://evil.example", cookie: alice.cookie },
      body: JSON.stringify({ email: "x@example.com", password: PASSWORD }),
    });
    assert.equal(res.status, 403);
  });
});
