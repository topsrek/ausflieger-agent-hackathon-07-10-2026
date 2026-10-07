# Web app image for InstaCloud. Build context is the repo root because web/
# imports ../planner/src and ../shared at build time.
FROM node:22-slim AS build
WORKDIR /app
COPY shared ./shared
COPY planner/src ./planner/src
COPY data/demo ./data/demo
COPY web/package.json web/package-lock.json ./web/
RUN cd web && npm ci
COPY web ./web
RUN cd web && npx vite build

FROM node:22-slim
WORKDIR /app/web
ENV NODE_ENV=production PORT=8080
COPY --from=build /app/web/dist ./dist
COPY web/server.mjs ./server.mjs
EXPOSE 8080
CMD ["node", "server.mjs"]
