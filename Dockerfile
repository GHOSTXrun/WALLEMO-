FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY . .
RUN npm test && npm run build && npm prune --omit=dev --ignore-scripts

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production VELQON_HOST=0.0.0.0 PORT=4188 VELQON_DB_PATH=/data/velqon.sqlite
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/backend ./backend
COPY --from=build --chown=node:node /app/src/domain.js /app/src/editorial.js ./src/
COPY --from=build --chown=node:node /app/server.mjs /app/package.json ./
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 4188
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]
