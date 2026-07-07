FROM node:20-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

EXPOSE 4000

# schema.sql uses CREATE TABLE/COLUMN IF NOT EXISTS, so re-running the migration
# on every container start is safe (no-op once the schema is already current).
CMD ["sh", "-c", "node dist/src/db/migrate.js && node dist/src/server.js"]
