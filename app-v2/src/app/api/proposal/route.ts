import { NextRequest, NextResponse } from "next/server";
import { generateProposal } from "@/lib/claude";
import type { StatementAnalysis, PricingModel } from "@/types/merchant";
import type { FeeOverrides } from "@/lib/pricing";

export async function POST(req: NextRequest) {
  try {
    const { analysis, pricingModel, targetMargin, feeOverrides } = await req.json() as {
      analysis: StatementAnalysis;
      pricingModel: PricingModel;
      targetMargin: number;
      feeOverrides: FeeOverrides;
    };

    if (!analysis || !pricingModel || targetMargin == null) {
      return NextResponse.json({ error: "analysis, pricingModel, and targetMargin are required" }, { status: 400 });
    }

    const proposal = await generateProposal(analysis, pricingModel, targetMargin, feeOverrides);
    return NextResponse.json({ proposal });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Proposal generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
