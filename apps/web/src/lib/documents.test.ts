import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({
  pool: {
    query: vi.fn(async (sql: string) => {
      if (sql.includes("RETURNING id")) {
        return { rows: [{ id: "source-1" }] };
      }
      return { rows: [] };
    })
  }
}));

vi.mock("./queue", () => ({
  enqueueDocumentIngestion: vi.fn(async () => "stream-entry-1")
}));

import { pool } from "./db";
import { enqueueDocumentIngestion } from "./queue";
import { computeContentHash, createDocument, QueueAdmissionError } from "./documents";

const input = {
  channel: "email" as const,
  externalRef: "claim-email-1042",
  filename: "claim.txt",
  mimeType: "text/plain",
  contentText: "Claim Number: CLM-1042",
  extractionProfile: "claims"
};

describe("document admission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("computes stable SHA-256 content hashes", () => {
    expect(computeContentHash("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });

  it("persists document metadata and enqueues async extraction", async () => {
    const result = await createDocument(input);

    expect(result.status).toBe("queued");
    expect(enqueueDocumentIngestion).toHaveBeenCalledWith(
      expect.objectContaining({
        ingestionRunId: result.ingestionRunId,
        documentId: result.documentId,
        versionId: result.versionId,
        extractionProfile: "claims"
      })
    );
    expect(pool.query).toHaveBeenCalledWith("BEGIN");
    expect(pool.query).toHaveBeenCalledWith("COMMIT");
  });

  it("marks persisted work failed when Redis stream admission fails", async () => {
    vi.mocked(enqueueDocumentIngestion).mockRejectedValueOnce(new Error("redis down"));

    await expect(createDocument(input)).rejects.toBeInstanceOf(QueueAdmissionError);
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("UPDATE documents"), expect.any(Array));
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE ingestion_runs"),
      expect.any(Array)
    );
  });
});
