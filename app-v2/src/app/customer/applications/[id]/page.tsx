import Link from "next/link";
import { getMyApplicationAction } from "@/lib/actions/customer";
import { getOnboardingModules } from "@/lib/onboardingModules";
import ApplicationTabs from "@/components/customer/ApplicationTabs";
import styles from "../../customer.module.css";

export default async function CustomerApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const app = await getMyApplicationAction(id);

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
        <ApplicationTabs app={app} modules={modules} />
      </div>
    </div>
  );
}
