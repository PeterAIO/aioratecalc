"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/lib/actions/auth";
import styles from "./AppNav.module.css";

type NavRole = "rep" | "admin" | null | undefined;

type MenuId = "create" | "settings";

export function AppNav({ role, userName }: { role: NavRole; userName?: string }) {
  const pathname = usePathname();
  const [openMenu, setOpenMenu] = useState<MenuId | null>(null);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!openMenu) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent) {
        if (e.key === "Escape") setOpenMenu(null);
        return;
      }
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpenMenu(null);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [openMenu]);

  useEffect(() => {
    setOpenMenu(null);
  }, [pathname]);

  const isAdmin = role === "admin";

  return (
    <nav className={styles.nav} ref={navRef}>
      <Link href="/rep" className={styles.navWordmark}>
        <span className={styles.navMark}>A</span>
        AIO
        <span className={styles.navSub}>Rate Calculator</span>
      </Link>
      <div className={styles.navActions}>
        <NavLink href="/rep" pathname={pathname}>Accounts</NavLink>

        <NavDropdown
          id="create"
          label="New Account"
          primary
          open={openMenu === "create"}
          onToggle={() => setOpenMenu(m => (m === "create" ? null : "create"))}
        >
          <MenuLink href="/rep/proposals/new" pathname={pathname} desc="Enter the merchant's statement yourself">
            Upload a statement
          </MenuLink>
          <MenuLink href="/rep/prospects/new" pathname={pathname} desc="Let the customer upload it themselves">
            Send a customer link
          </MenuLink>
        </NavDropdown>

        {isAdmin ? (
          <NavDropdown
            id="settings"
            label="Settings"
            open={openMenu === "settings"}
            onToggle={() => setOpenMenu(m => (m === "settings" ? null : "settings"))}
          >
            <MenuLink href="/rep/settings" pathname={pathname}>Processors &amp; tiers</MenuLink>
            <MenuLink href="/admin/users" pathname={pathname}>Users</MenuLink>
            <MenuLink href="/admin/settings/pillow" pathname={pathname}>Margin padding</MenuLink>
          </NavDropdown>
        ) : (
          <NavLink href="/rep/settings" pathname={pathname}>Settings</NavLink>
        )}

        {userName && <span className={styles.navUser}>{userName}</span>}
        <form action={logoutAction}>
          <button type="submit" className={styles.navButton}>Sign Out</button>
        </form>
      </div>
    </nav>
  );
}

function NavLink({ href, pathname, children }: { href: string; pathname: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={styles.navLink} aria-current={pathname === href ? "page" : undefined}>
      {children}
    </Link>
  );
}

function MenuLink({ href, pathname, desc, children }: { href: string; pathname: string; desc?: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={styles.menuItem} aria-current={pathname === href ? "page" : undefined}>
      <span>{children}</span>
      {desc && <span className={styles.menuItemDesc}>{desc}</span>}
    </Link>
  );
}

function NavDropdown({
  label,
  primary,
  open,
  onToggle,
  children,
}: {
  id: MenuId;
  label: string;
  primary?: boolean;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.dropdown}>
      <button
        type="button"
        className={primary ? `${styles.navTrigger} ${styles.navTriggerPrimary}` : styles.navTrigger}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={onToggle}
      >
        {label}
        <span className={styles.chevron} aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          {children}
        </div>
      )}
    </div>
  );
}
