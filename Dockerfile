# syntax=docker/dockerfile:1

# ---- frontend ----
FROM node:20-alpine AS web
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- backend ----
FROM golang:1.22-alpine AS api
WORKDIR /app/backend
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/parta ./cmd/server

# ---- runtime ----
FROM alpine:3.20
WORKDIR /app
RUN addgroup -S parta && adduser -S -G parta parta \
    && mkdir -p /app/data /app/uploads /app/web \
    && chown -R parta:parta /app

COPY --from=api /out/parta /app/parta
COPY --from=web /app/frontend/dist /app/web

ENV PARTA_WEB_DIR=/app/web \
    PARTA_DB_PATH=/app/data/parta.db \
    PARTA_UPLOAD_DIR=/app/uploads \
    PORT=8080

USER parta
EXPOSE 8080

CMD ["/app/parta"]
