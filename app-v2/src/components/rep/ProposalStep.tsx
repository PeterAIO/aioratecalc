"use client";

import { fmt$, fmtPct2 } from "@/lib/utils";
import type { StatementAnalysis, ProposalOutput, Processor, ProcessorTier } from "@/types/merchant";

const T = { green: "#22c55e", blue: "#0ea5e9", red: "#ef4444", accent: "#f9674e", muted: "#64748b", white: "#e2e8f0", card: "#0f1628", cardBorder: "#1e2d45" };

type Props = {
  analysis: StatementAnalysis;
  proposal: ProposalOutput;
  activeProcessor: Processor | null;
  activeTier: ProcessorTier | null;
  targetMargin: number;
  netMargin: number;
  onBack: () => void;
  onApply: () => void;
  onNewProposal: () => void;
};

export default function ProposalStep({ analysis, proposal, targetMargin, netMargin, onBack, onApply, onNewProposal }: Props) {
  const pVol = analysis.totalVolume || 1;
  const currentEffRate  = (analysis.totalFees || 0) / pVol;
  const proposedEffRate = (proposal.projectedFees?.monthly || 0) / pVol;
  const savingsMonthly  = (analysis.totalFees || 0) - (proposal.projectedFees?.monthly || 0);
  const savingsAnnual   = savingsMonthly * 12;
  const savingsPct      = (analysis.totalFees || 0) > 0 ? savingsMonthly / (analysis.totalFees || 1) : 0;

  const panel: React.CSSProperties  = { maxWidth: 800, margin: "0 auto", padding: "40px 24px" };
  const card: React.CSSProperties   = { background: T.card, border: `1px solid ${T.cardBorder}`, borderRadius: 12, padding: 20 };
  const btn: React.CSSProperties    = { padding: "12px 28px", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer", border: "none" };
  const rateCard: React.CSSProperties = { ...card, textAlign: "center" as const };

  const printProposal = () => {
    const fmtP2 = (n: number) => `${((n || 0) * 100).toFixed(2)}%`;
    const fmtD  = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n || 0);
    const rates = proposal.proposedRates;
    const prepDate = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    const safeName = (analysis.merchantName || "Merchant").replace(/[^a-zA-Z0-9]/g, "-");
    const dateStr  = new Date().toISOString().slice(0, 10);
    const fileName = "AIO-Proposal-" + safeName + "-" + dateStr + ".pdf";

    let ratesHtml = "";
    if (proposal.pricingModel === "flat-rate" && rates.pricingModel === "flat-rate") {
      ratesHtml = `<div class="rate-card"><div class="rate-lbl">All Cards</div><div class="rate-val">${fmtP2(rates.flatRate)}</div><div class="rate-sub">single flat rate</div></div>`
        + `<div class="rate-card"><div class="rate-lbl">Per Transaction</div><div class="rate-val">$${(rates.perTransaction || 0).toFixed(2)}</div><div class="rate-sub">auth fee</div></div>`;
    } else if (proposal.pricingModel === "2-tier" && rates.pricingModel === "2-tier") {
      ratesHtml = `<div class="rate-card"><div class="rate-lbl">Card Present</div><div class="rate-val">${fmtP2(rates.cardPresentRate)}</div><div class="rate-sub">+ $${(rates.cardPresentPerTxn || 0).toFixed(2)}/txn</div></div>`
        + `<div class="rate-card"><div class="rate-lbl">Card Not Present</div><div class="rate-val">${fmtP2(rates.cardNotPresentRate)}</div><div class="rate-sub">+ $${(rates.cardNotPresentPerTxn || 0).toFixed(2)}/txn</div></div>`;
    } else if (rates.pricingModel === "interchange-plus") {
      ratesHtml = `<div class="rate-card"><div class="rate-lbl">Markup</div><div class="rate-val">${rates.basisPoints} BPS</div><div class="rate-sub">above interchange</div></div>`
        + `<div class="rate-card"><div class="rate-lbl">Per Transaction</div><div class="rate-val">$${(rates.perTransaction || 0).toFixed(2)}</div><div class="rate-sub">auth fee</div></div>`;
    }
    if ((rates as { monthlyFee?: number }).monthlyFee) {
      ratesHtml += `<div class="rate-card"><div class="rate-lbl">Monthly Fee</div><div class="rate-val">${fmtD((rates as { monthlyFee?: number }).monthlyFee || 0)}</div><div class="rate-sub">service fee</div></div>`;
    }

    const vpItems = [
      "One platform for payments, POS, and operations—no more disconnected systems",
      "Clear, predictable pricing with immediate annual savings of " + fmtD(savingsAnnual),
      "Real-time visibility into sales, costs, and performance across your business",
      "Less manual work for your team through automation and AI-powered workflows",
    ];
    const kvHtml = vpItems.map((t, i) =>
      `<div class="vp"><span class="vp-num">${String(i + 1).padStart(2, "0")}</span><span>${t}</span></div>`
    ).join("");

    const exportScript = "<scr" + "ipt src=\"https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js\"><\/" + "scr" + "ipt>"
      + "<scr" + "ipt>"
      + "function exportPDF(){"
      + "var wrap=document.getElementById('pdf-btn-wrap');wrap.style.visibility='hidden';"
      + "html2pdf().set({margin:[10,10,10,10],filename:'" + fileName + "',"
      + "image:{type:'jpeg',quality:0.98},"
      + "html2canvas:{scale:2,useCORS:true,logging:false,backgroundColor:'#ffffff'},"
      + "jsPDF:{unit:'mm',format:'letter',orientation:'portrait'}})"
      + ".from(document.body).save().then(function(){wrap.style.visibility='visible';});}"
      + "<\/" + "scr" + "ipt>";

    const html = "<!DOCTYPE html><html><head><meta charset=\"UTF-8\"/>"
      + "<title>AIO Proposal — " + analysis.merchantName + "</title>"
      + "<style>*{box-sizing:border-box;margin:0;padding:0}"
      + "body{font-family:Helvetica Neue,Arial,sans-serif;color:#1a1a1a;background:#fff;padding:48px;font-size:14px;line-height:1.5}"
      + ".header{display:flex;align-items:center;justify-content:space-between;margin-bottom:40px;padding-bottom:24px;border-bottom:2px solid #e8614a}"
      + ".logo-text{font-size:22px;font-weight:800;letter-spacing:2px;color:#1a1a1a}"
      + ".logo-sub{font-size:11px;color:#888;letter-spacing:3px;text-transform:uppercase}"
      + ".date{font-size:12px;color:#888}"
      + ".proposal-badge{display:inline-block;background:#e8614a;color:#fff;font-size:10px;letter-spacing:3px;padding:4px 14px;border-radius:20px;margin-bottom:12px}"
      + ".merchant-name{font-size:36px;font-weight:800;margin-bottom:6px}"
      + ".summary{font-size:15px;color:#555;margin-bottom:40px;max-width:600px;line-height:1.7}"
      + ".savings-box{background:#f0faf4;border:1.5px solid #22c55e;border-radius:12px;padding:28px 32px;display:flex;gap:40px;align-items:center;margin-bottom:36px}"
      + ".savings-big{font-size:48px;font-weight:900;color:#16a34a;line-height:1}"
      + ".savings-lbl{font-size:11px;color:#16a34a;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px}"
      + ".stat-val{font-size:20px;font-weight:700}"
      + ".stat-lbl{font-size:11px;color:#888;margin-top:3px}"
      + ".section{margin-bottom:36px}"
      + "h2{font-size:11px;font-weight:700;color:#888;letter-spacing:2px;text-transform:uppercase;margin:0 0 14px}"
      + ".rates-grid{display:flex;gap:14px;flex-wrap:wrap}"
      + ".rate-card{background:#f7f7f7;border-radius:8px;padding:18px 20px;min-width:140px;text-align:center}"
      + ".rate-lbl{font-size:10px;color:#888;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px}"
      + ".rate-val{font-size:26px;font-weight:800;color:#e8614a}"
      + ".rate-sub{font-size:11px;color:#888;margin-top:5px}"
      + "table{width:100%;border-collapse:collapse}"
      + "th{text-align:left;font-size:11px;color:#888;letter-spacing:1px;text-transform:uppercase;padding:10px 16px;background:#f7f7f7}"
      + "td{padding:12px 16px;border-bottom:1px solid #eee}"
      + ".red{color:#dc2626;font-weight:600}.blue{color:#2563eb;font-weight:600}.green{color:#16a34a;font-weight:700}"
      + ".vp-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}"
      + ".vp{background:#f7f7f7;border-radius:8px;padding:14px 16px;display:flex;gap:12px}"
      + ".vp-num{font-size:18px;font-weight:800;color:#e8614a;opacity:0.5;flex-shrink:0}"
      + ".footer{margin-top:48px;padding-top:20px;border-top:1px solid #eee;font-size:11px;color:#aaa;display:flex;justify-content:space-between}"
      + "</style></head><body>"
      + "<div class=\"header\"><div><div class=\"logo-text\">AIO</div><div class=\"logo-sub\">Proposal Engine</div></div><div class=\"date\">Prepared " + prepDate + "</div></div>"
      + "<div class=\"proposal-badge\">MERCHANT PROPOSAL</div>"
      + "<div class=\"merchant-name\">" + analysis.merchantName + "</div>"
      + "<div class=\"summary\">" + (proposal.proposalSummary || "") + "</div>"
      + "<div class=\"savings-box\"><div>"
      + "<div class=\"savings-lbl\">Annual Savings</div>"
      + "<div class=\"savings-big\">" + fmtD(savingsAnnual) + "</div>"
      + "</div><div style=\"display:flex;gap:28px;align-items:center\">"
      + "<div class=\"stat\"><div class=\"stat-val\">" + fmtD(savingsMonthly) + "</div><div class=\"stat-lbl\">Monthly Savings</div></div>"
      + "<div class=\"stat\"><div class=\"stat-val\">" + fmtP2(proposedEffRate) + "</div><div class=\"stat-lbl\">New Effective Rate</div></div>"
      + "<div class=\"stat\"><div class=\"stat-val\">" + fmtP2(currentEffRate) + "</div><div class=\"stat-lbl\">Current Rate</div></div>"
      + "</div></div>"
      + "<div class=\"section\"><h2>Proposed Pricing</h2><div class=\"rates-grid\">" + ratesHtml + "</div></div>"
      + "<div class=\"section\"><h2>Fee Comparison</h2><table><thead><tr><th>Category</th><th>Current</th><th>Proposed</th><th>Savings</th></tr></thead><tbody>"
      + "<tr><td>Monthly Fees</td><td class=\"red\">" + fmtD(analysis.totalFees) + "</td><td class=\"blue\">" + fmtD(proposal.projectedFees?.monthly) + "</td><td class=\"green\">" + fmtD(savingsMonthly) + "</td></tr>"
      + "<tr><td>Annual Fees</td><td class=\"red\">" + fmtD((analysis.totalFees || 0) * 12) + "</td><td class=\"blue\">" + fmtD((proposal.projectedFees?.monthly || 0) * 12) + "</td><td class=\"green\">" + fmtD(savingsAnnual) + "</td></tr>"
      + "<tr><td>Effective Rate</td><td class=\"red\">" + fmtP2(currentEffRate) + "</td><td class=\"blue\">" + fmtP2(proposedEffRate) + "</td><td class=\"green\">" + fmtP2(currentEffRate - proposedEffRate) + "</td></tr>"
      + "</tbody></table></div>"
      + "<div class=\"section\"><h2>Key Value Points</h2><div class=\"vp-grid\">" + kvHtml + "</div></div>"
      + "<div class=\"footer\"><span>AIO — AI for Restaurants</span><span>aioapp.com</span></div>"
      + "<div id=\"pdf-btn-wrap\" style=\"position:fixed;top:20px;right:20px;z-index:9999;\">"
      + "<button onclick=\"exportPDF()\" style=\"background:#e8614a;color:#fff;border:none;border-radius:8px;padding:11px 22px;font-size:14px;font-weight:700;cursor:pointer;\">⬇ Export as PDF</button></div>"
      + exportScript
      + "</body></html>";

    const blob = new Blob([html], { type: "text/html" });
    const url  = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const rates = proposal.proposedRates;

  return (
    <div style={panel}>
      {/* Hero */}
      <div style={{ textAlign: "center", marginBottom: 48, paddingTop: 16 }}>
        <div style={{ display: "inline-block", background: T.accent, color: "#fff", fontSize: 10, letterSpacing: 3, padding: "4px 14px", borderRadius: 20, marginBottom: 14 }}>MERCHANT PROPOSAL</div>
        <h1 style={{ fontSize: 38, fontWeight: 800, color: T.white, marginBottom: 12, letterSpacing: -0.5 }}>{analysis.merchantName || "Merchant"}</h1>
        <p style={{ fontSize: 15, color: T.muted, maxWidth: 560, margin: "0 auto", lineHeight: 1.7 }}>{proposal.proposalSummary}</p>
      </div>

      {/* Savings hero */}
      <div style={{ ...card, display: "flex", gap: 32, flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", marginBottom: 28, borderColor: `${T.green}30`, background: `${T.green}06` }}>
        <div>
          <div style={{ fontSize: 11, color: T.green, letterSpacing: 2, textTransform: "uppercase" as const, marginBottom: 10 }}>Annual Savings for Merchant</div>
          <div style={{ fontSize: 52, fontWeight: 900, color: T.green, lineHeight: 1 }}>{fmt$(savingsAnnual)}</div>
          <div style={{ fontSize: 13, color: T.green + "80", marginTop: 8 }}>{fmtPct2(Math.abs(savingsPct))} reduction in costs</div>
        </div>
        <div style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
          {[
            { val: fmt$(savingsMonthly), lbl: "Monthly Savings" },
            { val: fmtPct2(proposedEffRate), lbl: "New Effective Rate" },
            { val: fmtPct2(currentEffRate), lbl: "Current Rate" },
          ].map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 24 }}>
              {i > 0 && <div style={{ width: 1, height: 40, background: T.cardBorder }} />}
              <div style={{ textAlign: "center" as const }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: T.white }}>{s.val}</div>
                <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>{s.lbl}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Proposed rates */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 13, fontWeight: 700, color: T.muted, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 16 }}>Proposed Rates</h2>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {rates.pricingModel === "2-tier" && (
            <>
              <div style={rateCard}><div style={{ fontSize: 11, color: T.muted, marginBottom: 6 }}>Card Present</div><div style={{ fontSize: 28, fontWeight: 800, color: T.accent }}>{fmtPct2(rates.cardPresentRate)}</div><div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>+${(rates.cardPresentPerTxn || 0).toFixed(2)}/txn</div></div>
              <div style={rateCard}><div style={{ fontSize: 11, color: T.muted, marginBottom: 6 }}>Card Not Present</div><div style={{ fontSize: 28, fontWeight: 800, color: T.blue }}>{fmtPct2(rates.cardNotPresentRate)}</div><div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>+${(rates.cardNotPresentPerTxn || 0).toFixed(2)}/txn</div></div>
            </>
          )}
          {rates.pricingModel === "interchange-plus" && (
            <>
              <div style={rateCard}><div style={{ fontSize: 11, color: T.muted, marginBottom: 6 }}>Markup</div><div style={{ fontSize: 28, fontWeight: 800, color: T.accent }}>{rates.basisPoints} BPS</div><div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>above interchange</div></div>
              <div style={rateCard}><div style={{ fontSize: 11, color: T.muted, marginBottom: 6 }}>Per Transaction</div><div style={{ fontSize: 28, fontWeight: 800, color: T.blue }}>${(rates.perTransaction || 0).toFixed(2)}</div><div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>auth fee</div></div>
            </>
          )}
          {rates.pricingModel === "flat-rate" && (
            <>
              <div style={rateCard}><div style={{ fontSize: 11, color: T.muted, marginBottom: 6 }}>All Cards</div><div style={{ fontSize: 28, fontWeight: 800, color: T.accent }}>{fmtPct2(rates.flatRate)}</div><div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>single flat rate</div></div>
              <div style={rateCard}><div style={{ fontSize: 11, color: T.muted, marginBottom: 6 }}>Per Transaction</div><div style={{ fontSize: 28, fontWeight: 800, color: T.blue }}>${(rates.perTransaction || 0).toFixed(2)}</div><div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>auth fee</div></div>
            </>
          )}
          {((rates as { monthlyFee?: number }).monthlyFee ?? 0) > 0 && (
            <div style={rateCard}><div style={{ fontSize: 11, color: T.muted, marginBottom: 6 }}>Monthly</div><div style={{ fontSize: 28, fontWeight: 800, color: T.muted }}>{fmt$((rates as { monthlyFee: number }).monthlyFee)}</div><div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>platform fee</div></div>
          )}
        </div>
      </div>

      {/* Fee comparison */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 13, fontWeight: 700, color: T.muted, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 16 }}>Fee Comparison</h2>
        <div style={{ ...card, padding: 0, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", background: "#0a0f1e", padding: "12px 20px" }}>
            {["Category", "Current", "Proposed", "Savings"].map(h => (
              <div key={h} style={{ fontSize: 11, fontWeight: 700, color: T.muted, letterSpacing: 1, textTransform: "uppercase" as const }}>{h}</div>
            ))}
          </div>
          {[
            { cat: "Monthly Processing Fees", current: analysis.totalFees, proposed: proposal.projectedFees?.monthly, savings: savingsMonthly },
            { cat: "Annual Processing Fees", current: (analysis.totalFees || 0) * 12, proposed: (proposal.projectedFees?.monthly || 0) * 12, savings: savingsAnnual },
          ].map((r, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", padding: "14px 20px", borderTop: `1px solid ${T.cardBorder}` }}>
              <div style={{ fontSize: 14, color: T.white }}>{r.cat}</div>
              <div style={{ color: T.red, fontWeight: 600 }}>{fmt$(r.current)}</div>
              <div style={{ color: T.blue, fontWeight: 600 }}>{fmt$(r.proposed)}</div>
              <div style={{ color: T.green, fontWeight: 700 }}>{fmt$(r.savings)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Apply CTA */}
      <div style={{ ...card, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 20, marginBottom: 28, borderColor: `${T.blue}30`, background: "linear-gradient(135deg,#0a1628,#0f1e3d)" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: T.white, marginBottom: 6 }}>Ready to move forward?</div>
          <div style={{ fontSize: 14, color: T.muted }}>Complete the processing application to get {analysis.merchantName || "this merchant"} onboarded with AIO.</div>
        </div>
        <button style={{ padding: "14px 32px", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: "pointer", border: "none", background: "linear-gradient(135deg,#0ea5e9,#0284c7)", color: "#fff", boxShadow: "0 6px 24px rgba(14,165,233,0.35)", flexShrink: 0 }} onClick={onApply}>
          Apply for Processing →
        </button>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button style={{ ...btn, background: "#1e2d45", color: T.white }} onClick={onBack}>← Adjust Pricing</button>
        <button style={{ ...btn, background: T.accent, color: "#fff" }} onClick={printProposal}>Generate Customer Proposal</button>
        <button style={{ ...btn, background: "transparent", color: T.muted, border: `1px solid ${T.cardBorder}` }} onClick={onNewProposal}>New Proposal</button>
      </div>
    </div>
  );
}
