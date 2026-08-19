import Link from "next/link";
import { getMyApplicationWithPayrollSyncAction, getMyQuoteAction } from "@/lib/actions/customer";
import { getOnboardingModules } from "@/lib/onboardingModules";
import ApplicationTabs from "@/components/customer/ApplicationTabs";
import styles from "../../customer.module.css";

export default async function CustomerApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Check's onboard links carry no redirect-back URL, so the customer never
  // returns through AIO after finishing payroll setup — viewing this page is
  // the moment we re-read status. No-ops unless payroll is actually pending.
  const app = await getMyApplicationWithPayrollSyncAction(id);

  if (!app) {
    return (
      <div className={styles.centered}>
        <div className={styles.centeredInner}>
          <h1 className={styles.centeredTitle}>Application Not Found</h1>
          <p className={styles.centeredSubtitle}>This application doesn&apos;t exist or isn&apos;t linked to your account.</p>
        </div>
      </div>
    );
  }

  const modules = getOnboardingModules(app);
  // Built here, server-side: leadQuote.ts pulls in pricing.ts, so only the
  // finished CustomerSafeQuote may cross into the client tabs.
  const quote = await getMyQuoteAction(id);

  return (
    <div className={styles.shell}>
      <div className={styles.container}>
        <div className={styles.headerRow}>
          <h1 className={styles.title}>
            {app.business?.dba || app.business?.legalName || "Your Application"}
          </h1>
          <Link href="/customer/set-password" className={styles.accountLink}>Change password</Link>
        </div>
        <p className={styles.subtitle}>
          Here&apos;s what&apos;s left to finish setting up your account.
        </p>
        <ApplicationTabs app={app} modules={modules} quote={quote} />
      </div>
    </div>
  );
}
