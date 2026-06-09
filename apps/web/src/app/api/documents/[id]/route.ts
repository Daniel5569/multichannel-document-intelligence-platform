import { NextResponse } from "next/server";
import { getDocument } from "../../../../lib/documents";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const result = await getDocument(params.id);
  if (!result.document) {
    return NextResponse.json({ error: "document_not_found" }, { status: 404 });
  }
  return NextResponse.json(result);
}
