import Link from "next/link";
import { redirect } from "next/navigation";
import { getMyApplicationAction } from "@/lib/actions/customer";
import PayrollOnboardStep from "@/components/customer/PayrollOnboardStep";
import styles from "../../../customer.module.css";

export default async function CustomerPayrollPage({ params }: { params: Promise<{ id: string }> }) {
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

  // Already opted in — this page only exists to collect the one-time signup
  // details, so send returning visitors to the link-minting route instead.
  if (app.checkIds?.companyId) {
    redirect(`/customer/applications/${id}/payroll/continue`);
  }

  // Check needs the legal name, address, phone, and contact email to create the
  // company. The checklist hides the CTA in this case, but the URL is reachable.
  if (!app.business || !app.ownerContact) {
    return (
      <div className={styles.centered}>
        <div className={styles.centeredInner}>
          <h1 className={styles.centeredTitle}>Business Details Needed</h1>
          <p className={styles.centeredSubtitle}>
            Add your business details before setting up payroll.
          </p>
          <Link href={`/customer/applications/${id}/edit`} className={styles.btnPrimary}>
            Add My Details
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <PayrollOnboardStep app={app} />
    </div>
  );
}
