import { NextResponse } from "next/server";
import { z } from "zod";
import { createDocument, QueueAdmissionError } from "../../../lib/documents";

const ALLOWED_MIME_TYPES = ["text/plain", "application/pdf", "image/png", "image/jpeg"] as const;
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

const DocumentRequestSchema = z
  .object({
    channel: z.enum(["email", "portal", "api", "sftp"]),
    externalRef: z.string().min(1).max(160),
    filename: z.string().min(1).max(240),
    mimeType: z.enum(ALLOWED_MIME_TYPES),
    contentText: z.string().min(1).max(1_000_000),
    contentByteSize: z.number().int().positive().max(MAX_DOCUMENT_BYTES).optional(),
    checksumSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/i)
      .optional(),
    extractionProfile: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/)
  })
  .superRefine(async (value, context) => {
    const bytes = new TextEncoder().encode(value.contentText).length;
    if (value.contentByteSize !== undefined && value.contentByteSize !== bytes) {
      context.addIssue({
        code: "custom",
        path: ["contentByteSize"],
        message: "content_byte_size_mismatch"
      });
    }

    if (value.checksumSha256) {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value.contentText));
      const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
      if (hex !== value.checksumSha256.toLowerCase()) {
        context.addIssue({
          code: "custom",
          path: ["checksumSha256"],
          message: "checksum_sha256_mismatch"
        });
      }
    }
  });

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = await DocumentRequestSchema.safeParseAsync(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_document_request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const result = await createDocument(parsed.data);
    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    if (error instanceof QueueAdmissionError) {
      return NextResponse.json(
        { error: "queue_admission_failed", ingestionRunId: error.ingestionRunId },
        { status: 503 }
      );
    }
    console.error("document_admission_failed", error);
    return NextResponse.json({ error: "document_admission_failed" }, { status: 500 });
  }
}
