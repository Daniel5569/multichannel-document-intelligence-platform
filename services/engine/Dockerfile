FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
WORKDIR /app

FROM base AS deps
COPY services/engine ./services/engine
WORKDIR /app/services/engine
RUN pip install --no-cache-dir .

FROM base AS runner
COPY --from=deps /usr/local /usr/local
COPY services/engine ./services/engine
WORKDIR /app/services/engine
EXPOSE 8000
CMD ["python", "-m", "document_engine.main"]
