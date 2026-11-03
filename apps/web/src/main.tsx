import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { afterSignOut } from "./lib/auth.ts";
import { isUnauthorized } from "./lib/errors.ts";
import { routeTree } from "./routeTree.gen.ts";

// Temporal に未対応のブラウザだけ polyfill を読み込む
if (!("Temporal" in globalThis)) await import("temporal-polyfill/global");

// セッションが切れて API が 401 を返したら、今のページを戻り先にしてログイン画面へ送る
const onError = (err: unknown) => {
  if (!isUnauthorized(err)) return;
  afterSignOut(queryClient);
  if (router.state.location.pathname !== "/login") {
    void router.navigate({ to: "/login", search: { redirect: router.state.location.href } });
  }
};
const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
});
const router = createRouter({ routeTree, context: { queryClient } });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
