import { NextRequest, NextResponse } from "next/server";
import { analyzeStatement } from "@/lib/claude";
import { createTrace } from "@/lib/debugTrace";

export async function POST(req: NextRequest) {
  // Trace lives for the whole request so a thrown error still returns the steps
  // captured up to the failure — Steve debugs entirely from the browser.
  const trace = createTrace("Statement Analysis");
  try {
    const { fileData, mediaType } = await req.json();
    if (!fileData || !mediaType) {
      return NextResponse.json({ error: "fileData and mediaType are required" }, { status: 400 });
    }
    const analysis = await analyzeStatement(fileData, mediaType, trace);
    return NextResponse.json({ analysis, debug: trace.toJSON() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analysis failed";
    trace.step("threw", message);
    return NextResponse.json({ error: message, debug: trace.toJSON() }, { status: 500 });
  }
}
