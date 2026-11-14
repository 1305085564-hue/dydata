# dydata 生产镜像
# 运行方式：next start，容器内监听 3000；平台对外仍走 80/443。
# 构建期必须注入 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY：
# 这两个值会被 Next 写进前端与中间件产物，运行期再改无效，必须重新构建。

FROM node:22-bookworm-slim AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL} \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}

COPY --from=deps /app/node_modules ./node_modules
COPY . .
# next.config.ts 在启动时仍要读 @next/bundle-analyzer 与 @sentry/nextjs，
# 所以运行阶段保留完整依赖，不做 --omit=dev 裁剪。
# 构建期峰值内存超过 4 GB：构建机至少要给 8 GB，3.8 GB 会被 OOM 杀掉（实测 exit 137）。
RUN npm run build \
 && rm -rf .next/cache .next/dev

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/next.config.ts ./next.config.ts

USER node
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start"]
