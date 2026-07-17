"use client";

import { useState, useEffect } from "react";
import { getPricingPreviewAction } from "@/lib/actions/pricing";
import { fmt$, fmtPct2 } from "@/lib/utils";
import type { StatementAnalysis, ProposalOutput, Processor, ProcessorTier } from "@/types/merchant";
import type { FeeOverrides, RoleScopedPricing } from "@/lib/pricing";
import styles from "./PricingStep.module.css";

type PricingModel = "flat-rate" | "2-tier" | "interchange-plus";
type Tone = "info" | "warning" | "success";

type Props = {
  analysis: StatementAnalysis;
  activeProcessor: Processor | null;
  activeTier: ProcessorTier | null;
  onBack: () => void;
  onProposal: (proposal: ProposalOutput) => void;
};

// tone preserves the old T.blue/T.gold/T.green data-encoding per model —
// mapped 1:1 onto the new semantic tokens (info/warning/success), not accent.
const MODEL_INFO: Record<PricingModel, { name: string; desc: string; tone: Tone }> = {
  "flat-rate": { name: "Flat Rate", desc: "One rate for all card types. Simple and predictable — best for high-volume retail.", tone: "info" },
  "2-tier": { name: "2-Tier", desc: "Separate card-present and card-not-present rates. Best for mixed-environment merchants.", tone: "warning" },
  "interchange-plus": { name: "Interchange Plus", desc: "Cost + fixed markup above interchange. Most transparent — ideal for large merchants.", tone: "success" },
};

const TONE_BORDER: Record<Tone, string> = { info: "var(--info)", warning: "var(--warning)", success: "var(--success)" };
const TONE_BG: Record<Tone, string> = { info: "var(--info-bg)", warning: "var(--warning-bg)", success: "var(--success-bg)" };
const TONE_CLASS: Record<Tone, string> = { info: styles["value--info"], warning: styles["value--warning"], success: styles["value--success"] };

export default function PricingStep({ analysis, activeProcessor, activeTier, onBack, onProposal }: Props) {
  const [model, setModel]         = useState<PricingModel>("2-tier");
  const [targetMargin, setTarget] = useState(0.008);
  const [manualTarget, setManual] = useState("");
  const [feeOverrides, setFees]   = useState<FeeOverrides>({ monthlyFee: 0, perTxnFee: 0, cpPerTxnFee: 0, cnpPerTxnFee: 0 });
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [pricing, setPricing]     = useState<RoleScopedPricing | null>(null);

  // Pricing (including the margin floor / cost-basis view, which is role-
  // scoped and padded for reps) is computed server-side — this component
  // never sees or derives the true numbers itself. Debounced so dragging the
  // margin slider doesn't fire a request per pixel.
  useEffect(() => {
    const handle = setTimeout(() => {
      getPricingPreviewAction({ analysis, targetMargin, pricingModel: model, feeOverrides, activeTier })
        .then(setPricing)
        .catch(() => setPricing(null));
    }, 150);
    return () => clearTimeout(handle);
  }, [analysis, targetMargin, model, feeOverrides, activeTier]);

  const vol     = analysis.totalVolume || 1;
  const savings = pricing ? (analysis.totalFees || 0) - pricing.projectedMonthlyFees : 0;
  const belowFloor = pricing?.belowCostFloor ?? false;

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch("/api/proposal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysis, pricingModel: model, targetMargin, feeOverrides }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Proposal generation failed");
      onProposal(data.proposal);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Proposal generation failed");
    }
    setLoading(false);
  };

  const setOverride = (k: keyof FeeOverrides, v: string) =>
    setFees(f => ({ ...f, [k]: parseFloat(v) || 0 }));

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Select Pricing Model</h1>
      <p className={styles.subtitle}>
        Currently paying <strong className={styles.subtitleAccent}>{fmtPct2(analysis.effectiveRate)}</strong> ({fmt$(analysis.totalFees)}/mo).
        Merchant volume: <strong className={styles.subtitleStrong}>{fmt$(analysis.totalVolume)}/mo</strong>.
      </p>

      {/* Model selector */}
      <div className={styles.modelGrid}>
        {(Object.keys(MODEL_INFO) as PricingModel[]).map(m => {
          const info = MODEL_INFO[m];
          const selected = model === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => setModel(m)}
              className={styles.modelCard}
              style={selected ? { borderColor: TONE_BORDER[info.tone], background: TONE_BG[info.tone] } : undefined}
            >
              <div className={styles.modelHeader}>
                <span className={styles.modelDot} style={selected ? { borderColor: TONE_BORDER[info.tone], background: TONE_BORDER[info.tone] } : undefined} />
                <span className={`${styles.modelName} ${selected ? TONE_CLASS[info.tone] : ""}`}>{info.name}</span>
              </div>
              <p className={styles.modelDesc}>{info.desc}</p>
            </button>
          );
        })}
      </div>

      <div className={styles.layout}>
        {/* Left: Rates preview */}
        <div>
          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>Computed Rates</h2>
            {!pricing ? (
              <div className={styles.calculating}>Calculating…</div>
            ) : (
              <>
                {model === "flat-rate" && (
                  <div className={styles.rateGrid}>
                    <div className={styles.box}>
                      <div className={styles.boxLabel}>All Cards</div>
                      <div className={`${styles.boxValue} ${styles["value--info"]}`}>{fmtPct2(pricing.flatRate)}</div>
                      <div className={styles.boxSub}>+ ${(feeOverrides.perTxnFee || 0).toFixed(2)}/txn</div>
                    </div>
                  </div>
                )}
                {model === "2-tier" && (
                  <div className={styles.rateGrid}>
                    <div className={styles.box}>
                      <div className={styles.boxLabel}>Card Present</div>
                      <div className={`${styles.boxValue} ${styles["value--info"]}`}>{fmtPct2(pricing.cpRate)}</div>
                      <div className={styles.boxSub}>+ ${(feeOverrides.cpPerTxnFee || 0).toFixed(2)}/txn</div>
                    </div>
                    <div className={styles.box}>
                      <div className={styles.boxLabel}>Card Not Present</div>
                      <div className={`${styles.boxValue} ${styles["value--warning"]}`}>{fmtPct2(pricing.cnpRate)}</div>
                      <div className={styles.boxSub}>+ ${(feeOverrides.cnpPerTxnFee || 0).toFixed(2)}/txn</div>
                    </div>
                  </div>
                )}
                {model === "interchange-plus" && (
                  <div className={styles.rateGrid}>
                    <div className={styles.box}>
                      <div className={styles.boxLabel}>Markup (BPS)</div>
                      <div className={`${styles.boxValue} ${styles["value--success"]}`}>{pricing.bps} BPS</div>
                      <div className={styles.boxSub}>above interchange</div>
                    </div>
                    <div className={styles.box}>
                      <div className={styles.boxLabel}>Per Transaction</div>
                      <div className={`${styles.boxValue} ${styles["value--info"]}`}>${(feeOverrides.perTxnFee || pricing.perTxnFee || 0).toFixed(2)}</div>
                      <div className={styles.boxSub}>auth fee</div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Fee projection */}
          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>Fee Projection</h2>
            <div className={styles.projectionGrid}>
              {[
                { lbl: "Projected Fees", val: pricing ? fmt$(pricing.projectedMonthlyFees) : "—", tone: styles["value--info"] },
                { lbl: "Monthly Savings", val: pricing ? fmt$(savings) : "—", tone: styles["value--success"] },
                { lbl: "Annual Savings", val: pricing ? fmt$(savings * 12) : "—", tone: styles["value--success"] },
                { lbl: "New Effective Rate", val: pricing ? fmtPct2(pricing.projectedMonthlyFees / vol) : "—", tone: "" },
              ].map(m => (
                <div key={m.lbl} className={styles.box}>
                  <div className={`${styles.boxValue} ${styles["boxValue--metric"]} ${m.tone}`}>{m.val}</div>
                  <div className={styles.boxSub}>{m.lbl}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Controls */}
        <div className={styles.layoutSide}>
          {/* Margin target */}
          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>AIO Margin Target</h2>
            <div>
              <div className={styles.sliderHeader}>
                <span className={styles.sliderLabel}>Target</span>
                <span className={styles.sliderValue}>{fmtPct2(targetMargin)}</span>
              </div>
              <input
                type="range" min="0.001" max="0.04" step="0.0005"
                value={targetMargin}
                onChange={e => { setTarget(parseFloat(e.target.value)); setManual(""); }}
              />
              <div className={styles.sliderTicks}>
                <span>0.10%</span><span>4.00%</span>
              </div>
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Manual input (%)</label>
              <input
                type="number" min="0.01" max="4" step="0.01" placeholder="e.g. 0.80"
                value={manualTarget}
                onChange={e => { setManual(e.target.value); const v = parseFloat(e.target.value); if (!isNaN(v)) setTarget(v / 100); }}
                className={styles.input}
              />
            </div>
            {pricing && (
              <>
                <div className={styles.miniRow}>
                  <span className={styles.miniRowLabel}>AIO Revenue</span>
                  <span className={`${styles.miniRowValue} ${styles["value--accent"]}`}>{fmt$(pricing.aioRevenue)}/mo</span>
                </div>
                {pricing.adyenCostRate != null && (
                  <>
                    <div className={styles.miniRow}>
                      <span className={styles.miniRowLabel}>− {activeProcessor?.name || "Processor"} Cost</span>
                      <span className={`${styles.miniRowValue} ${styles["value--warning"]}`}>{fmtPct2(pricing.adyenCostRate)}</span>
                    </div>
                    <div className={styles.miniRow}>
                      <span className={styles.miniRowLabel}>= Net Margin to AIO</span>
                      <span className={`${styles.miniRowValue} ${belowFloor ? styles["value--danger"] : styles["value--success"]}`}>{fmtPct2(targetMargin - pricing.adyenCostRate)}</span>
                    </div>
                  </>
                )}
                {belowFloor && (
                  <div className={styles.alertDanger}>
                    <strong>Below Cost Floor.</strong> This margin would lose AIO money on this deal — raise your target.
                  </div>
                )}
                {pricing.marginFloor > pricing.aioRevenue && (
                  <div className={styles.alertDanger}>
                    Below minimum MRR floor of {fmt$(pricing.marginFloor)}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Fee overrides */}
          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>Fee Overrides</h2>
            {model === "2-tier" ? (
              <>
                <div className={styles.fieldGroup} style={{ marginTop: 0 }}>
                  <label className={styles.fieldLabel}>CP Per-Txn ($)</label>
                  <input type="number" step="0.01" value={feeOverrides.cpPerTxnFee || ""} onChange={e => setOverride("cpPerTxnFee", e.target.value)} placeholder="0.10" className={styles.input} />
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>CNP Per-Txn ($)</label>
                  <input type="number" step="0.01" value={feeOverrides.cnpPerTxnFee || ""} onChange={e => setOverride("cnpPerTxnFee", e.target.value)} placeholder="0.15" className={styles.input} />
                </div>
              </>
            ) : (
              <div className={styles.fieldGroup} style={{ marginTop: 0 }}>
                <label className={styles.fieldLabel}>Per-Txn ($)</label>
                <input type="number" step="0.01" value={feeOverrides.perTxnFee || ""} onChange={e => setOverride("perTxnFee", e.target.value)} placeholder="0.10" className={styles.input} />
              </div>
            )}
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Monthly Fee ($)</label>
              <input type="number" step="1" value={feeOverrides.monthlyFee || ""} onChange={e => setOverride("monthlyFee", e.target.value)} placeholder="0" className={styles.input} />
            </div>
          </div>
        </div>
      </div>

      {error && <div className={styles.alertDanger} style={{ marginTop: "var(--space-md)" }}>{error}</div>}

      <div className={styles.actions}>
        <button className={styles.btnGhost} onClick={onBack}>← Re-analyze</button>
        <button
          className={styles.btnPrimary}
          style={{ opacity: (loading || belowFloor || !pricing) ? 0.6 : 1 }}
          disabled={loading || belowFloor || !pricing}
          onClick={generate}
        >
          {loading ? "Generating Proposal…" : belowFloor ? "Below Cost Floor" : "Generate Proposal →"}
        </button>
      </div>
    </div>
  );
}
