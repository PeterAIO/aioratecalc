import { getEffectiveRole } from "@/lib/auth/getEffectiveRole";
import { AppNav } from "@/components/nav/AppNav";
import styles from "@/components/nav/shell.module.css";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const effective = await getEffectiveRole();

  return (
    <div className={styles.shell}>
      <AppNav role={effective?.role} userName={effective?.name} />
      <main className={styles.main}>{children}</main>
    </div>
  );
}
