"use client";

import { useState, useCallback, useEffect } from "react";
import { derivePricing } from "@/lib/pricing";
import { fmt$, fmtPct2 } from "@/lib/utils";
import type { StatementAnalysis, ProposalOutput, Processor, ProcessorTier } from "@/types/merchant";
import type { FeeOverrides } from "@/lib/pricing";

const T = { green: "#22c55e", blue: "#0ea5e9", gold: "#f59e0b", red: "#ef4444", accent: "#f9674e", muted: "#64748b", white: "#e2e8f0", card: "#0f1628", cardBorder: "#1e2d45" };

type PricingModel = "flat-rate" | "2-tier" | "interchange-plus";

type Props = {
  analysis: StatementAnalysis;
  activeProcessor: Processor | null;
  activeTier: ProcessorTier | null;
  onBack: () => void;
  onProposal: (proposal: ProposalOutput, model: PricingModel, margin: number) => void;
};

const MODEL_INFO: Record<PricingModel, { name: string; desc: string; color: string }> = {
  "flat-rate": { name: "Flat Rate", desc: "One rate for all card types. Simple and predictable — best for high-volume retail.", color: T.blue },
  "2-tier": { name: "2-Tier", desc: "Separate card-present and card-not-present rates. Best for mixed-environment merchants.", color: T.gold },
  "interchange-plus": { name: "Interchange Plus", desc: "Cost + fixed markup above interchange. Most transparent — ideal for large merchants.", color: T.green },
};

export default function PricingStep({ analysis, activeProcessor, activeTier, onBack, onProposal }: Props) {
  const [model, setModel]         = useState<PricingModel>("2-tier");
  const [targetMargin, setTarget] = useState(0.008);
  const [manualTarget, setManual] = useState("");
  const [feeOverrides, setFees]   = useState<FeeOverrides>({ monthlyFee: 0, perTxnFee: 0, cpPerTxnFee: 0, cnpPerTxnFee: 0 });
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const pricing = derivePricing(analysis, targetMargin, model, feeOverrides);
  const vol     = analysis.totalVolume || 1;
  const savings = (analysis.totalFees || 0) - pricing.projectedMonthlyFees;
  const savingsPct = (analysis.totalFees || 0) > 0 ? savings / (analysis.totalFees || 1) : 0;

  const card: React.CSSProperties  = { background: T.card, border: `1px solid ${T.cardBorder}`, borderRadius: 12, padding: 20 };
  const input: React.CSSProperties = { width: "100%", padding: "10px 12px", background: "#0a0f1e", border: `1px solid ${T.cardBorder}`, borderRadius: 8, color: T.white, fontSize: 14, outline: "none" };
  const btn: React.CSSProperties   = { padding: "12px 28px", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer", border: "none" };
  const label: React.CSSProperties = { fontSize: 12, color: T.muted, marginBottom: 6, display: "block" };

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
      onProposal(data.proposal, model, targetMargin);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Proposal generation failed");
    }
    setLoading(false);
  };

  const setOverride = (k: keyof FeeOverrides, v: string) =>
    setFees(f => ({ ...f, [k]: parseFloat(v) || 0 }));

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, color: T.white, marginBottom: 8 }}>Select Pricing Model</h1>
      <p style={{ fontSize: 14, color: T.muted, marginBottom: 32 }}>
        Currently paying <strong style={{ color: T.accent }}>{fmtPct2(analysis.effectiveRate)}</strong> ({fmt$(analysis.totalFees)}/mo).
        Merchant volume: <strong style={{ color: T.white }}>{fmt$(analysis.totalVolume)}/mo</strong>.
      </p>

      {/* Model selector */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 28 }}>
        {(Object.keys(MODEL_INFO) as PricingModel[]).map(m => (
          <div key={m} onClick={() => setModel(m)} style={{ ...card, cursor: "pointer", borderColor: model === m ? MODEL_INFO[m].color : T.cardBorder, background: model === m ? `${MODEL_INFO[m].color}0a` : T.card, transition: "all .15s" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{ width: 16, height: 16, borderRadius: "50%", border: `2px solid ${model === m ? MODEL_INFO[m].color : T.cardBorder}`, background: model === m ? MODEL_INFO[m].color : "transparent", flexShrink: 0 }} />
              <span style={{ fontSize: 14, fontWeight: 700, color: model === m ? MODEL_INFO[m].color : T.white }}>{MODEL_INFO[m].name}</span>
            </div>
            <p style={{ fontSize: 12, color: T.muted, lineHeight: 1.5 }}>{MODEL_INFO[m].desc}</p>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 24 }}>
        {/* Left: Rates preview */}
        <div>
          <div style={{ ...card, marginBottom: 20 }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: T.muted, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 16 }}>Computed Rates</h2>
            {model === "flat-rate" && pricing.flatRate !== undefined && (
              <div style={{ display: "flex", gap: 16 }}>
                <div style={{ flex: 1, background: "#0a0f1e", borderRadius: 8, padding: 16, textAlign: "center" as const }}>
                  <div style={{ fontSize: 11, color: T.muted, marginBottom: 8 }}>All Cards</div>
                  <div style={{ fontSize: 32, fontWeight: 800, color: T.blue }}>{fmtPct2(pricing.flatRate!)}</div>
                  <div style={{ fontSize: 12, color: T.muted, marginTop: 6 }}>+ ${(feeOverrides.perTxnFee || 0).toFixed(2)}/txn</div>
                </div>
              </div>
            )}
            {model === "2-tier" && (
              <div style={{ display: "flex", gap: 16 }}>
                <div style={{ flex: 1, background: "#0a0f1e", borderRadius: 8, padding: 16, textAlign: "center" as const }}>
                  <div style={{ fontSize: 11, color: T.muted, marginBottom: 8 }}>Card Present</div>
                  <div style={{ fontSize: 32, fontWeight: 800, color: T.blue }}>{fmtPct2(pricing.cpRate!)}</div>
                  <div style={{ fontSize: 12, color: T.muted, marginTop: 6 }}>+ ${(feeOverrides.cpPerTxnFee || 0).toFixed(2)}/txn</div>
                </div>
                <div style={{ flex: 1, background: "#0a0f1e", borderRadius: 8, padding: 16, textAlign: "center" as const }}>
                  <div style={{ fontSize: 11, color: T.muted, marginBottom: 8 }}>Card Not Present</div>
                  <div style={{ fontSize: 32, fontWeight: 800, color: T.gold }}>{fmtPct2(pricing.cnpRate!)}</div>
                  <div style={{ fontSize: 12, color: T.muted, marginTop: 6 }}>+ ${(feeOverrides.cnpPerTxnFee || 0).toFixed(2)}/txn</div>
                </div>
              </div>
            )}
            {model === "interchange-plus" && (
              <div style={{ display: "flex", gap: 16 }}>
                <div style={{ flex: 1, background: "#0a0f1e", borderRadius: 8, padding: 16, textAlign: "center" as const }}>
                  <div style={{ fontSize: 11, color: T.muted, marginBottom: 8 }}>Markup (BPS)</div>
                  <div style={{ fontSize: 32, fontWeight: 800, color: T.green }}>{pricing.bps} BPS</div>
                  <div style={{ fontSize: 12, color: T.muted, marginTop: 6 }}>above interchange</div>
                </div>
                <div style={{ flex: 1, background: "#0a0f1e", borderRadius: 8, padding: 16, textAlign: "center" as const }}>
                  <div style={{ fontSize: 11, color: T.muted, marginBottom: 8 }}>Per Transaction</div>
                  <div style={{ fontSize: 32, fontWeight: 800, color: T.blue }}>${(feeOverrides.perTxnFee || pricing.perTxnFee || 0).toFixed(2)}</div>
                  <div style={{ fontSize: 12, color: T.muted, marginTop: 6 }}>auth fee</div>
                </div>
              </div>
            )}
          </div>

          {/* Fee projection */}
          <div style={card}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: T.muted, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 16 }}>Fee Projection</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
              {[
                { lbl: "Projected Fees", val: fmt$(pricing.projectedMonthlyFees), color: T.blue },
                { lbl: "Monthly Savings", val: fmt$(savings), color: T.green },
                { lbl: "Annual Savings", val: fmt$(savings * 12), color: T.green },
                { lbl: "New Effective Rate", val: fmtPct2(pricing.projectedMonthlyFees / vol), color: T.white },
              ].map(m => (
                <div key={m.lbl} style={{ background: "#0a0f1e", borderRadius: 8, padding: 14, textAlign: "center" as const }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: m.color }}>{m.val}</div>
                  <div style={{ fontSize: 11, color: T.muted, marginTop: 5 }}>{m.lbl}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Controls */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Margin target */}
          <div style={card}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: T.muted, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 16 }}>AIO Margin Target</h2>
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: T.muted }}>Target</span>
                <span style={{ fontSize: 20, fontWeight: 800, color: T.accent }}>{fmtPct2(targetMargin)}</span>
              </div>
              <input
                type="range" min="0.001" max="0.04" step="0.0005"
                value={targetMargin}
                onChange={e => { setTarget(parseFloat(e.target.value)); setManual(""); }}
                style={{ width: "100%", accentColor: T.accent }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.muted, marginTop: 4 }}>
                <span>0.10%</span><span>4.00%</span>
              </div>
            </div>
            <div>
              <label style={label}>Manual input (%)</label>
              <input
                type="number" min="0.01" max="4" step="0.01" placeholder="e.g. 0.80"
                value={manualTarget}
                onChange={e => { setManual(e.target.value); const v = parseFloat(e.target.value); if (!isNaN(v)) setTarget(v / 100); }}
                style={input}
              />
            </div>
            <div style={{ marginTop: 12, padding: "10px 14px", background: "#0a0f1e", borderRadius: 8, display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, color: T.muted }}>AIO Revenue</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: T.accent }}>{fmt$(pricing.aioRevenue)}/mo</span>
            </div>
            {pricing.marginFloor > pricing.aioRevenue && (
              <div style={{ marginTop: 8, padding: "8px 12px", background: "#1c0000", borderRadius: 8, fontSize: 12, color: T.red, border: `1px solid ${T.red}40` }}>
                Below minimum MRR floor of {fmt$(pricing.marginFloor)}
              </div>
            )}
          </div>

          {/* Fee overrides */}
          <div style={card}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: T.muted, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 16 }}>Fee Overrides</h2>
            {model === "2-tier" ? (
              <>
                <div style={{ marginBottom: 12 }}>
                  <label style={label}>CP Per-Txn ($)</label>
                  <input type="number" step="0.01" value={feeOverrides.cpPerTxnFee || ""} onChange={e => setOverride("cpPerTxnFee", e.target.value)} placeholder="0.10" style={input} />
                </div>
                <div>
                  <label style={label}>CNP Per-Txn ($)</label>
                  <input type="number" step="0.01" value={feeOverrides.cnpPerTxnFee || ""} onChange={e => setOverride("cnpPerTxnFee", e.target.value)} placeholder="0.15" style={input} />
                </div>
              </>
            ) : (
              <div style={{ marginBottom: 12 }}>
                <label style={label}>Per-Txn ($)</label>
                <input type="number" step="0.01" value={feeOverrides.perTxnFee || ""} onChange={e => setOverride("perTxnFee", e.target.value)} placeholder="0.10" style={input} />
              </div>
            )}
            <div style={{ marginTop: 12 }}>
              <label style={label}>Monthly Fee ($)</label>
              <input type="number" step="1" value={feeOverrides.monthlyFee || ""} onChange={e => setOverride("monthlyFee", e.target.value)} placeholder="0" style={input} />
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ marginTop: 16, padding: "12px 16px", background: "#1c0000", border: `1px solid ${T.red}40`, borderRadius: 8, fontSize: 13, color: T.red }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
        <button style={{ ...btn, background: "#1e2d45", color: T.white }} onClick={onBack}>← Re-analyze</button>
        <button
          style={{ ...btn, background: T.accent, color: "#fff", boxShadow: "0 4px 16px rgba(249,103,78,0.3)", opacity: loading ? 0.6 : 1 }}
          disabled={loading}
          onClick={generate}
        >
          {loading ? "Generating Proposal…" : "Generate Proposal →"}
        </button>
      </div>
    </div>
  );
}
