import { NextRequest, NextResponse } from "next/server";
import type { MerchantApplication } from "@/types/merchant";

// These routes read/write localStorage via the client-side adapter.
// For a pure server-side database, swap LocalStorageAdapter here.
// Phase 1: applications are managed client-side; these routes are thin
// pass-through stubs that will be fleshed out with a database in Phase 5.

export async function GET() {
  // Client reads directly from localStorage via LocalStorageAdapter.
  // This endpoint exists for future server-side storage.
  return NextResponse.json({ message: "Use client-side storage in Phase 1" }, { status: 200 });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Partial<MerchantApplication>;
    // Validate required fields
    if (!body.id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    // In Phase 1 the client persists to localStorage directly.
    // This route returns the application back with a 201 for API consistency.
    return NextResponse.json({ application: body }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create application";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
