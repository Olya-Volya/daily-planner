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

# Прогоняем схему на базу при каждом старте контейнера — так таблицы создаются
# автоматически на первом деплое и остаются в актуальном состоянии на
# последующих, без ручного захода в консоль. Идемпотентно: если схема не
# менялась — команда ничего не делает. --accept-data-loss нужен, т.к. это
# неинтерактивный запуск (нет TTY для подтверждения); для проекта на этой
# стадии это осознанный компромисс — при появлении реальных пользователей
# стоит перейти на `prisma migrate deploy` с настоящими файлами миграций.
CMD ["sh", "-c", "npx prisma db push --skip-generate --accept-data-loss && node dist/index.js"]
