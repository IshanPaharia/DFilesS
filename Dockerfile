FROM node:22-alpine

ARG SERVICE
ENV SERVICE=${SERVICE}

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY services ./services

RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @dfs/shared build
RUN pnpm --filter ${SERVICE} build

CMD ["sh", "-c", "pnpm --filter ${SERVICE} start"]
