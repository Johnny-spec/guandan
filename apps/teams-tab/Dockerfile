# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/teams-tab/package.json apps/teams-tab/
COPY packages ./packages
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

FROM deps AS build
COPY apps/teams-tab ./apps/teams-tab
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter teams-tab build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /repo/apps/teams-tab/.next/standalone ./
COPY --from=build --chown=app:app /repo/apps/teams-tab/.next/static ./apps/teams-tab/.next/static
COPY --from=build --chown=app:app /repo/apps/teams-tab/public ./apps/teams-tab/public
USER app
EXPOSE 3000
CMD ["node", "apps/teams-tab/server.js"]
