import { NextRequest, NextResponse } from "next/server";
import { verifyCrmCardSignature } from "@/lib/adapters/hubspotCrmCard";

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

  return NextResponse.json({
    results: [
      {
        objectId,
        title: "Open in EasyOB",
        link,
      },
    ],
  });
}
