import { NextResponse } from "next/server";
import { createProspectAction } from "@/lib/actions/prospects";

export async function GET() {
  const result = await createProspectAction({
    merchantName: "Smoke Test Pizza",
    contactEmail: "owner@smoketestpizza.com",
    targetMargin: 0.008,
    pricingModel: "2-tier",
  });
  return NextResponse.json(result);
}
