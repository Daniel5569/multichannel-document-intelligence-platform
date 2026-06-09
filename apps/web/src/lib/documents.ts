import crypto from "node:crypto";
import { pool } from "./db";
import { enqueueDocumentIngestion } from "./queue";

export class QueueAdmissionError extends Error {
  constructor(public readonly ingestionRunId: string) {
    super("queue_admission_failed");
    this.name = "QueueAdmissionError";
  }
}

export type DocumentChannel = "email" | "portal" | "api" | "sftp";

export type CreateDocumentInput = {
  channel: DocumentChannel;
  externalRef: string;
  filename: string;
  mimeType: string;
  contentText: string;
  extractionProfile: string;
};

export function computeContentHash(contentText: string): string {
  return crypto.createHash("sha256").update(contentText, "utf8").digest("hex");
}

export async function createDocument(input: CreateDocumentInput) {
  const documentId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const ingestionRunId = crypto.randomUUID();
  const contentHash = computeContentHash(input.contentText);

  await pool.query("BEGIN");
  try {
    const sourceResult = await pool.query<{ id: string }>(
      `INSERT INTO document_sources (channel, external_ref)
       VALUES ($1, $2)
       ON CONFLICT (channel, external_ref) DO UPDATE
       SET external_ref = EXCLUDED.external_ref
       RETURNING id`,
      [input.channel, input.externalRef]
    );
    const sourceId = sourceResult.rows[0]?.id;
    if (!sourceId) {
      throw new Error("document_source_insert_failed");
    }

    await pool.query(
      `INSERT INTO documents (id, source_id, original_filename, mime_type, status)
       VALUES ($1, $2, $3, $4, 'queued')`,
      [documentId, sourceId, input.filename, input.mimeType]
    );

    await pool.query(
      `INSERT INTO document_versions (id, document_id, content_sha256, text_body, version_number)
       VALUES ($1, $2, $3, $4, 1)`,
      [versionId, documentId, contentHash, input.contentText]
    );

    await pool.query(
      `INSERT INTO ingestion_runs (id, document_id, version_id, extraction_profile, status)
       VALUES ($1, $2, $3, $4, 'queued')`,
      [ingestionRunId, documentId, versionId, input.extractionProfile]
    );
    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }

  try {
    await enqueueDocumentIngestion({
      ingestionRunId,
      documentId,
      versionId,
      extractionProfile: input.extractionProfile
    });
  } catch (error) {
    await pool.query(
      `UPDATE documents
       SET status = 'failed',
           updated_at = now()
       WHERE id = $1`,
      [documentId]
    );
    await pool.query(
      `UPDATE ingestion_runs
       SET status = 'failed',
           risk_json = risk_json || $2::jsonb,
           updated_at = now()
       WHERE id = $1`,
      [ingestionRunId, JSON.stringify({ queueError: error instanceof Error ? error.message : "unknown" })]
    );
    throw new QueueAdmissionError(ingestionRunId);
  }

  return {
    documentId,
    versionId,
    ingestionRunId,
    status: "queued" as const,
    contentHash
  };
}

export async function getDocument(documentId: string) {
  const documentResult = await pool.query(
    `SELECT d.*, ds.channel, ds.external_ref
     FROM documents d
     JOIN document_sources ds ON ds.id = d.source_id
     WHERE d.id = $1`,
    [documentId]
  );
  const runs = await pool.query(
    "SELECT * FROM ingestion_runs WHERE document_id = $1 ORDER BY created_at ASC",
    [documentId]
  );
  const entities = await pool.query(
    `SELECT ee.*
     FROM extracted_entities ee
     JOIN ingestion_runs ir ON ir.id = ee.ingestion_run_id
     WHERE ir.document_id = $1
     ORDER BY ee.id ASC`,
    [documentId]
  );
  const claims = await pool.query("SELECT * FROM canonical_claims WHERE document_id = $1 ORDER BY id ASC", [
    documentId
  ]);

  return {
    document: documentResult.rows[0] ?? null,
    runs: runs.rows,
    entities: entities.rows,
    claims: claims.rows
  };
}
