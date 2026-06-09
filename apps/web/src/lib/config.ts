export const buildDatabaseUrl = () => {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const user = encodeURIComponent(process.env.POSTGRES_USER ?? "docintel");
  const password = encodeURIComponent(process.env.POSTGRES_PASSWORD ?? "change-me-in-production");
  const host = process.env.POSTGRES_HOST ?? "localhost";
  const port = process.env.POSTGRES_PORT ?? "5432";
  const database = encodeURIComponent(process.env.POSTGRES_DB ?? "document_intelligence");

  return `postgresql://${user}:${password}@${host}:${port}/${database}`;
};

export const config = {
  databaseUrl: buildDatabaseUrl(),
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379"
};
