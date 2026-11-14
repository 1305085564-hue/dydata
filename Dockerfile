# DYData 独立部署镜像（腾讯云 CloudBase 云托管）
# 构建：docker build -t dydata-web .
# 运行：docker run -p 3000:3000 --env-file <服务端密钥> dydata-web
# 说明：
#   1. 依赖 .next/standalone 产物，next.config.ts 中 output 需为 "standalone"。
#   2. 构建期公开变量（Next 的 NEXT_PUBLIC_*）必须在构建时写入，运行时再补无效。
#      它们取自仓库内 production.env，构建时落到 .env.production 由 Next 自动加载。
#      不要用 ARG/ENV 声明这些变量：空值会覆盖 .env.production，导致静默失效。
#   3. 服务端密钥（数据库管理密钥、COS、AI、OCR 等）不进镜像，由云托管环境变量注入。

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
COPY production.env ./.env.production
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
