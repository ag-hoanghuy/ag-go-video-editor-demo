# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS pnpm-base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable && corepack prepare pnpm@12.6.0 --activate

WORKDIR /app

FROM pnpm-base AS dependencies

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN --mount=type=cache,id=pnpm-api,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @ag-go-video-editor/api...

FROM dependencies AS builder

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api

RUN pnpm --filter @ag-go-video-editor/shared build \
    && pnpm --filter @ag-go-video-editor/api build \
    && pnpm --filter @ag-go-video-editor/api deploy --prod --legacy /prod/api

FROM node:22-bookworm-slim AS runtime

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3001
ENV TMPDIR=/tmp/video-editor

WORKDIR /app

RUN mkdir -p /tmp/video-editor \
    && chown node:node /tmp/video-editor

COPY --from=builder --chown=node:node /prod/api ./

USER node

EXPOSE 3001

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3001/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["node", "dist/main.js"]
