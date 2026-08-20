import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { merchantApplications } from "@/lib/db/schema";
import {
  buildRateStoryProperties,
  verifyCrmCardSignature,
  type CrmCardProperty,
} from "@/lib/adapters/hubspotCrmCard";

// HubSpot Classic CRM Card data-fetch endpoint. HubSpot polls this URL (GET,
// no body) when a rep views a Company record with this card installed, and
// signs the request with the app's client secret (v3 signature — see
// hubspotCrmCard.ts). Public by design (HubSpot is the only caller), so the
// signature check IS the auth — fail closed if the secret isn't configured.
// Docs: https://developers.hubspot.com/docs/api-reference/legacy/crm/extensions/crm-cards/guide
//       https://developers.hubspot.com/docs/api/webhooks/validating-requests
export async function GET(req: NextRequest) {
  const clientSecret = process.env.HUBSPOT_CRM_CARD_CLIENT_SECRET;
  if (!clientSecret) {
    return NextResponse.json(
      { error: "HUBSPOT_CRM_CARD_CLIENT_SECRET is not configured" },
      { status: 503 }
    );
  }

  const valid = verifyCrmCardSignature({
    method: req.method,
    uri: req.url,
    body: "",
    timestamp: req.headers.get("x-hubspot-request-timestamp"),
    signature: req.headers.get("x-hubspot-signature-v3"),
    clientSecret,
  });
  if (!valid) {
    return NextResponse.json({ error: "Invalid or missing request signature" }, { status: 401 });
  }

  // HubSpot's default CRM card query params include associatedObjectId /
  // associatedObjectType / userId / userEmail / portalId; the Company's
  // record id is associatedObjectId.
  const companyId = req.nextUrl.searchParams.get("associatedObjectId");
  if (!companyId) {
    return NextResponse.json({ error: "associatedObjectId is required" }, { status: 400 });
  }
  const objectId = Number(companyId);
  if (!Number.isFinite(objectId)) {
    return NextResponse.json({ error: "associatedObjectId must be numeric" }, { status: 400 });
  }

  const base = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const link = `${base}/rep/prospects/new?hubspotCompanyId=${companyId}`;

  // The rate story, read live off the EasyOB application(s) linked to this
  // company. The linkage is tenantLink.hubspotCompanyId (Phase F), a jsonb
  // column — hence the ->> lookup rather than a typed eq(). Only the four
  // columns buildRateStoryProperties is allowed to read are selected; see the
  // trust-boundary note there for why nothing else may be.
  //
  // Best-effort: the card's job is the link, so a failed lookup logs and
  // renders the link alone rather than 500ing HubSpot's poll.
  let properties: CrmCardProperty[] = [];
  try {
    const rows = await db
      .select({
        updatedAt: merchantApplications.updatedAt,
        analysis: merchantApplications.analysis,
        proposal: merchantApplications.proposal,
        processing: merchantApplications.processing,
      })
      .from(merchantApplications)
      .where(sql`${merchantApplications.tenantLink} ->> 'hubspotCompanyId' = ${companyId}`);
    properties = buildRateStoryProperties(rows);
  } catch (err) {
    console.error("crm-card: rate-story lookup failed for company", companyId, err);
  }

  return NextResponse.json({
    results: [
      {
        objectId,
        title: "Open in EasyOB",
        link,
        // Omitted entirely when there's nothing to say, so an unanalysed
        // company shows the link rather than an empty properties block.
        ...(properties.length > 0 ? { properties } : {}),
      },
    ],
  });
}
