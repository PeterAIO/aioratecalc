import Link from "next/link";
import { getEffectiveRole } from "@/lib/auth/getEffectiveRole";
import { logoutAction } from "@/lib/actions/auth";
import styles from "./rep-layout.module.css";

export default async function RepLayout({ children }: { children: React.ReactNode }) {
  const effective = await getEffectiveRole();

  return (
    <div className={styles.shell}>
      <nav className={styles.nav}>
        <Link href="/rep/proposals/new" className={styles.navWordmark}>
          <span className={styles.navMark}>A</span>
          AIO
          <span className={styles.navSub}>Rate Calculator</span>
        </Link>
        <div className={styles.navActions}>
          <NavLink href="/rep">Dashboard</NavLink>
          <NavLink href="/rep/proposals/new">New Proposal</NavLink>
          <NavLink href="/rep/prospects/new">Send Customer Link</NavLink>
          {effective?.role === "admin" && <NavLink href="/admin">Admin</NavLink>}
          <NavLink href="/rep/settings">Settings</NavLink>
          {effective?.name && (
            <span className={styles.navUser}>{effective.name}</span>
          )}
          <form action={logoutAction}>
            <button type="submit" className={styles.navButton}>Sign Out</button>
          </form>
        </div>
      </nav>
      <main className={styles.main}>{children}</main>
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={styles.navLink}>
      {children}
    </Link>
  );
}
