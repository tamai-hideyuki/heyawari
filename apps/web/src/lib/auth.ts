import { type QueryClient, queryOptions } from "@tanstack/react-query";
import { createAuthClient } from "better-auth/react";

// API は /api の下に転送される。Better Auth のエンドポイントは /api/auth/*
export const authClient = createAuthClient({ baseURL: `${window.location.origin}/api/auth` });

export const sessionQuery = queryOptions({
  queryKey: ["session"],
  queryFn: async () => {
    const { data, error } = await authClient.getSession();
    if (error) throw new Error("ログイン状態を確認できませんでした");
    return data; // ログインしていなければ null
  },
  staleTime: 5 * 60 * 1000,
});

export type SessionUser = NonNullable<Awaited<ReturnType<NonNullable<typeof sessionQuery.queryFn>>>>["user"];

/** Better Auth のエラーコードを画面向けの日本語にする */
export function authErrorMessage(error: { code?: string; message?: string; status?: number }) {
  switch (error.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "メールアドレスまたはパスワードが違います";
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return "このメールアドレスはすでに登録されています";
    case "PASSWORD_TOO_SHORT":
      return "パスワードは 8 文字以上にしてください";
    case "PASSWORD_TOO_LONG":
      return "パスワードが長すぎます";
    case "INVALID_EMAIL":
      return "メールアドレスの形式が正しくありません";
  }
  if (error.status === 429) return "試行回数が多すぎます。しばらくしてからもう一度お試しください";
  return "処理に失敗しました。時間をおいてもう一度お試しください";
}

/** ログイン後の戻り先。外部サイトへ飛ばされないよう、同じサイト内のパスだけを受け付ける */
export function safeRedirect(value: unknown): string | undefined {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : undefined;
}



/** セッション以外のキャッシュ（前のユーザーの予約など）を捨てる */
const removeUserData = (queryClient: QueryClient) =>
  queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== sessionQuery.queryKey[0] });

/**
 * ログイン・新規登録の直後に呼ぶ。
 * セッションのクエリは消さずに取り直す（消すと、ヘッダーなど表示中の画面に変更が届かない）
 */
export async function afterSignIn(queryClient: QueryClient) {
  removeUserData(queryClient);
  await queryClient.fetchQuery({ ...sessionQuery, staleTime: 0 });
}

/** ログアウトの直後、またはセッション切れに気づいたときに呼ぶ */
export function afterSignOut(queryClient: QueryClient) {
  queryClient.setQueryData(sessionQuery.queryKey, null);
  removeUserData(queryClient);
}
