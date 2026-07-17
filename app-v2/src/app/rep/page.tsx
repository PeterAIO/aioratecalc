"use client";

import { useState, useEffect } from "react";
import {
  listApplicationsAction,
  sendMerchantOnboardingLinkAction,
  markApplicationClosedLostAction,
} from "@/lib/actions/applications";
import { fmt$ } from "@/lib/utils";
import { STAGE_COLORS } from "@/lib/stageColors";
import { getOnboardingModules } from "@/lib/onboardingModules";
import type { MerchantApplication } from "@/types/merchant";
import styles from "./rep.module.css";

// Neutral fallback for a stage not present in STAGE_COLORS (should not occur in practice).
const FALLBACK_STAGE_COLOR = "#9ca3af";

export default function RepDashboardPage() {
  const [apps, setApps] = useState<MerchantApplication[]>([]);
  const [selected, setSelected] = useState<MerchantApplication | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    listApplicationsAction().then(setApps).catch(() => {});
  }, []);

  const metrics = {
    total:     apps.length,
    proposals: apps.filter(a => ["proposal_ready", "proposal_sent"].includes(a.stage)).length,
    applying:  apps.filter(a => ["merchant_link_sent", "adyen_kyc_pending", "adyen_kyc_complete"].includes(a.stage)).length,
    approved:  apps.filter(a => a.stage === "adyen_approved").length,
    volume:    apps.reduce((sum, a) => sum + (a.analysis?.totalVolume || 0), 0),
    savings:   apps.reduce((sum, a) => sum + (a.proposal?.savings?.annual || 0), 0),
  };

  const updateOne = (updated: MerchantApplication) => {
    setApps(prev => prev.map(a => (a.id === updated.id ? updated : a)));
    setSelected(prev => (prev?.id === updated.id ? updated : prev));
  };

  const filteredApps = apps.filter(a => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (a.business?.dba || "").toLowerCase().includes(q) ||
      (a.business?.legalName || "").toLowerCase().includes(q) ||
      (a.analysis?.merchantName || "").toLowerCase().includes(q)
    );
  });

  const handleSendLink = async (app: MerchantApplication) => {
    setBusyId(app.id);
    try {
      const { app: updated } = await sendMerchantOnboardingLinkAction(app.id);
      updateOne(updated);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to send onboarding link");
    }
    setBusyId(null);
  };

  const handleMarkClosedLost = async (app: MerchantApplication) => {
    if (!window.confirm(`Mark ${app.business?.legalName || app.analysis?.merchantName || "this application"} as closed lost?`)) return;
    setBusyId(app.id);
    try {
      const updated = await markApplicationClosedLostAction(app.id);
      updateOne(updated);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to update stage");
    }
    setBusyId(null);
  };

  return (
    <div className={styles.main}>
      <div className={styles.header}>
        <h1 className={styles.headerTitle}>My Clients</h1>
      </div>

      {/* Stat-led hero — no card shape, sits directly on the page */}
      <div className={styles.stats}>
        <div className={styles.statHero}>{fmt$(metrics.volume)}</div>
        <p className={styles.statCaption}>Total volume across your pipeline</p>
        <div className={styles.statTicker}>
          <span><b>{metrics.total}</b> Applications</span>
          <span className={styles.statDot}>·</span>
          <span><b>{metrics.proposals}</b> Proposals Sent</span>
          <span className={styles.statDot}>·</span>
          <span><b>{metrics.applying}</b> In Onboarding</span>
          <span className={styles.statDot}>·</span>
          <span><b>{metrics.approved}</b> Approved</span>
          <span className={styles.statDot}>·</span>
          <span><b className={styles.statSuccess}>{fmt$(metrics.savings)}/yr</b> Projected Savings</span>
        </div>
      </div>

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
            {["Merchant", "Stage", "Volume", "Fees", "Savings/yr", "Created"].map(h => (
              <div key={h} className={styles.tableHeaderCell}>{h}</div>
            ))}
          </div>
          {filteredApps.length === 0 && (
            <div className={styles.emptyState}>{search ? "No results." : "No clients yet. Send a customer link to get started."}</div>
          )}
          {filteredApps.map(a => (
            <button
              key={a.id}
              onClick={() => setSelected(a)}
              className={styles.tableRow}
            >
              <div className={styles.tableCell} data-label="Merchant">
                <div className={styles.merchantName}>{a.business?.dba || a.business?.legalName || a.analysis?.merchantName || "—"}</div>
                <div className={styles.merchantSub}>{a.analysis?.currentProcessorName || "—"}</div>
              </div>
              <div className={styles.tableCell} data-label="Stage">
                <span className={styles.badge} style={{ background: `${STAGE_COLORS[a.stage] || FALLBACK_STAGE_COLOR}20`, color: STAGE_COLORS[a.stage] || FALLBACK_STAGE_COLOR }}>
                  {a.stage.replace(/_/g, " ")}
                </span>
              </div>
              <div className={`${styles.tableCell} ${styles["tableCell--numeric"]}`} data-label="Volume">{a.analysis ? fmt$(a.analysis.totalVolume) : "—"}</div>
              <div className={`${styles.tableCell} ${styles["tableCell--accent"]}`} data-label="Fees">{a.analysis ? fmt$(a.analysis.totalFees) : "—"}</div>
              <div className={`${styles.tableCell} ${styles["tableCell--success"]}`} data-label="Savings/yr">{a.proposal ? fmt$(a.proposal.savings?.annual || 0) : "—"}</div>
              <div className={`${styles.tableCell} ${styles["tableCell--muted"]}`} data-label="Created">{new Date(a.createdAt).toLocaleDateString()}</div>
            </button>
          ))}
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
                  {search ? "No results." : "No clients yet."}
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
                  <span className={styles.badge} style={{ background: `${STAGE_COLORS[a.stage] || FALLBACK_STAGE_COLOR}20`, color: STAGE_COLORS[a.stage] || FALLBACK_STAGE_COLOR }}>
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
                <div className={styles.detailActions}>
                  {selected.stage === "proposal_sent" && !selected.adyenOnboardingUrl && (
                    <button onClick={() => handleSendLink(selected)} disabled={busyId === selected.id} className={styles.btnPrimary}>
                      Send Onboarding Link
                    </button>
                  )}
                  {selected.stage !== "closed_lost" && selected.stage !== "adyen_approved" && (
                    <button onClick={() => handleMarkClosedLost(selected)} disabled={busyId === selected.id} className={styles.btnDanger}>
                      Mark Closed Lost
                    </button>
                  )}
                  <button onClick={() => { setSelected(null); setSearch(""); }} className={styles.btnGhost}>Close</button>
                </div>
              </div>
              <div className={styles.detailGrid}>
                {[
                  { label: "Stage", val: selected.stage.replace(/_/g, " ") },
                  { label: "HubSpot Deal ID", val: selected.hubspotDealId || "Not synced" },
                  { label: "Adyen Legal Entity", val: selected.adyenIds?.legalEntityId || "Not created" },
                  { label: "Onboarding URL", val: selected.adyenOnboardingUrl ? "Set" : "Not generated" },
                  { label: "Owner", val: selected.ownerContact ? `${selected.ownerContact.firstName} ${selected.ownerContact.lastName}` : "—" },
                  { label: "Email", val: selected.ownerContact?.email || "—" },
                ].map(f => (
                  <div key={f.label}>
                    <div className={styles.detailFieldLabel}>{f.label}</div>
                    <div className={styles.detailFieldValue}>{f.val}</div>
                  </div>
                ))}
              </div>
              <div>
                <div className={styles.modulesLabel}>Modules</div>
                <div className={styles.modules}>
                  {getOnboardingModules(selected).map(m => (
                    <span key={m.key} className={styles.modulePill}>
                      {m.label}: {m.status.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
