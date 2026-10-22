FROM node:24.19.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=npm-ca \
    if [ -s /run/secrets/npm-ca ]; then npm_config_cafile=/run/secrets/npm-ca npm ci; else npm ci; fi
COPY engine ./engine
RUN npx tsc -p engine/tsconfig.json
FROM node:24.19.0-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=npm-ca \
    if [ -s /run/secrets/npm-ca ]; then npm_config_cafile=/run/secrets/npm-ca npm ci --omit=dev; else npm ci --omit=dev; fi \
    && npm cache clean --force
COPY --from=build /app/dist/engine ./dist/engine
COPY scripts/health.mjs ./scripts/health.mjs
RUN mkdir -p /app/.engine-data && chown -R node:node /app/.engine-data
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD node scripts/health.mjs
CMD ["node", "dist/engine/main.js"]
