import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// 開発中は API（Connect の RPC と /api/*）を kind の Gateway へ送る。Host は確認用のホスト名にする
const gateway = process.env.GATEWAY_URL ?? "http://192.168.97.7";
const proxy = { target: gateway, changeOrigin: false, headers: { host: "next.taramanji.com" } };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    proxy: {
      "^/taramanji\\.": proxy,
      "/api": proxy,
    },
  },
  build: {
    sourcemap: true,
  },
});
