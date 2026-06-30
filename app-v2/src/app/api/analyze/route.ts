import { NextRequest, NextResponse } from "next/server";
import { analyzeStatement } from "@/lib/claude";

export async function POST(req: NextRequest) {
  try {
    const { fileData, mediaType } = await req.json();
    if (!fileData || !mediaType) {
      return NextResponse.json({ error: "fileData and mediaType are required" }, { status: 400 });
    }
    const analysis = await analyzeStatement(fileData, mediaType);
    return NextResponse.json({ analysis });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analysis failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
