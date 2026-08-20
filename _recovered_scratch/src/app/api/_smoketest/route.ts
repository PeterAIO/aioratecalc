import { NextResponse } from "next/server";
import { PostgresAdapter } from "@/lib/storage/postgresAdapter";
import type { MerchantApplication } from "@/types/merchant";

// TEMPORARY — exercises PostgresAdapter's ownership scoping against the real
// DB via the dev server (server-only can't run outside Next's bundler).
// Deleted immediately after use, not part of the app.
export async function GET() {
  const storage = new PostgresAdapter();
  const adminScope = { userId: "smoke-admin", role: "admin" as const };
  const repScope = { userId: "smoke-rep", role: "rep" as const };
  const otherRepScope = { userId: "someone-else", role: "rep" as const };
  const results: Record<string, unknown> = {};

  const app: MerchantApplication = {
    id: "smoke_app_1",
    ownerUserId: "smoke-rep",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    stage: "analysis",
    hubspotDealId: null,
    adyenIds: null,
    adyenOnboardingUrl: null,
    targetMargin: 0.008,
    pricingModel: "2-tier",
    customerLinkToken: null,
    customerLinkPurpose: null,
    customerLinkSentAt: null,
    customerLinkExpiresAt: null,
    analysis: null,
    proposal: null,
    business: null,
    ownerContact: null,
    processing: null,
    agreement: null,
  };

  await storage.saveApplication(repScope, app);

  const asRep = await storage.listApplications(repScope);
  results.repSeesOwn = asRep.length === 1 && asRep[0].id === app.id;

  const asOtherRep = await storage.listApplications(otherRepScope);
  results.otherRepSeesNone = asOtherRep.length === 0;

  const asAdmin = await storage.listApplications(adminScope);
  results.adminSeesAtLeastOne = asAdmin.length >= 1;

  await storage.saveApplication(otherRepScope, { ...app, targetMargin: 0.999 });
  const afterBlockedSave = await storage.getApplication(repScope, app.id);
  results.otherRepCannotOverwrite = afterBlockedSave?.targetMargin === 0.008;

  const settings = await storage.getSettings();
  results.defaultSettingsHasProcessors = settings.processors.length >= 1;

  await storage.deleteApplication(otherRepScope, app.id);
  const stillThere = await storage.getApplication(adminScope, app.id);
  results.otherRepCannotDelete = stillThere !== null;

  await storage.deleteApplication(repScope, app.id);
  const gone = await storage.getApplication(adminScope, app.id);
  results.ownerCanDelete = gone === null;

  return NextResponse.json(results);
}
