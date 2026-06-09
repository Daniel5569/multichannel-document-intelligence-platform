import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { createClient } from "redis";
import { pool as appPool } from "../../../lib/db";
import { closeRedisClientForTests } from "../../../lib/queue";

const shouldRun = process.env.RUN_DB_INTEGRATION === "1";

describe.skipIf(!shouldRun)("POST /api/documents integration", () => {
  const databaseUrl =
    process.env.DATABASE_URL ??
    `postgresql://${encodeURIComponent(process.env.POSTGRES_USER ?? "docintel")}:${encodeURIComponent(
      process.env.POSTGRES_PASSWORD ?? "change-me-in-production"
    )}@${process.env.POSTGRES_HOST ?? "localhost"}:${process.env.POSTGRES_PORT ?? "5432"}/${encodeURIComponent(
      process.env.POSTGRES_DB ?? "document_intelligence"
    )}`;
  const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
  const pool = new Pool({ connectionString: databaseUrl });
  const redis = createClient({ url: redisUrl });

  beforeAll(async () => {
    const initSql = fs.readFileSync(path.resolve(process.cwd(), "../../infra/db/init.sql"), "utf-8");
    await pool.query(initSql);
    await pool.query(
      "TRUNCATE validation_events, canonical_claims, extracted_entities, ingestion_runs, document_versions, documents, document_sources RESTART IDENTITY CASCADE"
    );
    await redis.connect();
    await redis.flushDb();
  });

  afterAll(async () => {
    await closeRedisClientForTests();
    await appPool.end();
    await redis.quit();
    await pool.end();
  });

  it("persists a document and appends one Redis Stream entry", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost:3000/api/documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          channel: "email",
          externalRef: "claim-email-1042",
          filename: "claim.txt",
          mimeType: "text/plain",
          contentText: "Claim Number: CLM-1042\nPolicy Number: POL-88A\nClaim Amount: $500.00",
          extractionProfile: "claims"
        })
      })
    );

    expect(response.status).toBe(202);
    const payload = await response.json();

    const document = await pool.query("SELECT status, original_filename FROM documents WHERE id = $1", [
      payload.documentId
    ]);
    const run = await pool.query("SELECT status FROM ingestion_runs WHERE id = $1", [payload.ingestionRunId]);
    const streamLength = await redis.xLen("document-ingestion");

    expect(document.rows[0]).toMatchObject({ status: "queued", original_filename: "claim.txt" });
    expect(run.rows[0]).toMatchObject({ status: "queued" });
    expect(streamLength).toBe(1);
  });
});
