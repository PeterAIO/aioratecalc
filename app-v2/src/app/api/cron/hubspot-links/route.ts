import { NextRequest, NextResponse } from "next/server";
import { backfillEasyobLinks } from "@/lib/adapters/hubspot";

// Phase F nightly top-up. Keeps every HubSpot Company's `easyob_link` URL
// property in sync so the "Push to EasyOB" deep link always resolves. A
// sibling of /api/cron/adyen-actuals rather than a second step bolted onto
// it: the two crons have nothing in common (different vendor, different
// failure modes, different runtime needs) and running them as separate
// Vercel Functions means a HubSpot outage can't affect the Adyen ingest's
// schedule or duration budget, and vice versa — process isolation instead of
// a manual try/catch per step.
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[cron hubspot-links] CRON_SECRET not set");
    return NextResponse.json({ error: "not configured" }, { status: 401 });
  }
  if (req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const summary = await backfillEasyobLinks();
    return NextResponse.json({ easyobLinks: summary });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[cron hubspot-links] backfillEasyobLinks failed", error);
    return NextResponse.json({ easyobLinks: { error } }, { status: 500 });
  }
}
