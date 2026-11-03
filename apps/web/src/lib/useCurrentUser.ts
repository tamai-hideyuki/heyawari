import { useSuspenseQuery } from "@tanstack/react-query";
import { sessionQuery } from "./auth.ts";

/** ログイン必須の画面（/_authed の下）でだけ使う。ログインしていない場合はそこで弾かれている */
export function useCurrentUser() {
  const { data } = useSuspenseQuery(sessionQuery);
  if (!data) throw new Error("ログインしていません");
  return data.user;
}
