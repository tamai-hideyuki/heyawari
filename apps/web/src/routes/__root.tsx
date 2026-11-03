import { type QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { afterSignOut, authClient, sessionQuery } from "../lib/auth.ts";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: () => (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/" className="text-lg font-bold">
            heyawari
          </Link>
          <UserMenu />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  ),
});

function UserMenu() {
  const { data: session } = useQuery(sessionQuery);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  if (!session) return null;

  const signOut = async () => {
    await authClient.signOut();
    afterSignOut(queryClient);
    await navigate({ to: "/login" });
  };

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-slate-600">{session.user.name} さん</span>
      <button
        type="button"
        onClick={signOut}
        className="rounded-md border border-slate-300 px-3 py-1 hover:bg-slate-100"
      >
        ログアウト
      </button>
    </div>
  );
}
