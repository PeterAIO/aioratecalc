"use client";

import { useState, useEffect } from "react";
import { LocalStorageAdapter } from "@/lib/storage/localStorageAdapter";
import { fmt$, fmtPct2 } from "@/lib/utils";
import type { MerchantApplication, CustomerSubmission } from "@/types/merchant";

const T = { green: "#22c55e", blue: "#0ea5e9", red: "#ef4444", accent: "#f9674e", gold: "#f59e0b", muted: "#64748b", white: "#e2e8f0", card: "#0f1628", cardBorder: "#1e2d45" };

const ADMIN_PASSWORD = "aio2024";

const STAGE_COLORS: Record<string, string> = {
  analysis: T.muted, pricing: T.blue, proposal_ready: T.gold, proposal_sent: T.gold,
  merchant_link_sent: T.accent, merchant_filling: T.accent, adyen_kyc_pending: T.blue,
  adyen_kyc_complete: T.green, adyen_approved: T.green, closed_lost: T.red,
};

export default function AdminPage() {
  const [authed, setAuthed]       = useState(false);
  const [pw, setPw]               = useState("");
  const [pwErr, setPwErr]         = useState(false);
  const [apps, setApps]           = useState<MerchantApplication[]>([]);
  const [subs, setSubs]           = useState<CustomerSubmission[]>([]);
  const [tab, setTab]             = useState<"apps" | "leads">("apps");
  const [selected, setSelected]   = useState<MerchantApplication | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && sessionStorage.getItem("admin_authed") === "1") setAuthed(true);
  }, []);

  useEffect(() => {
    if (!authed) return;
    const storage = new LocalStorageAdapter();
    storage.listApplications().then(setApps).catch(() => {});
    storage.listSubmissions().then(setSubs).catch(() => {});
  }, [authed]);

  const login = (e: React.FormEvent) => {
    e.preventDefault();
    if (pw === ADMIN_PASSWORD) {
      setAuthed(true);
      sessionStorage.setItem("admin_authed", "1");
    } else {
      setPwErr(true);
    }
  };

  if (!authed) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0f1e" }}>
        <form onSubmit={login} style={{ background: T.card, border: `1px solid ${T.cardBorder}`, borderRadius: 16, padding: 40, width: 360 }}>
          <div style={{ width: 48, height: 48, background: T.accent, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
            <span style={{ color: "#fff", fontSize: 22, fontWeight: 900 }}>A</span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: T.white, marginBottom: 6 }}>Admin Access</h1>
          <p style={{ fontSize: 13, color: T.muted, marginBottom: 24 }}>AIO Rate Calculator — Internal Dashboard</p>
          <input
            type="password" value={pw} onChange={e => { setPw(e.target.value); setPwErr(false); }}
            placeholder="Password"
            style={{ width: "100%", padding: "12px 14px", background: "#0a0f1e", border: `1px solid ${pwErr ? T.red : T.cardBorder}`, borderRadius: 8, color: T.white, fontSize: 14, outline: "none", boxSizing: "border-box" as const, marginBottom: 12 }}
          />
          {pwErr && <div style={{ fontSize: 12, color: T.red, marginBottom: 12 }}>Incorrect password</div>}
          <button type="submit" style={{ width: "100%", padding: "12px", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer", border: "none", background: T.accent, color: "#fff" }}>Sign In</button>
        </form>
      </div>
    );
  }

  const card: React.CSSProperties = { background: T.card, border: `1px solid ${T.cardBorder}`, borderRadius: 12, padding: 20 };
  const btn: React.CSSProperties  = { padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", border: "none" };

  const metrics = {
    total:     apps.length,
    proposals: apps.filter(a => ["proposal_ready", "proposal_sent"].includes(a.stage)).length,
    applying:  apps.filter(a => ["merchant_link_sent", "adyen_kyc_pending", "adyen_kyc_complete"].includes(a.stage)).length,
    approved:  apps.filter(a => a.stage === "adyen_approved").length,
    volume:    apps.reduce((sum, a) => sum + (a.analysis?.totalVolume || 0), 0),
    savings:   apps.reduce((sum, a) => sum + (a.proposal?.savings?.annual || 0), 0),
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0a0f1e", color: T.white }}>
      {/* Header */}
      <header style={{ borderBottom: `1px solid ${T.cardBorder}`, padding: "0 32px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, background: T.accent, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "#fff", fontSize: 14, fontWeight: 900 }}>A</span>
          </div>
          <span style={{ fontSize: 15, fontWeight: 800 }}>Admin Dashboard</span>
        </div>
        <button onClick={() => { sessionStorage.removeItem("admin_authed"); setAuthed(false); }} style={{ ...btn, background: "#1e2d45", color: T.muted }}>Sign Out</button>
      </header>

      <div style={{ padding: "32px" }}>
        {/* Metrics */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 14, marginBottom: 32 }}>
          {[
            { lbl: "Total Applications", val: String(metrics.total), color: T.white },
            { lbl: "Proposals Sent", val: String(metrics.proposals), color: T.gold },
            { lbl: "In Onboarding", val: String(metrics.applying), color: T.blue },
            { lbl: "Approved", val: String(metrics.approved), color: T.green },
            { lbl: "Total Volume", val: fmt$(metrics.volume), color: T.white },
            { lbl: "Projected Savings", val: fmt$(metrics.savings) + "/yr", color: T.green },
          ].map(m => (
            <div key={m.lbl} style={card}>
              <div style={{ fontSize: 22, fontWeight: 800, color: m.color, marginBottom: 4 }}>{m.val}</div>
              <div style={{ fontSize: 11, color: T.muted }}>{m.lbl}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: `1px solid ${T.cardBorder}`, paddingBottom: 0 }}>
          {(["apps", "leads"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: "10px 20px", background: "transparent", border: "none", borderBottom: tab === t ? `2px solid ${T.accent}` : "2px solid transparent", color: tab === t ? T.white : T.muted, fontSize: 14, fontWeight: tab === t ? 700 : 500, cursor: "pointer" }}>
              {t === "apps" ? `Rep Applications (${apps.length})` : `Customer Leads (${subs.length})`}
            </button>
          ))}
        </div>

        {tab === "apps" && (
          <div>
            <div style={{ ...card, padding: 0, overflow: "hidden" }}>
              {/* Table header */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 120px 120px 100px 120px", gap: 16, padding: "12px 20px", background: "#0a0f1e" }}>
                {["Merchant", "Stage", "Volume", "Fees", "Savings/yr", "Created"].map(h => (
                  <div key={h} style={{ fontSize: 11, fontWeight: 700, color: T.muted, letterSpacing: 1, textTransform: "uppercase" as const }}>{h}</div>
                ))}
              </div>
              {apps.length === 0 && (
                <div style={{ padding: "40px 20px", textAlign: "center", color: T.muted }}>No applications yet. Start a new proposal to see data here.</div>
              )}
              {apps.map(a => (
                <button key={a.id} onClick={() => setSelected(a === selected ? null : a)} style={{ display: "grid", gridTemplateColumns: "1fr 100px 120px 120px 100px 120px", gap: 16, padding: "14px 20px", borderTop: `1px solid ${T.cardBorder}`, width: "100%", background: selected?.id === a.id ? "#1e2d4530" : "transparent", textAlign: "left" as const, cursor: "pointer", border: "none", borderBottom: "none", borderLeft: "none", borderRight: "none" }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: T.white }}>{a.business?.dba || a.business?.legalName || a.analysis?.merchantName || "—"}</div>
                    <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{a.analysis?.currentProcessorName || "—"}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 12, background: `${STAGE_COLORS[a.stage] || T.muted}20`, color: STAGE_COLORS[a.stage] || T.muted }}>
                      {a.stage.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div style={{ fontSize: 14, color: T.white }}>{a.analysis ? fmt$(a.analysis.totalVolume) : "—"}</div>
                  <div style={{ fontSize: 14, color: T.accent }}>{a.analysis ? fmt$(a.analysis.totalFees) : "—"}</div>
                  <div style={{ fontSize: 14, color: T.green }}>{a.proposal ? fmt$(a.proposal.savings?.annual || 0) : "—"}</div>
                  <div style={{ fontSize: 12, color: T.muted }}>{new Date(a.createdAt).toLocaleDateString()}</div>
                </button>
              ))}
            </div>

            {/* Detail panel */}
            {selected && (
              <div style={{ ...card, marginTop: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                  <div>
                    <h2 style={{ fontSize: 18, fontWeight: 800, color: T.white }}>{selected.business?.legalName || selected.analysis?.merchantName || "Application Detail"}</h2>
                    <div style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>ID: {selected.id} · Created {new Date(selected.createdAt).toLocaleString()}</div>
                  </div>
                  <button onClick={() => setSelected(null)} style={{ ...btn, background: "#1e2d45", color: T.muted }}>Close</button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                  {[
                    { label: "Stage", val: selected.stage.replace(/_/g, " ") },
                    { label: "HubSpot Deal ID", val: selected.hubspotDealId || "Not synced" },
                    { label: "Adyen Legal Entity", val: selected.adyenIds?.legalEntityId || "Not created" },
                    { label: "Onboarding URL", val: selected.adyenOnboardingUrl ? "Set" : "Not generated" },
                    { label: "Owner", val: selected.ownerContact ? `${selected.ownerContact.firstName} ${selected.ownerContact.lastName}` : "—" },
                    { label: "Email", val: selected.ownerContact?.email || "—" },
                  ].map(f => (
                    <div key={f.label}>
                      <div style={{ fontSize: 11, color: T.muted, marginBottom: 4 }}>{f.label}</div>
                      <div style={{ fontSize: 13, color: T.white }}>{f.val}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "leads" && (
          <div style={{ ...card, padding: 0, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 120px 120px 120px", gap: 16, padding: "12px 20px", background: "#0a0f1e" }}>
              {["Merchant", "Volume", "Fees", "Processor", "Submitted"].map(h => (
                <div key={h} style={{ fontSize: 11, fontWeight: 700, color: T.muted, letterSpacing: 1, textTransform: "uppercase" as const }}>{h}</div>
              ))}
            </div>
            {subs.length === 0 && (
              <div style={{ padding: "40px 20px", textAlign: "center", color: T.muted }}>No customer leads yet. Share the customer portal to collect submissions.</div>
            )}
            {subs.map((s, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 120px 120px 120px 120px", gap: 16, padding: "14px 20px", borderTop: `1px solid ${T.cardBorder}` }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.white }}>{s.analysis?.merchantName || "—"}</div>
                  <div style={{ fontSize: 12, color: T.muted }}>{s.contactInfo?.email || "—"}</div>
                </div>
                <div style={{ fontSize: 14, color: T.white }}>{s.analysis ? fmt$(s.analysis.totalVolume) : "—"}</div>
                <div style={{ fontSize: 14, color: T.accent }}>{s.analysis ? fmt$(s.analysis.totalFees) : "—"}</div>
                <div style={{ fontSize: 13, color: T.muted }}>{s.analysis?.currentProcessorName || "—"}</div>
                <div style={{ fontSize: 12, color: T.muted }}>{new Date(s.submittedAt).toLocaleDateString()}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
