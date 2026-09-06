# syntax=docker/dockerfile:1
FROM node:20-alpine AS build
WORKDIR /app
# Prisma's query engine needs OpenSSL to detect the right binary target —
# without it, Alpine images silently fall back to an incompatible engine
# and crash on startup ("Fatal error on startup").
RUN apk add --no-cache openssl

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY prisma ./prisma
RUN npx prisma generate

COPY --from=build /app/dist ./dist

CMD ["node", "dist/index.js"]
