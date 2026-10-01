# RevType â€” production image. Built ON the VPS by deploy.sh.
#
# Not using `output: "standalone"` on purpose: next.config.ts marks jimp and
# geoip-country as serverExternalPackages because jimp/fonts exports ABSOLUTE
# node_modules paths that output tracing rewrites and breaks. Carrying the
# real node_modules sidesteps that.
#
# Two BuildKit cache mounts make repeat builds fast:
#   /root/.npm        npm's download cache â€” `npm ci` re-runs only when
#                     package-lock.json changes, and then from local cache
#   /app/.next/cache  Next's own build cache â€” Turbopack rebuilds incrementally
# Neither ends up in the image; both persist on the VPS between builds.

FROM node:24-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# ------------------------------------------------------------------ deps
FROM base AS deps
RUN apt-get update && apt-get install -y --no-install-recommends \
      openssl ca-certificates python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY scripts ./scripts
RUN mkdir -p src/generated/prisma
# postinstall â†’ prisma generate â†’ prisma.config.ts â†’ env("DATABASE_URL").
# Generate needs the variable to EXIST, never to connect.
ENV DATABASE_URL="postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder"
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund \
 && npm install --no-save --no-audit --no-fund sharp

# ----------------------------------------------------------------- build
FROM base AS builder
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_APP_NAME=RevType
ARG NEXT_PUBLIC_SENTRY_DSN=
ARG NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0.05
ARG DATABASE_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=$NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE \
    DATABASE_URL=$DATABASE_URL \
    NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=4096"
RUN --mount=type=cache,target=/app/.next/cache \
    npm run build

# ---------------------------------------------------------------- runner
FROM base AS runner
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /app ./
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1
CMD ["npm", "run", "start"]
