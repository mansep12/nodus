# The web app as one container, for hosts other than Vercel.
# Build:  docker build -t nodus --build-arg NEXT_PUBLIC_NODUS_CONTRACT=C... --build-arg NEXT_PUBLIC_TOKEN_CONTRACT=C... .
# Run:    docker run -p 3000:3000 --env-file apps/web/.env.local nodus
FROM oven/bun:1.3 AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/
COPY packages/api/package.json packages/api/
COPY packages/contract-client/package.json packages/contract-client/
COPY packages/db/package.json packages/db/
COPY packages/e2e/package.json packages/e2e/
COPY packages/indexer/package.json packages/indexer/
COPY packages/solver/package.json packages/solver/
COPY packages/stellar/package.json packages/stellar/
RUN bun install --frozen-lockfile

FROM node:24-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_NODUS_CONTRACT
ARG NEXT_PUBLIC_TOKEN_CONTRACT
ARG NEXT_PUBLIC_ALLOWLIST_POLICY
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_OUTPUT=standalone NEXT_TELEMETRY_DISABLED=1
RUN cd apps/web && node node_modules/next/dist/bin/next build

FROM node:24-slim AS run
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
COPY --from=build /app/packages/db/migrations ./packages/db/migrations
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
