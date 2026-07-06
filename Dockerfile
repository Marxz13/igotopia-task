# syntax=docker/dockerfile:1

# One image, three roles (app / worker / migrate). Not a Next standalone build -
# the worker runs TS via tsx and migrate uses drizzle-kit, so we keep
# node_modules + source at runtime. Slimming the image down is a later optimization.

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# build stage
FROM base AS builder
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# prod build hits the real API (MSW off).
ENV NEXT_PUBLIC_USE_MOCKS=false
RUN npm run build

# runtime stage
FROM base AS runner
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
# copy the whole tree (.next + node_modules + src + scripts + configs). .env is
# excluded by .dockerignore so no secret gets baked in.
COPY --from=builder --chown=app:app /app ./
USER app
EXPOSE 3000
# overridden per role in docker-compose.prod.yml (worker -> npm run worker,
# init -> npm run migrate && npm run seed).
CMD ["npm", "run", "start"]
