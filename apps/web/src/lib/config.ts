const INSECURE_DEFAULT_MARKER = "change-me-in-production";

function isProductionRuntime(): boolean {
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return false;
  }
  return process.env.NODE_ENV === "production" || process.env.APP_ENV === "production";
}

function allowsDevelopmentDefaults(): boolean {
  return process.env.APP_ENV === "development" || process.env.ALLOW_INSECURE_DEV_DEFAULTS === "1";
}

function assertProductionSafe(name: string, value: string | undefined): void {
  if (!isProductionRuntime() || allowsDevelopmentDefaults()) {
    return;
  }
  if (!value) {
    throw new Error(`${name}_required_in_production`);
  }
  if (value.includes(INSECURE_DEFAULT_MARKER)) {
    throw new Error(`${name}_uses_insecure_default`);
  }
}

export const buildDatabaseUrl = () => {
  if (process.env.DATABASE_URL) {
    assertProductionSafe("DATABASE_URL", process.env.DATABASE_URL);
    return process.env.DATABASE_URL;
  }

  const user = encodeURIComponent(process.env.POSTGRES_USER ?? "docintel");
  const password = encodeURIComponent(process.env.POSTGRES_PASSWORD ?? "change-me-in-production");
  const host = process.env.POSTGRES_HOST ?? "localhost";
  const port = process.env.POSTGRES_PORT ?? "5432";
  const database = encodeURIComponent(process.env.POSTGRES_DB ?? "document_intelligence");

  assertProductionSafe("POSTGRES_PASSWORD", process.env.POSTGRES_PASSWORD);
  return `postgresql://${user}:${password}@${host}:${port}/${database}`;
};

export const config = {
  databaseUrl: buildDatabaseUrl(),
  redisUrl: (() => {
    assertProductionSafe("REDIS_URL", process.env.REDIS_URL);
    return process.env.REDIS_URL ?? "redis://localhost:6379";
  })()
};
