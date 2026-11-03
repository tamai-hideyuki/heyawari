import { serve } from "@hono/node-server";
import { createDb } from "@heyawari/db";
import { createApp } from "./app.ts";
import { createAuth } from "./auth.ts";

const db = createDb();
const app = createApp({ db, auth: createAuth(db) });

const port = Number(process.env.PORT ?? 8787);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`);
});
