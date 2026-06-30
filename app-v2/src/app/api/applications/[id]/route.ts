import { NextRequest, NextResponse } from "next/server";
import type { MerchantApplication } from "@/types/merchant";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // Phase 1: client reads from localStorage directly.
  return NextResponse.json({ id, message: "Use client-side storage in Phase 1" });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json() as Partial<MerchantApplication>;
    // Phase 1: client writes to localStorage directly.
    return NextResponse.json({ id, patch: body });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update application";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
