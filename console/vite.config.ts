import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// 開発中は Connect の RPC（/taramanji.cloud.*）を API へ送る。
// 本番の API は Cloudflare Access の後ろにあり、Access の JWT がないと unauthenticated になる。
// 手元で画面だけ確かめるときは、GATEWAY_URL にモックの API（既定 http://localhost:8080）を指定する
const gateway = process.env.GATEWAY_URL ?? "http://localhost:8080";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    proxy: {
      "^/taramanji\\.cloud\\.": { target: gateway, changeOrigin: false },
    },
  },
  build: {
    sourcemap: true,
  },
});
