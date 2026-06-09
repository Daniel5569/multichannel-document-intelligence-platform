import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/documents", () => {
  class QueueAdmissionError extends Error {
    constructor(public readonly ingestionRunId: string) {
      super("queue_admission_failed");
    }
  }

  return {
    createDocument: vi.fn(),
    QueueAdmissionError
  };
});

import { createDocument, QueueAdmissionError } from "../../../lib/documents";
import { POST } from "./route";

const body = {
  channel: "email",
  externalRef: "claim-email-1042",
  filename: "claim.txt",
  mimeType: "text/plain",
  contentText: "Claim Number: CLM-1042",
  extractionProfile: "claims"
};

function jsonRequest(payload: unknown) {
  return new Request("http://localhost:3000/api/documents", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
}

describe("POST /api/documents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 for invalid JSON", async () => {
    const response = await POST(
      new Request("http://localhost:3000/api/documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{"
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_json" });
  });

  it("returns 400 for malformed document requests", async () => {
    const response = await POST(jsonRequest({ filename: "claim.txt" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_document_request" });
  });

  it("returns 202 when document admission is accepted", async () => {
    vi.mocked(createDocument).mockResolvedValueOnce({
      documentId: "doc-1",
      versionId: "version-1",
      ingestionRunId: "run-1",
      status: "queued",
      contentHash: "hash"
    });

    const response = await POST(jsonRequest(body));

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ documentId: "doc-1", ingestionRunId: "run-1" });
  });

  it("returns 503 when queue admission fails", async () => {
    vi.mocked(createDocument).mockRejectedValueOnce(new QueueAdmissionError("run-1"));

    const response = await POST(jsonRequest(body));

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: "queue_admission_failed", ingestionRunId: "run-1" });
  });
});
