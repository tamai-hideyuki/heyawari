import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { afterSignIn, authClient, authErrorMessage, safeRedirect, sessionQuery } from "../lib/auth.ts";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: safeRedirect(search.redirect),
  }),
  // ログイン済みなら、この画面は飛ばす
  beforeLoad: async ({ context, search }) => {
    const session = await context.queryClient.ensureQueryData(sessionQuery);
    if (session) throw redirect({ href: search.redirect ?? "/" });
  },
  component: LoginPage,
});

function LoginPage() {
  const { redirect: back } = Route.useSearch();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(undefined);
    const { error } =
      mode === "signIn"
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ name: name.trim(), email, password });
    if (error) {
      setError(authErrorMessage(error));
      setPending(false);
      return;
    }
    await afterSignIn(queryClient);
    router.history.push(back ?? "/");
  };

  const input = "w-full rounded-md border border-slate-300 px-3 py-2";
  const isSignUp = mode === "signUp";

  return (
    <section className="mx-auto mt-8 max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5 grid grid-cols-2 rounded-md bg-slate-100 p-1 text-sm" role="tablist">
        {(["signIn", "signUp"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m);
              setError(undefined);
            }}
            className={`rounded px-3 py-1.5 ${mode === m ? "bg-white font-medium shadow-sm" : "text-slate-500"}`}
          >
            {m === "signIn" ? "ログイン" : "新規登録"}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-4">
        {isSignUp && (
          <label className="block space-y-1">
            <span className="text-sm font-medium">名前</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={50}
              autoComplete="name"
              placeholder="予約に表示されます"
              className={input}
            />
          </label>
        )}
        <label className="block space-y-1">
          <span className="text-sm font-medium">メールアドレス</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className={input}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">パスワード</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={isSignUp ? 8 : undefined}
            autoComplete={isSignUp ? "new-password" : "current-password"}
            className={input}
          />
          {isSignUp && <span className="text-xs text-slate-500">8 文字以上</span>}
        </label>

        {error && (
          <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-sky-600 px-4 py-2 font-medium text-white hover:bg-sky-700 disabled:opacity-50"
        >
          {pending ? "送信中…" : isSignUp ? "登録してログイン" : "ログイン"}
        </button>
      </form>
    </section>
  );
}
