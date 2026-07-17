"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { listApplicationsAction, listSubmissionsAction, listRepsAction, type RepSummary } from "@/lib/actions/applications";
import { logoutAction } from "@/lib/actions/auth";
import { fmt$ } from "@/lib/utils";
import { STAGE_COLORS } from "@/lib/stageColors";
import type { MerchantApplication, CustomerSubmission } from "@/types/merchant";
import styles from "./admin.module.css";

// Password gate removed — middleware.ts now guards /admin/* via real session auth.
export default function AdminPage() {
  const [apps, setApps]           = useState<MerchantApplication[]>([]);
  const [subs, setSubs]           = useState<CustomerSubmission[]>([]);
  const [reps, setReps]           = useState<RepSummary[]>([]);
  const [tab, setTab]             = useState<"apps" | "leads">("apps");
  const [selected, setSelected]   = useState<MerchantApplication | null>(null);
  const [search, setSearch]       = useState("");

  useEffect(() => {
    listApplicationsAction().then(setApps).catch(() => {});
    listSubmissionsAction().then(setSubs).catch(() => {});
    listRepsAction().then(setReps).catch(() => {});
  }, []);

  const repMap = new Map(reps.map(r => [r.id, r]));

  const filteredApps = apps.filter(a => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (a.business?.dba || "").toLowerCase().includes(q) ||
      (a.business?.legalName || "").toLowerCase().includes(q) ||
      (a.analysis?.merchantName || "").toLowerCase().includes(q)
    );
  });

  const metrics = {
    total:     apps.length,
    proposals: apps.filter(a => ["proposal_ready", "proposal_sent"].includes(a.stage)).length,
    applying:  apps.filter(a => ["merchant_link_sent", "adyen_kyc_pending", "adyen_kyc_complete"].includes(a.stage)).length,
    approved:  apps.filter(a => a.stage === "adyen_approved").length,
    volume:    apps.reduce((sum, a) => sum + (a.analysis?.totalVolume || 0), 0),
    savings:   apps.reduce((sum, a) => sum + (a.proposal?.savings?.annual || 0), 0),
  };

  return (
    <div className={styles.dashboard}>
      <nav className={styles.nav}>
        <div className={styles.navWordmark}>
          <span className={styles.navMark}>A</span>
          Admin Dashboard
        </div>
        <div className={styles.navActions}>
          <Link href="/admin/users" className={styles.navLink}>Users</Link>
          <Link href="/admin/settings/pillow" className={styles.navLink}>Padding</Link>
          <form action={logoutAction}>
            <button type="submit" className={styles.navButton}>Sign Out</button>
          </form>
        </div>
      </nav>

      <main className={styles.main}>
        <div className={styles.header}>
          <h1 className={styles.headerTitle}>Applications &amp; leads</h1>
          <p className={styles.headerSubtitle}>Every rep-driven proposal and customer self-serve lead across the pipeline, with margin oversight for approved deals.</p>
        </div>

        {/* Stat-led hero — no card shape, sits directly on the page */}
        <div className={styles.stats}>
          <div className={styles.statHero}>{fmt$(metrics.volume)}</div>
          <p className={styles.statCaption}>Total volume across the pipeline</p>
          <div className={styles.statTicker}>
            <span><b>{metrics.total}</b> Applications</span>
            <span className={styles.statDot}>·</span>
            <span><b>{metrics.proposals}</b> Proposals Sent</span>
            <span className={styles.statDot}>·</span>
            <span><b>{metrics.applying}</b> In Onboarding</span>
            <span className={styles.statDot}>·</span>
            <span><b>{metrics.approved}</b> Approved</span>
            <span className={styles.statDot}>·</span>
            <span><b className={styles.statAccent}>{fmt$(metrics.savings)}/yr</b> Projected Savings</span>
          </div>
        </div>

        {/* Tabs */}
        <div className={styles.tabsRow}>
          <div className={styles.tabs} data-active={tab} role="tablist">
            <button role="tab" aria-selected={tab === "apps"} className={styles.tab} onClick={() => setTab("apps")}>
              Applications ({apps.length})
            </button>
            <button role="tab" aria-selected={tab === "leads"} className={styles.tab} onClick={() => setTab("leads")}>
              Leads ({subs.length})
            </button>
          </div>
        </div>

        {tab === "apps" && (
          <div key="apps" className={styles.tabPanel}>

            {/* Full table — shown when nothing is selected */}
            {!selected && (
              <>
              <div className={styles.tableSearch}>
                <input
                  type="search"
                  className={styles.tableSearchInput}
                  placeholder="Search merchants…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <div className={styles.panel}>
                <div className={styles.tableHeader}>
                  {["Merchant", "Rep", "Stage", "Volume", "Fees", "Savings/yr", "Created"].map(h => (
                    <div key={h} className={styles.tableHeaderCell}>{h}</div>
                  ))}
                </div>
                {filteredApps.length === 0 && (
                  <div className={styles.emptyState}>{search ? "No results." : "No applications yet. Start a new proposal to see data here."}</div>
                )}
                {filteredApps.map(a => {
                  const rep = repMap.get(a.ownerUserId);
                  return (
                    <button
                      key={a.id}
                      onClick={() => setSelected(a)}
                      className={styles.tableRow}
                    >
                      <div className={styles.tableCell} data-label="Merchant">
                        <div className={styles.merchantName}>{a.business?.dba || a.business?.legalName || a.analysis?.merchantName || "—"}</div>
                        <div className={styles.merchantSub}>{a.analysis?.currentProcessorName || "—"}</div>
                      </div>
                      <div className={styles.tableCell} data-label="Rep">{rep?.name || rep?.email || "—"}</div>
                      <div className={styles.tableCell} data-label="Stage">
                        <span className={styles.badge} style={{ background: `${STAGE_COLORS[a.stage] || "#64748b"}20`, color: STAGE_COLORS[a.stage] || "#64748b" }}>
                          {a.stage.replace(/_/g, " ")}
                        </span>
                      </div>
                      <div className={`${styles.tableCell} ${styles["tableCell--numeric"]}`} data-label="Volume">{a.analysis ? fmt$(a.analysis.totalVolume) : "—"}</div>
                      <div className={`${styles.tableCell} ${styles["tableCell--accent"]}`} data-label="Fees">{a.analysis ? fmt$(a.analysis.totalFees) : "—"}</div>
                      <div className={`${styles.tableCell} ${styles["tableCell--success"]}`} data-label="Savings/yr">{a.proposal ? fmt$(a.proposal.savings?.annual || 0) : "—"}</div>
                      <div className={`${styles.tableCell} ${styles["tableCell--muted"]}`} data-label="Created">{new Date(a.createdAt).toLocaleDateString()}</div>
                    </button>
                  );
                })}
              </div>
              </>
            )}

            {/* Split view — shown once an item is selected */}
            {selected && (
              <div className={styles.splitLayout}>

                {/* Left: searchable compact list */}
                <div className={styles.splitListPanel}>
                  <div className={styles.splitSearch}>
                    <input
                      type="search"
                      className={styles.splitSearchInput}
                      placeholder="Search merchants…"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                    />
                  </div>
                  <div className={styles.splitListScroll}>
                    {filteredApps.length === 0 && (
                      <div className={styles.emptyState}>
                        {search ? "No results." : "No applications yet."}
                      </div>
                    )}
                    {filteredApps.map(a => (
                      <button
                        key={a.id}
                        onClick={() => setSelected(a === selected ? null : a)}
                        className={styles.splitRow}
                        data-selected={selected?.id === a.id}
                      >
                        <span className={styles.splitRowName}>
                          {a.business?.dba || a.business?.legalName || a.analysis?.merchantName || "—"}
                        </span>
                        <span className={styles.badge} style={{ background: `${STAGE_COLORS[a.stage] || "#64748b"}20`, color: STAGE_COLORS[a.stage] || "#64748b" }}>
                          {a.stage.replace(/_/g, " ")}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Right: detail panel */}
                <div className={styles.splitDetailPanel}>
                  <div className={styles.detail}>
                    <div className={styles.detailHeader}>
                      <div>
                        <h2 className={styles.detailTitle}>{selected.business?.legalName || selected.analysis?.merchantName || "Application Detail"}</h2>
                        <div className={styles.detailMeta}>ID: {selected.id} · Created {new Date(selected.createdAt).toLocaleString()}</div>
                      </div>
                      <button onClick={() => { setSelected(null); setSearch(""); }} className={styles.btnGhost}>Close</button>
                    </div>
                    <div className={styles.detailGrid}>
                      {[
                        { label: "Stage", val: selected.stage.replace(/_/g, " ") },
                        { label: "Rep (Commission)", val: repMap.get(selected.ownerUserId)?.name || "—" },
                        { label: "Rep Email", val: repMap.get(selected.ownerUserId)?.email || "—" },
                        { label: "HubSpot Deal ID", val: selected.hubspotDealId || "Not synced" },
                        { label: "Adyen Legal Entity", val: selected.adyenIds?.legalEntityId || "Not created" },
                        { label: "Onboarding URL", val: selected.adyenOnboardingUrl ? "Set" : "Not generated" },
                        { label: "Merchant Contact", val: selected.ownerContact ? `${selected.ownerContact.firstName} ${selected.ownerContact.lastName}` : "—" },
                        { label: "Merchant Email", val: selected.ownerContact?.email || "—" },
                      ].map(f => (
                        <div key={f.label}>
                          <div className={styles.detailFieldLabel}>{f.label}</div>
                          <div className={styles.detailFieldValue}>{f.val}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

              </div>
            )}

          </div>
        )}

        {tab === "leads" && (
          <div key="leads" className={styles.tabPanel}>
            <div className={styles.panel}>
              <div className={styles.tableHeader} style={{ gridTemplateColumns: "1fr 110px 110px 110px 100px" }}>
                {["Merchant", "Volume", "Fees", "Processor", "Submitted"].map(h => (
                  <div key={h} className={styles.tableHeaderCell}>{h}</div>
                ))}
              </div>
              {subs.length === 0 && (
                <div className={styles.emptyState}>No customer leads yet. Share the customer portal to collect submissions.</div>
              )}
              {subs.map((s, i) => (
                <div key={i} className={styles.tableRow} style={{ gridTemplateColumns: "1fr 110px 110px 110px 100px", cursor: "default" }}>
                  <div className={styles.tableCell} data-label="Merchant">
                    <div className={styles.merchantName}>{s.analysis?.merchantName || "—"}</div>
                    <div className={styles.merchantSub}>{s.contactInfo?.email || "—"}</div>
                  </div>
                  <div className={`${styles.tableCell} ${styles["tableCell--numeric"]}`} data-label="Volume">{s.analysis ? fmt$(s.analysis.totalVolume) : "—"}</div>
                  <div className={`${styles.tableCell} ${styles["tableCell--accent"]}`} data-label="Fees">{s.analysis ? fmt$(s.analysis.totalFees) : "—"}</div>
                  <div className={`${styles.tableCell} ${styles["tableCell--muted"]}`} data-label="Processor">{s.analysis?.currentProcessorName || "—"}</div>
                  <div className={`${styles.tableCell} ${styles["tableCell--muted"]}`} data-label="Submitted">{new Date(s.submittedAt).toLocaleDateString()}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
