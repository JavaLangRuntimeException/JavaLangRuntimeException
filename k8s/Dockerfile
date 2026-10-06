# taramanji.com（Next.js）をオンプレの k8s で動かすイメージ。portfolio と calendar-sync の両方で使う
# ビルド（リポジトリのルートで）:
#   docker build -f k8s/Dockerfile -t taramanji-web:local --build-arg NEXT_PUBLIC_BEARER_TOKEN=<Qiita トークン> .
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
# NEXT_PUBLIC_* はビルド時に埋め込まれるので実行時の env では変えられない（/blogs の Qiita API 用）
ARG NEXT_PUBLIC_BEARER_TOKEN=
ENV NEXT_PUBLIC_BEARER_TOKEN=$NEXT_PUBLIC_BEARER_TOKEN
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT_STANDALONE=1
RUN pnpm build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
