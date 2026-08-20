import { NextResponse } from "next/server";
import { updateMyApplicationDetailsAction } from "@/lib/actions/customer";
import { sendMerchantOnboardingLinkAction, markApplicationClosedLostAction } from "@/lib/actions/applications";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const which = searchParams.get("which");
  const id = searchParams.get("id")!;

  try {
    if (which === "update") {
      const result = await updateMyApplicationDetailsAction(id, {
        business: { legalName: "Test Coffee LLC Updated", dba: "Test Coffee", bizType: "llc", address: "456 Elm St", city: "Austin", state: "TX", zip: "78701", phone: "555-000-1111", website: "https://testcoffee.example", yearsInBusiness: "6", annualRevenue: "600000" },
        ownerContact: { firstName: "Jane", lastName: "Doe", title: "Owner", email: "jane@testcoffee.example", phone: "555-000-2222" },
        processing: { monthlyVolume: "55000", avgTicket: "13", cardPresentPct: "90", mcc: "5812", businessDescription: "Coffee shop", previouslyTerminated: "no", bankruptcy: "no", currentProcessor: "Square" },
        agreement: { sigName: "Jane Doe", sigDate: new Date().toISOString(), termsAccepted: true, electronicConsentAccepted: true },
      });
      return NextResponse.json(result);
    }
    if (which === "sendLink") {
      const result = await sendMerchantOnboardingLinkAction(id);
      return NextResponse.json(result);
    }
    if (which === "closedLost") {
      const result = await markApplicationClosedLostAction(id);
      return NextResponse.json(result);
    }
    return NextResponse.json({ error: "unknown which" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
