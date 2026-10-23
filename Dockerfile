FROM node:24-alpine AS builder
WORKDIR /build
COPY src ./src
COPY scripts ./scripts
COPY package.json ./package.json
RUN node scripts/build.mjs web

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 DARTDECK_WEB_ROOT=/app/dist/web PORT=8000
WORKDIR /app
COPY --from=builder /build/dist ./dist
COPY server.py ./server.py
EXPOSE 8000
CMD ["python", "server.py"]
