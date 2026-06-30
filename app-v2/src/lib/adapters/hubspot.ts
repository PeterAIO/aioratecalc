// Phase 3: HubSpot bidirectional sync via Private App Token
// Scopes required: crm.objects.deals.read/write, crm.objects.contacts.read/write

import type { MerchantApplication } from "@/types/merchant";

const BASE = "https://api.hubapi.com";

const STAGE_MAP: Record<string, string> = {
  analysis: "appointmentscheduled",
  pricing: "qualifiedtobuy",
  proposal_ready: "presentationscheduled",
  proposal_sent: "decisionmakerboughtin",
  merchant_link_sent: "contractsent",
  adyen_kyc_pending: "contractsent",
  adyen_kyc_complete: "closedwon",
  adyen_approved: "closedwon",
  closed_lost: "closedlost",
};

function headers() {
  const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
  if (!token) throw new Error("HUBSPOT_PRIVATE_APP_TOKEN is not set (Phase 3)");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

export async function pushToHubSpot(app: MerchantApplication): Promise<string> {
  const props: Record<string, string> = {
    dealname: app.business?.dba || app.business?.legalName || app.analysis?.merchantName || "New Deal",
    dealstage: STAGE_MAP[app.stage] || "appointmentscheduled",
    amount: String(Math.round((parseFloat(app.processing?.monthlyVolume || "0") || app.analysis?.totalVolume || 0) * 12)),
    current_processor: app.analysis?.currentProcessorName || "",
    current_monthly_fees: String(app.analysis?.totalFees || 0),
    projected_annual_savings: String(Math.round((app.proposal?.savings?.annual || 0))),
    proposed_effective_rate: String(app.proposal?.projectedFees?.effectiveRate || 0),
    mcc_code: app.processing?.mcc || "",
  };

  if (app.hubspotDealId) {
    // Update existing deal
    const res = await fetch(`${BASE}/crm/v3/objects/deals/${app.hubspotDealId}`, {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify({ properties: props }),
    });
    if (!res.ok) throw new Error(`HubSpot PATCH deal failed: ${await res.text()}`);
    return app.hubspotDealId;
  }

  // Create deal
  const res = await fetch(`${BASE}/crm/v3/objects/deals`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ properties: props }),
  });
  if (!res.ok) throw new Error(`HubSpot POST deal failed: ${await res.text()}`);
  const data = await res.json() as { id: string };
  return data.id;
}

export async function pullFromHubSpot(hubspotDealId: string): Promise<Partial<MerchantApplication>> {
  const res = await fetch(
    `${BASE}/crm/v3/objects/deals/${hubspotDealId}?properties=dealname,dealstage,amount,current_processor,current_monthly_fees`,
    { headers: headers() }
  );
  if (!res.ok) throw new Error(`HubSpot GET deal failed: ${await res.text()}`);
  const data = await res.json() as { properties: Record<string, string> };
  const p = data.properties;
  return {
    hubspotDealId,
    business: p.dealname ? { legalName: p.dealname, dba: p.dealname } as MerchantApplication["business"] : undefined,
  } as Partial<MerchantApplication>;
}
