import type { AppType } from "@heyawari/api/app";
import { hc } from "hono/client";

export const api = hc<AppType>("/api");
