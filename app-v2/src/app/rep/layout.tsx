import Link from "next/link";

export default function RepLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#0a0f1e", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <header style={{ borderBottom: "1px solid #1e2d45", padding: "0 24px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: "#0a0f1e", zIndex: 50 }}>
        <Link href="/rep/proposals/new" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, background: "#f9674e", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "#fff", fontSize: 14, fontWeight: 900 }}>A</span>
          </div>
          <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: 1, color: "#e2e8f0" }}>AIO</span>
          <span style={{ fontSize: 12, color: "#64748b", marginLeft: 2 }}>Rate Calculator</span>
        </Link>
        <nav style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <NavLink href="/rep/proposals/new">New Proposal</NavLink>
          <NavLink href="/admin">Admin</NavLink>
          <NavLink href="/rep/settings">Settings</NavLink>
        </nav>
      </header>
      <main style={{ flex: 1 }}>{children}</main>
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} style={{ padding: "6px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, color: "#94a3b8", textDecoration: "none", transition: "color .15s" }}>
      {children}
    </Link>
  );
}
