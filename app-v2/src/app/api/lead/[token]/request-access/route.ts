import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { merchantApplications, customerLoginTokens } from "@/lib/db/schema";
import { sendMagicLinkEmail } from "@/lib/adapters/email";

const TOKEN_TTL_MINUTES = 30;

// Public, unauthenticated by design — same token-is-the-auth model as
// /api/lead/[token]/analyze. Issues a short-lived magic-link login token so
// the customer can create/access an account tied to this application.
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

    const loginToken = randomUUID();
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000);
    await db.insert(customerLoginTokens).values({
      email,
      token: loginToken,
      applicationId: row.id,
      expiresAt,
    });

    const base = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const verifyUrl = `${base}/api/customer/verify?token=${loginToken}`;
    const result = await sendMagicLinkEmail(email, verifyUrl);

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Request failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
