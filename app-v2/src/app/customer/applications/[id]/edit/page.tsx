import { getMyApplicationAction } from "@/lib/actions/customer";
import CustomerOnboardStep from "@/components/customer/CustomerOnboardStep";
import styles from "../../../customer.module.css";

export default async function CustomerApplicationEditPage({ params }: { params: Promise<{ id: string }> }) {
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

  return (
    <div className={styles.shell}>
      <CustomerOnboardStep app={app} />
    </div>
  );
}
