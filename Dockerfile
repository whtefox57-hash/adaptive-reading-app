FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build
RUN mkdir -p /app/.runtime && chown -R node:node /app
USER node
ENV NODE_USE_ENV_PROXY=1 NODE_ENV=production DATABASE_PATH=/app/.runtime/reading.sqlite PORT=3000
EXPOSE 3000
CMD ["node", "node_modules/tsx/dist/cli.mjs", "server/index.ts"]
