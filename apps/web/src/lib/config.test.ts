import { afterEach, describe, expect, it, vi } from "vitest";

describe("config production safety", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  it("keeps development defaults available for local demos", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_PASSWORD;
    delete process.env.REDIS_URL;

    const { config } = await import("./config");

    expect(config.databaseUrl).toContain("document_intelligence");
    expect(config.redisUrl).toBe("redis://localhost:6379");
  });

  it("rejects default database credentials in production", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.APP_ENV;
    process.env.POSTGRES_PASSWORD = "change-me-in-production";
    process.env.REDIS_URL = "redis://redis:6379";

    await expect(import("./config")).rejects.toThrow("POSTGRES_PASSWORD_uses_insecure_default");
  });

  it("does not require runtime secrets during Next production build", async () => {
    process.env.NODE_ENV = "production";
    process.env.NEXT_PHASE = "phase-production-build";
    delete process.env.APP_ENV;
    delete process.env.POSTGRES_PASSWORD;
    delete process.env.REDIS_URL;

    const { config } = await import("./config");

    expect(config.databaseUrl).toContain("document_intelligence");
  });

  it("requires redis configuration in production", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.APP_ENV;
    process.env.POSTGRES_PASSWORD = "prod-secret";
    delete process.env.REDIS_URL;

    await expect(import("./config")).rejects.toThrow("REDIS_URL_required_in_production");
  });
});
