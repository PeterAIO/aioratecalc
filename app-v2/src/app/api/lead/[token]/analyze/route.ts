import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { merchantApplications } from "@/lib/db/schema";
import { analyzeStatement } from "@/lib/claude";
import { derivePricing } from "@/lib/pricing";
import type { StatementAnalysis, CustomerSafeQuote, PricingModel } from "@/types/merchant";

// Public, unauthenticated by design — the token itself (time-limited,
// single-purpose) is the auth. Deliberately separate from /api/analyze so
// the "customer never sees internals" guarantee is enforced in exactly one
// place: this route only ever returns a CustomerSafeQuote, never the raw
// StatementAnalysis or any cost/margin breakdown.
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const { fileData, mediaType } = await req.json();
    if (!fileData || !mediaType) {
      return NextResponse.json({ error: "fileData and mediaType are required" }, { status: 400 });
    }

    const [row] = await db.select().from(merchantApplications).where(eq(merchantApplications.customerLinkToken, token)).limit(1);
    if (!row || row.customerLinkPurpose !== "lead_upload") {
      return NextResponse.json({ error: "Invalid link" }, { status: 404 });
    }
    if (row.customerLinkExpiresAt && row.customerLinkExpiresAt.getTime() < Date.now()) {
      return NextResponse.json({ error: "This link has expired" }, { status: 410 });
    }

    const analysis: StatementAnalysis = await analyzeStatement(fileData, mediaType);

    const targetMargin = row.targetMargin != null ? Number(row.targetMargin) : 0.008;
    const pricingModel: PricingModel = (row.pricingModel as PricingModel | null) || "2-tier";
    const pricing = derivePricing(analysis, targetMargin, pricingModel, { monthlyFee: 0, perTxnFee: 0, cpPerTxnFee: 0, cnpPerTxnFee: 0 });

    const vol = analysis.totalVolume || 0;
    const monthlySavings = (analysis.totalFees || 0) - pricing.projectedMonthlyFees;
    const quote: CustomerSafeQuote = {
      effectiveRate: vol > 0 ? pricing.projectedMonthlyFees / vol : 0,
      monthlySavings,
      annualSavings: monthlySavings * 12,
      savingsPct: (analysis.totalFees || 0) > 0 ? monthlySavings / (analysis.totalFees || 1) : 0,
    };

    await db.update(merchantApplications)
      .set({ analysis, stage: "analysis", updatedAt: new Date() })
      .where(eq(merchantApplications.id, row.id));

    return NextResponse.json({ quote });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analysis failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
