import { NextResponse } from "next/server";
import { z } from "zod";
import { createDocument, QueueAdmissionError } from "../../../lib/documents";

const DocumentRequestSchema = z.object({
  channel: z.enum(["email", "portal", "api", "sftp"]),
  externalRef: z.string().min(1).max(160),
  filename: z.string().min(1).max(240),
  mimeType: z.string().min(1).max(120),
  contentText: z.string().min(1).max(1_000_000),
  extractionProfile: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/)
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = DocumentRequestSchema.safeParse(body);
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
