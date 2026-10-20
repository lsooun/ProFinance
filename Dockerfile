# ===== 构建阶段 =====
FROM node:22-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# ===== 运行阶段 =====
FROM node:22-slim AS runtime

ENV NODE_ENV=production \
    PF_HOST=0.0.0.0 \
    PF_PORT=8787 \
    PF_DB_PATH=/app/data/profinance.db \
    PF_UPLOAD_DIR=/app/data/uploads

WORKDIR /app

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/dist ./dist
COPY --from=build /app/server/app.mjs /app/server/db.mjs /app/server/index.mjs ./server/

RUN mkdir -p /app/data \
    && chown -R node:node /app/data /app/server /app/dist /app/package.json

USER node

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8787/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

STOPSIGNAL SIGTERM

CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.mjs"]
