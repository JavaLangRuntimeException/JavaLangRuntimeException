# syntax=docker/dockerfile:1.7
FROM --platform=$BUILDPLATFORM node:24-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .
ARG VERSION=dev
ENV VITE_APP_VERSION=${VERSION}
# 生成済みの connect-es の型（src/shared/api/gen）を使う（proto は ../backend にあり、コンテキスト外のため）
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.29-alpine
COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=build /src/dist /usr/share/nginx/html
USER 101
EXPOSE 8080
