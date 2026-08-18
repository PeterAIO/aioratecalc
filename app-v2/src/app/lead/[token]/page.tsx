import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { merchantApplications } from "@/lib/db/schema";
import LeadUploadStep from "@/components/customer/LeadUploadStep";
import { buildCustomerSafeQuote } from "@/lib/leadQuote";
import styles from "./lead.module.css";

// Public route — not matched by middleware.ts, no auth. The token itself
// (validated here, server-side) is the only gate.
export default async function LeadPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [row] = await db.select().from(merchantApplications).where(eq(merchantApplications.customerLinkToken, token)).limit(1);

  const invalid = !row || row.customerLinkPurpose !== "lead_upload";
  const expired = !invalid && row.customerLinkExpiresAt ? row.customerLinkExpiresAt.getTime() < Date.now() : false;

  if (invalid || expired) {
    return (
      <div className={styles.centered}>
        <div className={styles.centeredInner}>
          <h1 className={styles.title}>{expired ? "Link Expired" : "Invalid Link"}</h1>
          <p className={styles.subtitle}>Ask your AIO representative for a new link.</p>
        </div>
      </div>
    );
  }

  const businessName = row.business?.dba || row.business?.legalName || null;
  const contactEmail = row.ownerContact?.email || null;

  // Dual statement path: when the rep already gave us a basis — their own
  // statement upload or the ticket/volume configs — the customer opens
  // straight to the quote instead of being asked for a statement first.
  // Built server-side, and only the CustomerSafeQuote crosses to the client.
  const preparedQuote = buildCustomerSafeQuote({
    analysis: row.analysis,
    quoteConfig: row.quoteConfig,
    targetMargin: row.targetMargin != null ? Number(row.targetMargin) : null,
    pricingModel: row.pricingModel,
    quoteLines: row.quoteLines,
    orderPoints: row.orderPoints,
  });

  return (
    <LeadUploadStep
      token={token}
      businessName={businessName}
      contactEmail={contactEmail}
      preparedQuote={preparedQuote}
      alreadyAccepted={!!row.quoteAcceptedAt}
    />
  );
}
