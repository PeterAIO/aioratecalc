"use client";

import { fmt$, fmtPct, fmtPct2 } from "@/lib/utils";
import { calcAdyenCost } from "@/lib/pricing";
import type { StatementAnalysis, Processor, ProcessorTier } from "@/types/merchant";

const T = {
  green: "#22c55e", blue: "#0ea5e9", gold: "#f59e0b",
  red: "#ef4444", accent: "#f9674e", muted: "#64748b",
  white: "#e2e8f0", card: "#0f1628", cardBorder: "#1e2d45",
};

type Props = {
  analysis: StatementAnalysis;
  activeProcessor: Processor | null;
  activeTier: ProcessorTier | null;
  onBack: () => void;
  onContinue: () => void;
};

export default function AnalysisStep({ analysis, activeProcessor, activeTier, onBack, onContinue }: Props) {
  const vol = analysis.totalVolume || 1;

  const feeRows = activeTier
    ? (() => {
        const adyenCost = calcAdyenCost(activeTier, analysis.totalVolume, analysis.totalTransactions);
        const adyenRate = adyenCost / (analysis.totalVolume || 1);
        const myMarkup  = Math.max(0, (analysis.processorFees || 0) - adyenCost);
        return [
          { name: "Interchange", note: analysis.interchangeNotShown ? "Back-calculated: total − markup − other" : "Card network cost — non-negotiable", amt: analysis.interchangeFees, rate: analysis.interchangeRate, color: T.blue },
          { name: `${activeProcessor?.name} Cost`, note: "Acquirer cost: processing + txn + scheme", amt: adyenCost, rate: adyenRate, color: T.gold },
          { name: "Your Markup", note: "Processor markup above interchange & acquirer", amt: myMarkup, rate: myMarkup / (analysis.totalVolume || 1), color: T.green },
          { name: "Other Fees", note: "Monthly, PCI, misc. — pure margin", amt: analysis.otherFees, rate: (analysis.otherFees || 0) / (analysis.totalVolume || 1), color: T.green },
        ];
      })()
    : [
        { name: "Interchange", note: analysis.interchangeNotShown ? "Back-calculated from statement total" : "Pass-through", amt: analysis.interchangeFees, rate: analysis.interchangeRate, color: T.blue },
        { name: "Processor Markup", note: "Where savings are found", amt: analysis.processorFees, rate: analysis.processorMarkup, color: "#f97316" },
        { name: "Other Fees", note: "Monthly, PCI, misc. — pure margin", amt: analysis.otherFees, rate: (analysis.otherFees || 0) / (analysis.totalVolume || 1), color: T.green },
      ];

  const panel: React.CSSProperties = { maxWidth: 800, margin: "0 auto", padding: "40px 24px" };
  const card: React.CSSProperties = { background: T.card, border: `1px solid ${T.cardBorder}`, borderRadius: 12, padding: 20 };
  const btn: React.CSSProperties = { padding: "12px 28px", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer", border: "none" };

  return (
    <div style={panel}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: T.white, marginBottom: 4 }}>{analysis.merchantName || "Merchant"} — Analysis</h1>
          <p style={{ fontSize: 14, color: T.muted }}>
            {analysis.processingMonth} · {analysis.currentProcessorName} · Confidence:{" "}
            <span style={{ color: analysis.confidence === "high" ? T.green : analysis.confidence === "medium" ? T.gold : T.red, fontWeight: 600 }}>
              {analysis.confidence}
            </span>
          </p>
        </div>
        <div style={{ background: "#1e2d45", padding: "6px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700, letterSpacing: 1, color: T.muted }}>
          {analysis.currentPricingModel?.replace("-", " ").toUpperCase()}
        </div>
      </div>

      {/* IC+ back-calculated banner */}
      {analysis.interchangeNotShown && (
        <div style={{ marginBottom: 24, padding: "14px 18px", background: "#1e1b4b", border: "1px solid #6366f180", borderRadius: 10, display: "flex", gap: 12 }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>ℹ️</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#a5b4fc", marginBottom: 3 }}>
              IC+ Statement — Interchange Back-Calculated ({analysis.currentProcessorName})
            </div>
            <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.6 }}>
              This statement shows total fees but does not itemize interchange separately.
              Markup was calculated from stated rates ({fmtPct2(analysis.statedMarkupRate)} + ${(analysis.statedPerTxnFee || 0).toFixed(2)}/txn).
              <strong style={{ color: "#c7d2fe" }}> Interchange = total fees − markup − other fees</strong>.
            </div>
          </div>
        </div>
      )}

      {/* Key metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 28 }}>
        {[
          { label: "Monthly Volume", val: fmt$(analysis.totalVolume) },
          { label: "Total Fees", val: fmt$(analysis.totalFees), accent: true },
          { label: "Effective Rate", val: fmtPct2(analysis.effectiveRate), accent: true },
          { label: "Avg Ticket", val: fmt$(analysis.averageTicket) },
        ].map(m => (
          <div key={m.label} style={{ ...card, ...(m.accent ? { borderColor: `${T.accent}40`, background: `${T.accent}08` } : {}) }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: m.accent ? T.accent : T.white, marginBottom: 4 }}>{m.val}</div>
            <div style={{ fontSize: 12, color: T.muted }}>{m.label}</div>
          </div>
        ))}
      </div>

      {/* Fee structure */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 13, fontWeight: 700, color: T.muted, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 16 }}>Fee Structure — 3-Way Split</h2>
        <div style={{ ...card, padding: 0, overflow: "hidden" }}>
          {feeRows.map(r => (
            <div key={r.name} style={{ display: "grid", gridTemplateColumns: "1fr auto auto 120px", gap: 16, alignItems: "center", padding: "14px 20px", borderBottom: `1px solid ${T.cardBorder}` }}>
              <div>
                <span style={{ color: r.color, fontWeight: 600, fontSize: 14 }}>{r.name}</span>
                <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{r.note}</div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.white, textAlign: "right" as const }}>{fmt$(r.amt)}</div>
              <div style={{ fontSize: 13, color: T.muted, textAlign: "right" as const }}>{fmtPct(r.rate)}</div>
              <div style={{ height: 6, background: "#1e2d45", borderRadius: 3 }}>
                <div style={{ height: "100%", borderRadius: 3, background: r.color, width: `${Math.min(((r.amt || 0) / (analysis.totalFees || 1)) * 100, 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Highlight box */}
      <div style={{ ...card, display: "flex", gap: 32, flexWrap: "wrap", justifyContent: "space-between", marginBottom: 28, borderColor: `${T.green}30`, background: `${T.green}06` }}>
        <div>
          <div style={{ fontSize: 12, color: T.green, letterSpacing: 1.5, textTransform: "uppercase" as const, marginBottom: 8 }}>Total Gross Margin Above Interchange</div>
          <div style={{ fontSize: 40, fontWeight: 900, color: T.green }}>{fmtPct2(analysis.currentMargin || 0)}</div>
          <div style={{ fontSize: 13, color: T.muted, marginTop: 6 }}>Everything the merchant pays above interchange</div>
        </div>
        <div style={{ display: "flex", gap: 28, alignItems: "center" }}>
          {[
            { val: fmt$((analysis.processorFees || 0) + (analysis.otherFees || 0)), lbl: "Monthly Gross" },
            { val: fmt$(((analysis.processorFees || 0) + (analysis.otherFees || 0)) * 12), lbl: "Annual Gross" },
          ].map((s, i) => (
            <div key={i} style={{ textAlign: "center" as const }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: T.white }}>{s.val}</div>
              <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>{s.lbl}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Volume mix */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 13, fontWeight: 700, color: T.muted, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 16 }}>Volume Mix</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
          {[
            { label: "Card Present", pct: analysis.cardPresentPct, amt: analysis.cardPresentVolume },
            { label: "Card Not Present", pct: analysis.cardNotPresentPct, amt: analysis.cardNotPresentVolume },
            { label: "Reward Cards", pct: analysis.rewardCardPct, amt: vol * (analysis.rewardCardPct || 0) },
            { label: "Corporate Cards", pct: analysis.corporateCardPct, amt: vol * (analysis.corporateCardPct || 0) },
          ].map(m => (
            <div key={m.label} style={card}>
              <div style={{ fontSize: 12, color: T.muted, marginBottom: 6 }}>{m.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: T.white, marginBottom: 4 }}>{fmtPct2(m.pct || 0)}</div>
              <div style={{ fontSize: 12, color: T.muted }}>{fmt$(m.amt)}</div>
            </div>
          ))}
        </div>
      </div>

      {analysis.notes && (
        <div style={{ padding: "12px 16px", background: "#0f1628", border: "1px solid #1e2d45", borderRadius: 8, fontSize: 13, color: T.muted, marginBottom: 24 }}>
          <strong style={{ color: T.white }}>AI Notes:</strong> {analysis.notes}
        </div>
      )}

      <div style={{ display: "flex", gap: 12 }}>
        <button style={{ ...btn, background: "#1e2d45", color: T.white }} onClick={onBack}>← Re-upload</button>
        <button style={{ ...btn, background: T.accent, color: "#fff", boxShadow: "0 4px 16px rgba(249,103,78,0.3)" }} onClick={onContinue}>Select Pricing Model →</button>
      </div>
    </div>
  );
}
