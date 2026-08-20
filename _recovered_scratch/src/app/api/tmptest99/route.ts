import { NextResponse } from "next/server";
import { listRepsAction, listApplicationsAction } from "@/lib/actions/applications";

export async function GET() {
  try {
    const [reps, apps] = await Promise.all([listRepsAction(), listApplicationsAction()]);
    return NextResponse.json({ reps, apps: apps.map(a => ({ id: a.id, ownerUserId: a.ownerUserId, business: a.business?.legalName })) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
