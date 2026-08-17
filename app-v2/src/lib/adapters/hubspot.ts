// Phase 3: HubSpot bidirectional sync via Private App Token
// Scopes required: crm.objects.deals.read/write, crm.objects.contacts.read/write

import type { BillingFrequency, CatalogProduct, MerchantApplication } from "@/types/merchant";

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

// Two private apps, two tokens. The general CRM app covers deal sync and the
// company reads behind tenant linkage; a separate billing app covers products,
// quotes, line items, subscriptions and invoices. Keeping them apart means the
// billing app can hold write scopes without widening what the sync path can
// reach — pick the right one per call rather than defaulting to either.
function tokenHeaders(token: string | undefined, varName: string) {
  if (!token) throw new Error(`${varName} is not set`);
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function headers() {
  return tokenHeaders(process.env.HUBSPOT_PRIVATE_APP_TOKEN, "HUBSPOT_PRIVATE_APP_TOKEN");
}

function billingHeaders() {
  return tokenHeaders(process.env.HUBSPOT_BILLING_PRIVATE_APP_TOKEN, "HUBSPOT_BILLING_PRIVATE_APP_TOKEN");
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

// ── Phase 3: tenant linkage (read-only) ─────────────────────────────────────
// HubSpot Companies are the system of record for AIO tenants and their
// AIO-dashboard-created Adyen objects (AIOad). An admin/rep links an easyob
// account (ezacc) to the right Company; we only ever READ here — no writes to
// HubSpot, no Adyen calls. Requires the private app's crm.objects.companies.read
// scope. tenant_id holds the "prod-{n}" store-ref format; adyen_account_holder_id
// is the AIOad account holder (occasionally stored with trailing whitespace).

export type TenantCompany = {
  id: string;
  name: string;
  tenantRef: string | null;            // HubSpot "tenant_id", e.g. "prod-1024"
  adyenAccountHolderId: string | null; // "AH32..."
  mid: string | null;
};

const TENANT_COMPANY_PROPS = ["name", "tenant_id", "adyen_account_holder_id", "mid"];

function toTenantCompany(obj: { id: string; properties: Record<string, string | null> }): TenantCompany {
  const p = obj.properties;
  const clean = (v: string | null | undefined) => {
    const t = (v ?? "").trim();
    return t === "" ? null : t;
  };
  return {
    id: obj.id,
    name: clean(p.name) || "(unnamed company)",
    tenantRef: clean(p.tenant_id),
    adyenAccountHolderId: clean(p.adyen_account_holder_id),
    mid: clean(p.mid),
  };
}

// A 403 means the private app is missing a scope. Don't name one here — this
// helper is shared across company, product and quote calls, and HubSpot's body
// already carries the specific `requiredGranularScopes` for the failing call.
function hubspotErr(prefix: string, status: number, body: string): Error {
  const hint = status === 403 ? " — the private app is missing a required scope" : "";
  return new Error(`${prefix}: ${status}${hint} ${body}`.trim());
}

// Free-text search over Companies (name/domain/etc.) for the tenant picker.
// Returns the tenant identifiers each candidate carries so the admin can
// confirm they're linking the right one before committing.
export async function searchTenantCompanies(query: string, limit = 10): Promise<TenantCompany[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const res = await fetch(`${BASE}/crm/v3/objects/companies/search`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ query: q, limit, properties: TENANT_COMPANY_PROPS }),
  });
  if (!res.ok) throw hubspotErr("HubSpot company search failed", res.status, await res.text());
  const data = await res.json() as { results?: Array<{ id: string; properties: Record<string, string | null> }> };
  return (data.results ?? []).map(toTenantCompany);
}

// Fetch a single Company by id at link time, so the snapshot we persist comes
// from a fresh read rather than trusting whatever the picker last showed.
export async function getTenantCompany(companyId: string): Promise<TenantCompany | null> {
  const res = await fetch(
    `${BASE}/crm/v3/objects/companies/${companyId}?properties=${TENANT_COMPANY_PROPS.join(",")}`,
    { headers: headers() }
  );
  if (res.status === 404) return null;
  if (!res.ok) throw hubspotErr("HubSpot company fetch failed", res.status, await res.text());
  const data = await res.json() as { id: string; properties: Record<string, string | null> };
  return toTenantCompany(data);
}

// ── Product catalog ─────────────────────────────────────────────────────────
// AIO's sellable catalog lives in HubSpot and is maintained there, so we read it
// rather than keeping a copy that would drift. Requires the `e-commerce` scope —
// the crm.objects.line_items scopes do NOT cover the Products API.

// Products with no recurringbillingfrequency are one-time (hardware, install).
const PRODUCT_PROPS = ["name", "price", "hs_product_type", "recurringbillingfrequency", "hs_status"];

// Scratch/placeholder entries a rep should never be able to put on a quote.
const EXCLUDED_PRODUCT_NAMES = ["AIO Platform fee TEST - do not use"];

type CatalogProductRow = CatalogProduct & { status: string };

function toCatalogProduct(obj: { id: string; properties: Record<string, string | null> }): CatalogProductRow {
  const p = obj.properties;
  return {
    hubspotProductId: obj.id,
    name: (p.name ?? "").trim(),
    price: parseFloat(p.price ?? "0") || 0,
    billingFrequency: (p.recurringbillingfrequency as BillingFrequency) || "one_time",
    productType: (p.hs_product_type ?? "").trim(),
    status: (p.hs_status ?? "").trim(),
  };
}

export async function listProducts(): Promise<CatalogProduct[]> {
  const products: CatalogProductRow[] = [];
  let after: string | undefined;

  do {
    const params = new URLSearchParams({ limit: "100", properties: PRODUCT_PROPS.join(",") });
    if (after) params.set("after", after);
    const res = await fetch(`${BASE}/crm/v3/objects/products?${params}`, { headers: billingHeaders() });
    if (!res.ok) throw hubspotErr("HubSpot product list failed", res.status, await res.text());
    const data = await res.json() as {
      results?: Array<{ id: string; properties: Record<string, string | null> }>;
      paging?: { next?: { after?: string } };
    };
    products.push(...(data.results ?? []).map(toCatalogProduct));
    after = data.paging?.next?.after;
  } while (after);

  return products
    .filter(p => p.status !== "inactive" && p.name !== "" && !EXCLUDED_PRODUCT_NAMES.includes(p.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ status: _status, ...product }) => product);
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
