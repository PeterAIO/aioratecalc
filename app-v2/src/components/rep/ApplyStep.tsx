"use client";

import { useState } from "react";
import { LocalStorageAdapter } from "@/lib/storage/localStorageAdapter";
import type { MerchantApplication, BusinessInfo, OwnerContact, ProcessingInfo, AgreementInfo } from "@/types/merchant";

const T = { green: "#22c55e", blue: "#0ea5e9", red: "#ef4444", accent: "#f9674e", muted: "#64748b", white: "#e2e8f0", card: "#0f1628", cardBorder: "#1e2d45" };

type Props = {
  app: MerchantApplication;
  onSaved: (app: MerchantApplication) => void;
  onBack: () => void;
  onNewProposal: () => void;
};

const CARD: React.CSSProperties  = { background: T.card, border: `1px solid ${T.cardBorder}`, borderRadius: 12, padding: 24, marginBottom: 20 };
const LABEL: React.CSSProperties = { fontSize: 12, color: T.muted, marginBottom: 6, display: "block" };
const INPUT: React.CSSProperties = { width: "100%", padding: "10px 12px", background: "#0a0f1e", border: `1px solid ${T.cardBorder}`, borderRadius: 8, color: "#e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box" as const };
const GRID2: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 };
const SEC: React.CSSProperties   = { fontSize: 16, fontWeight: 700, color: T.white, marginBottom: 16 };

export default function ApplyStep({ app, onSaved, onBack, onNewProposal }: Props) {
  const initial = app.analysis;
  const [biz, setBiz] = useState<Partial<BusinessInfo>>(app.business || {
    legalName: initial?.merchantName || "", dba: initial?.merchantName || "",
    bizType: "llc", address: "", city: "", state: "", zip: "",
    phone: "", website: "", yearsInBusiness: "", annualRevenue: "",
  });
  const [owner, setOwner] = useState<Partial<OwnerContact>>(app.ownerContact || { firstName: "", lastName: "", title: "Owner", email: "", phone: "" });
  const [proc, setProc]   = useState<Partial<ProcessingInfo>>(app.processing || {
    monthlyVolume: String(Math.round(initial?.totalVolume || 0)),
    avgTicket: String(Math.round(initial?.averageTicket || 0)),
    cardPresentPct: String(Math.round((initial?.cardPresentPct || 0) * 100)),
    mcc: "", businessDescription: "", previouslyTerminated: "no", bankruptcy: "no",
    currentProcessor: initial?.currentProcessorName || "",
  });
  const [agree, setAgree] = useState<Partial<AgreementInfo>>({ sigName: "", sigDate: "", termsAccepted: false, electronicConsentAccepted: false });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [err, setErr]       = useState<string | null>(null);

  const b = <T extends Record<string, unknown>>(setter: (fn: (prev: T) => T) => void) =>
    (k: keyof T) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setter((prev: T) => ({ ...prev, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value } as T));

  const setBizF  = b<Partial<BusinessInfo>>(setBiz as Parameters<typeof b>[0]);
  const setOwnerF = b<Partial<OwnerContact>>(setOwner as Parameters<typeof b>[0]);
  const setProcF = b<Partial<ProcessingInfo>>(setProc as Parameters<typeof b>[0]);
  const setAgreeF = b<Partial<AgreementInfo>>(setAgree as Parameters<typeof b>[0]);

  const handleSave = async () => {
    if (!agree.termsAccepted || !agree.electronicConsentAccepted) {
      setErr("Both checkboxes are required to submit the application.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const storage = new LocalStorageAdapter();
      const updated: MerchantApplication = {
        ...app,
        stage: "proposal_sent",
        updatedAt: new Date().toISOString(),
        business: biz as BusinessInfo,
        ownerContact: owner as OwnerContact,
        processing: proc as ProcessingInfo,
        agreement: agree as AgreementInfo,
      };
      await storage.saveApplication(updated);
      setSaved(true);
      onSaved(updated);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    }
    setSaving(false);
  };

  const input = (label: string, val: string, onChange: (e: React.ChangeEvent<HTMLInputElement>) => void, placeholder = "", type = "text") => (
    <div>
      <label style={LABEL}>{label}</label>
      <input type={type} value={val} onChange={onChange} placeholder={placeholder} style={INPUT} />
    </div>
  );

  if (saved) {
    return (
      <div style={{ maxWidth: 600, margin: "80px auto", padding: "0 24px", textAlign: "center" }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>✓</div>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: T.green, marginBottom: 12 }}>Application Saved</h1>
        <p style={{ fontSize: 15, color: T.muted, marginBottom: 32, lineHeight: 1.7 }}>
          The merchant application for <strong style={{ color: T.white }}>{biz.dba || biz.legalName}</strong> has been saved.
          Phase 2 will send a magic link to the merchant to complete KYC via Adyen's hosted onboarding.
        </p>
        <button onClick={onNewProposal} style={{ padding: "14px 32px", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: "pointer", border: "none", background: T.accent, color: "#fff" }}>
          Start New Proposal
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "40px 24px" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, color: T.white, marginBottom: 8 }}>Processing Application</h1>
      <p style={{ fontSize: 14, color: T.muted, marginBottom: 32, lineHeight: 1.6 }}>
        Complete the non-sensitive business details below. SSN, bank account, and EIN are collected by Adyen directly — AIO never touches that data.
      </p>

      {/* Business Info */}
      <div style={CARD}>
        <h2 style={SEC}>Business Information</h2>
        <div style={{ ...GRID2, marginBottom: 16 }}>
          {input("Legal Business Name", biz.legalName || "", setBizF("legalName") as (e: React.ChangeEvent<HTMLInputElement>) => void)}
          {input("DBA (Doing Business As)", biz.dba || "", setBizF("dba") as (e: React.ChangeEvent<HTMLInputElement>) => void)}
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={LABEL}>Business Type</label>
          <select value={biz.bizType || "llc"} onChange={setBizF("bizType") as (e: React.ChangeEvent<HTMLSelectElement>) => void} style={{ ...INPUT, appearance: "auto" as const }}>
            {(["llc", "corp", "s-corp", "sole-prop", "partnership", "non-profit"] as const).map(t => (
              <option key={t} value={t}>{t.replace("-", " ").replace(/\b\w/g, c => c.toUpperCase())}</option>
            ))}
          </select>
        </div>
        {input("Street Address", biz.address || "", setBizF("address") as (e: React.ChangeEvent<HTMLInputElement>) => void)}
        <div style={{ ...GRID2, marginTop: 16 }}>
          {input("City", biz.city || "", setBizF("city") as (e: React.ChangeEvent<HTMLInputElement>) => void)}
          {input("State", biz.state || "", setBizF("state") as (e: React.ChangeEvent<HTMLInputElement>) => void, "CA")}
        </div>
        <div style={{ ...GRID2, marginTop: 16 }}>
          {input("ZIP", biz.zip || "", setBizF("zip") as (e: React.ChangeEvent<HTMLInputElement>) => void, "90210")}
          {input("Business Phone", biz.phone || "", setBizF("phone") as (e: React.ChangeEvent<HTMLInputElement>) => void, "555-000-0000")}
        </div>
        <div style={{ ...GRID2, marginTop: 16 }}>
          {input("Website", biz.website || "", setBizF("website") as (e: React.ChangeEvent<HTMLInputElement>) => void, "https://")}
          {input("Years in Business", biz.yearsInBusiness || "", setBizF("yearsInBusiness") as (e: React.ChangeEvent<HTMLInputElement>) => void, "5")}
        </div>
      </div>

      {/* Owner Contact */}
      <div style={CARD}>
        <h2 style={SEC}>Owner Contact</h2>
        <p style={{ fontSize: 12, color: T.muted, marginBottom: 16 }}>Contact info only — no SSN, DOB, or ID numbers.</p>
        <div style={{ ...GRID2, marginBottom: 16 }}>
          {input("First Name", owner.firstName || "", setOwnerF("firstName") as (e: React.ChangeEvent<HTMLInputElement>) => void)}
          {input("Last Name", owner.lastName || "", setOwnerF("lastName") as (e: React.ChangeEvent<HTMLInputElement>) => void)}
        </div>
        <div style={{ ...GRID2 }}>
          {input("Title", owner.title || "", setOwnerF("title") as (e: React.ChangeEvent<HTMLInputElement>) => void, "Owner")}
          {input("Email", owner.email || "", setOwnerF("email") as (e: React.ChangeEvent<HTMLInputElement>) => void, "owner@business.com", "email")}
        </div>
        <div style={{ marginTop: 16 }}>
          {input("Phone", owner.phone || "", setOwnerF("phone") as (e: React.ChangeEvent<HTMLInputElement>) => void, "555-000-0000")}
        </div>
      </div>

      {/* Processing Details */}
      <div style={CARD}>
        <h2 style={SEC}>Processing Details</h2>
        <div style={{ ...GRID2, marginBottom: 16 }}>
          {input("Monthly Volume ($)", proc.monthlyVolume || "", setProcF("monthlyVolume") as (e: React.ChangeEvent<HTMLInputElement>) => void, "100000", "number")}
          {input("Average Ticket ($)", proc.avgTicket || "", setProcF("avgTicket") as (e: React.ChangeEvent<HTMLInputElement>) => void, "45", "number")}
        </div>
        <div style={{ ...GRID2, marginBottom: 16 }}>
          {input("Card Present % (0-100)", proc.cardPresentPct || "", setProcF("cardPresentPct") as (e: React.ChangeEvent<HTMLInputElement>) => void, "80", "number")}
          {input("MCC Code", proc.mcc || "", setProcF("mcc") as (e: React.ChangeEvent<HTMLInputElement>) => void, "5812")}
        </div>
        <div style={{ marginBottom: 16 }}>
          {input("Current Processor", proc.currentProcessor || "", setProcF("currentProcessor") as (e: React.ChangeEvent<HTMLInputElement>) => void, "Stripe")}
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={LABEL}>Business Description</label>
          <textarea value={proc.businessDescription || ""} onChange={setProcF("businessDescription") as (e: React.ChangeEvent<HTMLTextAreaElement>) => void} placeholder="Briefly describe the nature of the business..." style={{ ...INPUT, minHeight: 80, resize: "vertical" as const }} />
        </div>
        <div style={{ display: "flex", gap: 24 }}>
          <div>
            <label style={LABEL}>Previously Terminated?</label>
            <select value={proc.previouslyTerminated || "no"} onChange={setProcF("previouslyTerminated") as (e: React.ChangeEvent<HTMLSelectElement>) => void} style={{ ...INPUT, width: "auto" }}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </div>
          <div>
            <label style={LABEL}>Bankruptcy (Past 5yr)?</label>
            <select value={proc.bankruptcy || "no"} onChange={setProcF("bankruptcy") as (e: React.ChangeEvent<HTMLSelectElement>) => void} style={{ ...INPUT, width: "auto" }}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </div>
        </div>
      </div>

      {/* Agreement */}
      <div style={CARD}>
        <h2 style={SEC}>Authorization & Agreement</h2>
        {input("Authorized Signatory Name", agree.sigName || "", setAgreeF("sigName") as (e: React.ChangeEvent<HTMLInputElement>) => void, "Jane Doe")}
        <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", gap: 12, alignItems: "flex-start", cursor: "pointer" }}>
            <input type="checkbox" checked={agree.termsAccepted || false} onChange={setAgreeF("termsAccepted") as (e: React.ChangeEvent<HTMLInputElement>) => void} style={{ marginTop: 2, accentColor: T.accent, flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: T.muted, lineHeight: 1.6 }}>
              I certify that the information provided is accurate. I authorize AIO to process payments for this merchant and to initiate onboarding with our processing partner.
            </span>
          </label>
          <label style={{ display: "flex", gap: 12, alignItems: "flex-start", cursor: "pointer" }}>
            <input type="checkbox" checked={agree.electronicConsentAccepted || false} onChange={setAgreeF("electronicConsentAccepted") as (e: React.ChangeEvent<HTMLInputElement>) => void} style={{ marginTop: 2, accentColor: T.accent, flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: T.muted, lineHeight: 1.6 }}>
              I consent to electronic communications and agree that electronic records are legally binding. I understand that KYC verification will be completed by the merchant directly via secure Adyen-hosted forms.
            </span>
          </label>
        </div>
      </div>

      {err && (
        <div style={{ marginBottom: 16, padding: "12px 16px", background: "#1c0000", border: `1px solid ${T.red}40`, borderRadius: 8, fontSize: 13, color: T.red }}>
          {err}
        </div>
      )}

      <div style={{ display: "flex", gap: 12 }}>
        <button style={{ padding: "12px 28px", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer", border: "none", background: "#1e2d45", color: T.white }} onClick={onBack}>← Back to Proposal</button>
        <button
          style={{ padding: "12px 28px", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer", border: "none", background: T.accent, color: "#fff", opacity: saving ? 0.6 : 1 }}
          disabled={saving}
          onClick={handleSave}
        >
          {saving ? "Saving…" : "Save Application →"}
        </button>
      </div>
    </div>
  );
}
