import { NextRequest, NextResponse } from "next/server";
import { analyzeStatement } from "@/lib/claude";
import { getEffectiveRole } from "@/lib/auth/getEffectiveRole";

// Rep/admin only. middleware.ts's matcher covers /rep, /admin and /customer but
// NOT /api, so the session check has to live in the route itself.
//
// This is the internal half of the analyze pair: it returns the raw
// StatementAnalysis (cost/margin internals and all) and every call bills the
// Anthropic API. The customer path deliberately goes through the separate,
// token-gated /api/lead/[token]/analyze, which only ever returns a
// CustomerSafeQuote — the two must stay separate.
export async function POST(req: NextRequest) {
  if (!(await getEffectiveRole())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
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
