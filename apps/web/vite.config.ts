import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), react(), tailwindcss()],
  server: {
    // 開発中は /api を Hono（既定は localhost:8787、API_URL で変更可）に転送する。同じオリジンになるので CORS 設定は不要
    proxy: {
      "/api": {
        target: process.env.API_URL ?? "http://localhost:8787",
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
