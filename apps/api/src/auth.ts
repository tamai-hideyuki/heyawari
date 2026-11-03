import { accounts, type Db, sessions, users, verifications } from "@heyawari/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

export type AuthOptions = {
  /** セッションの署名などに使う。本番では BETTER_AUTH_SECRET を必ず設定する */
  secret?: string;
  /** API 自身の URL */
  baseURL?: string;
  /** ログイン画面を置くオリジン。ここ以外から来たリクエストは CSRF 対策で拒否される */
  trustedOrigins?: string[];
};

export function createAuth(db: Db, options: AuthOptions = {}) {
  return betterAuth({
    secret: options.secret ?? process.env.BETTER_AUTH_SECRET,
    baseURL: options.baseURL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:8787",
    // 画面からは /api/auth/* で呼ぶが、Vite（本番ではリバースプロキシ）が /api を外して転送する
    basePath: "/auth",
    trustedOrigins: options.trustedOrigins ?? (process.env.WEB_ORIGIN ?? "http://localhost:5173").split(","),
    database: drizzleAdapter(db, {
      provider: "pg",
      // Better Auth のモデル名（user など）を複数形のテーブル（users など）に対応させる
      usePlural: true,
      schema: { users, sessions, accounts, verifications },
    }),
    // ID は DB 側の uuidv7() に任せる（予約などと同じ形式にするため）
    advanced: { database: { generateId: false } },
    emailAndPassword: { enabled: true, minPasswordLength: 8 },
  });
}

export type Auth = ReturnType<typeof createAuth>;
