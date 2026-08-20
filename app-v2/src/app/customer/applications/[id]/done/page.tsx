import Link from "next/link";
import styles from "../../../customer.module.css";

// Landing page for Adyen's post-KYC hosted-onboarding redirect (see
// createOnboardingLink in adyen.ts). Intentionally static —
// real KYC-complete confirmation belongs in the Adyen webhook (Phase 2,
// not yet built), not this redirect, which only means the customer finished
// Adyen's hosted flow, not that Adyen has approved them.
export default function CustomerOnboardingDonePage() {
  return (
    <div className={styles.centered}>
      <div className={styles.centeredInner}>
        <div className={styles.checkmark}>✓</div>
        <h1 className={`${styles.centeredTitle} ${styles["centeredTitle--success"]}`}>Verification Submitted</h1>
        <p className={styles.centeredSubtitle}>
          Thanks for completing verification. We&apos;re reviewing your application and an AIO representative will be in touch shortly.
        </p>
        <Link href="/customer" className={styles.btnPrimary}>
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
}
