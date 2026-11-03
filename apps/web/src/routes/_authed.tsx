import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { sessionQuery } from "../lib/auth.ts";

/** この下のページはログインが必要。ログインしていなければ、戻り先を付けてログイン画面へ送る */
export const Route = createFileRoute("/_authed")({
  beforeLoad: async ({ context, location }) => {
    const session = await context.queryClient.ensureQueryData(sessionQuery);
    if (!session) throw redirect({ to: "/login", search: { redirect: location.href } });
  },
  component: Outlet,
});
