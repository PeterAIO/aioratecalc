import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { merchantApplications, customerLoginTokens } from "@/lib/db/schema";
import { sendMagicLinkEmail } from "@/lib/adapters/email";
import { shouldAdvance } from "@/lib/adapters/adyenWebhook";
import { hasQuoteBasis } from "@/lib/leadQuote";

const TOKEN_TTL_MINUTES = 30;

// Public, unauthenticated by design — same token-is-the-auth model as
// /api/lead/[token]/analyze. The customer's explicit acceptance of the quote:
// records it on the application, advances the deal stage, and issues the
// short-lived magic-link login token that carries them into the existing
// account-creation flow (verify → set-password → checklist).
//
// Returns only { sent, devUrl } — no application data crosses back.
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "email is required" }, { status: 400 });
    }

    const [row] = await db.select().from(merchantApplications).where(eq(merchantApplications.customerLinkToken, token)).limit(1);
    if (!row || row.customerLinkPurpose !== "lead_upload") {
      return NextResponse.json({ error: "Invalid link" }, { status: 404 });
    }
    if (row.customerLinkExpiresAt && row.customerLinkExpiresAt.getTime() < Date.now()) {
      return NextResponse.json({ error: "This link has expired" }, { status: 410 });
    }
    // Nothing to accept until a quote exists on the application.
    if (!hasQuoteBasis({ analysis: row.analysis, quoteConfig: row.quoteConfig, targetMargin: null, pricingModel: null })) {
      return NextResponse.json({ error: "There is no quote on this link yet" }, { status: 409 });
    }

    // Acceptance is recorded once. Re-opening an accepted link to get another
    // login email keeps the original timestamp, and the stage move is
    // forward-only (same rule as the Adyen webhook) so a deal already in
    // onboarding is never dragged back to quote_accepted.
    const advance = shouldAdvance(row.stage, "quote_accepted");
    if (advance || !row.quoteAcceptedAt) {
      await db.update(merchantApplications)
        .set({
          ...(advance ? { stage: "quote_accepted" as const } : {}),
          quoteAcceptedAt: row.quoteAcceptedAt ?? new Date(),
          updatedAt: new Date(),
        })
        .where(eq(merchantApplications.id, row.id));
    }

    const loginToken = randomUUID();
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000);
    await db.insert(customerLoginTokens).values({
      email,
      token: loginToken,
      applicationId: row.id,
      expiresAt,
    });

    const base = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const result = await sendMagicLinkEmail(email, `${base}/api/customer/verify?token=${loginToken}`);

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not accept the quote";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
