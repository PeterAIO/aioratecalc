"use client";

import { useState } from "react";
import { sendMerchantOnboardingLinkAction } from "@/lib/actions/applications";
import type { MerchantApplication, BusinessInfo, OwnerContact, ProcessingInfo, AgreementInfo } from "@/types/merchant";
import styles from "./ApplyStep.module.css";

type Props = {
  app: MerchantApplication;
  onSaved: (app: MerchantApplication) => void | Promise<void>;
  onBack: () => void;
  onNewProposal: () => void;
};

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
  const [link, setLink]     = useState<{ url: string; sent: boolean } | null>(null);
  const [linking, setLinking] = useState(false);
  const [copied, setCopied]   = useState(false);

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
      const updated: MerchantApplication = {
        ...app,
        stage: "proposal_sent",
        updatedAt: new Date().toISOString(),
        business: biz as BusinessInfo,
        ownerContact: owner as OwnerContact,
        processing: proc as ProcessingInfo,
        agreement: agree as AgreementInfo,
      };
      await onSaved(updated);
      setSaved(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    }
    setSaving(false);
  };

  // The application is already persisted by the time this runs (handleSave
  // awaits onSaved), so the same action the dashboard uses works here — this
  // is just the earlier, in-flow moment to hand the rep the link.
  const handleSendLink = async () => {
    setLinking(true);
    setErr(null);
    try {
      const { result, url } = await sendMerchantOnboardingLinkAction(app.id);
      setLink({ url, sent: result.sent });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not create the onboarding link");
    }
    setLinking(false);
  };

  const input = (label: string, val: string, onChange: (e: React.ChangeEvent<HTMLInputElement>) => void, placeholder = "", type = "text") => (
    <div className={styles.field}>
      <label className={styles.label}>{label}</label>
      <input type={type} value={val} onChange={onChange} placeholder={placeholder} className={styles.input} />
    </div>
  );

  if (saved) {
    return (
      <div className={styles.successWrap}>
        <div className={styles.successIcon}>✓</div>
        <h1 className={styles.successTitle}>Application Saved</h1>
        <p className={styles.successBody}>
          The merchant application for <strong>{biz.dba || biz.legalName}</strong> has been saved.
          Send them their onboarding link — it signs them in to complete KYC on Adyen&apos;s hosted forms.
        </p>
        {err && <div className={styles.errorBanner}>{err}</div>}
        {link ? (
          <>
            <div className={styles.linkRow}>
              <code className={styles.linkCode}>{link.url}</code>
              <button
                onClick={() => { navigator.clipboard.writeText(link.url); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                className={styles.btnCopy}
                data-copied={copied}
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <p className={styles.linkNote}>
              {link.sent
                ? `Emailed to ${owner.email}. The link expires in 30 minutes.`
                : "Email delivery isn't configured yet — send this link to the merchant yourself. It expires in 30 minutes."}
            </p>
          </>
        ) : (
          <div className={styles.successActions}>
            <button onClick={handleSendLink} disabled={linking} className={styles.btnPrimary}>
              {linking ? "Creating link…" : "Send Onboarding Link"}
            </button>
          </div>
        )}
        <div className={styles.successActions}>
          <button onClick={onNewProposal} className={styles.btnSecondary}>
            Start New Proposal
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>Processing Application</h1>
      <p className={styles.pageSubtitle}>
        Complete the non-sensitive business details below. SSN, bank account, and EIN are collected by Adyen directly — AIO never touches that data.
      </p>

      {/* Business Info */}
      <div className={styles.panel}>
        <h2 className={styles.sectionTitle}>Business Information</h2>
        <div className={styles.grid2}>
          {input("Legal Business Name", biz.legalName || "", setBizF("legalName") as (e: React.ChangeEvent<HTMLInputElement>) => void)}
          {input("DBA (Doing Business As)", biz.dba || "", setBizF("dba") as (e: React.ChangeEvent<HTMLInputElement>) => void)}
        </div>
        <div className={styles.row}>
          <label className={styles.label}>Business Type</label>
          <select value={biz.bizType || "llc"} onChange={setBizF("bizType") as (e: React.ChangeEvent<HTMLSelectElement>) => void} className={styles.input}>
            {(["llc", "corp", "s-corp", "sole-prop", "partnership", "non-profit"] as const).map(t => (
              <option key={t} value={t}>{t.replace("-", " ").replace(/\b\w/g, c => c.toUpperCase())}</option>
            ))}
          </select>
        </div>
        <div className={styles.row}>
          {input("Street Address", biz.address || "", setBizF("address") as (e: React.ChangeEvent<HTMLInputElement>) => void)}
        </div>
        <div className={`${styles.grid2} ${styles.row}`}>
          {input("City", biz.city || "", setBizF("city") as (e: React.ChangeEvent<HTMLInputElement>) => void)}
          {input("State", biz.state || "", setBizF("state") as (e: React.ChangeEvent<HTMLInputElement>) => void, "CA")}
        </div>
        <div className={`${styles.grid2} ${styles.row}`}>
          {input("ZIP", biz.zip || "", setBizF("zip") as (e: React.ChangeEvent<HTMLInputElement>) => void, "90210")}
          {input("Business Phone", biz.phone || "", setBizF("phone") as (e: React.ChangeEvent<HTMLInputElement>) => void, "555-000-0000")}
        </div>
        <div className={`${styles.grid2} ${styles.row}`}>
          {input("Website", biz.website || "", setBizF("website") as (e: React.ChangeEvent<HTMLInputElement>) => void, "https://")}
          {input("Years in Business", biz.yearsInBusiness || "", setBizF("yearsInBusiness") as (e: React.ChangeEvent<HTMLInputElement>) => void, "5")}
        </div>
      </div>

      {/* Owner Contact */}
      <div className={styles.panel}>
        <h2 className={styles.sectionTitle}>Owner Contact</h2>
        <p className={styles.hint}>Contact info only — no SSN, DOB, or ID numbers.</p>
        <div className={styles.grid2}>
          {input("First Name", owner.firstName || "", setOwnerF("firstName") as (e: React.ChangeEvent<HTMLInputElement>) => void)}
          {input("Last Name", owner.lastName || "", setOwnerF("lastName") as (e: React.ChangeEvent<HTMLInputElement>) => void)}
        </div>
        <div className={`${styles.grid2} ${styles.row}`}>
          {input("Title", owner.title || "", setOwnerF("title") as (e: React.ChangeEvent<HTMLInputElement>) => void, "Owner")}
          {input("Email", owner.email || "", setOwnerF("email") as (e: React.ChangeEvent<HTMLInputElement>) => void, "owner@business.com", "email")}
        </div>
        <div className={styles.row}>
          {input("Phone", owner.phone || "", setOwnerF("phone") as (e: React.ChangeEvent<HTMLInputElement>) => void, "555-000-0000")}
        </div>
      </div>

      {/* Processing Details */}
      <div className={styles.panel}>
        <h2 className={styles.sectionTitle}>Processing Details</h2>
        <div className={styles.grid2}>
          {input("Monthly Volume ($)", proc.monthlyVolume || "", setProcF("monthlyVolume") as (e: React.ChangeEvent<HTMLInputElement>) => void, "100000", "number")}
          {input("Average Ticket ($)", proc.avgTicket || "", setProcF("avgTicket") as (e: React.ChangeEvent<HTMLInputElement>) => void, "45", "number")}
        </div>
        <div className={`${styles.grid2} ${styles.row}`}>
          {input("Card Present % (0-100)", proc.cardPresentPct || "", setProcF("cardPresentPct") as (e: React.ChangeEvent<HTMLInputElement>) => void, "80", "number")}
          {input("MCC Code", proc.mcc || "", setProcF("mcc") as (e: React.ChangeEvent<HTMLInputElement>) => void, "5812")}
        </div>
        <div className={styles.row}>
          {input("Current Processor", proc.currentProcessor || "", setProcF("currentProcessor") as (e: React.ChangeEvent<HTMLInputElement>) => void, "Stripe")}
        </div>
        <div className={styles.row}>
          <label className={styles.label}>Business Description</label>
          <textarea value={proc.businessDescription || ""} onChange={setProcF("businessDescription") as (e: React.ChangeEvent<HTMLTextAreaElement>) => void} placeholder="Briefly describe the nature of the business..." className={`${styles.input} ${styles.textarea}`} />
        </div>
        <div className={`${styles.inlineRow} ${styles.row}`}>
          <div className={styles.field}>
            <label className={styles.label}>Previously Terminated?</label>
            <select value={proc.previouslyTerminated || "no"} onChange={setProcF("previouslyTerminated") as (e: React.ChangeEvent<HTMLSelectElement>) => void} className={`${styles.input} ${styles.selectInline}`}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Bankruptcy (Past 5yr)?</label>
            <select value={proc.bankruptcy || "no"} onChange={setProcF("bankruptcy") as (e: React.ChangeEvent<HTMLSelectElement>) => void} className={`${styles.input} ${styles.selectInline}`}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </div>
        </div>
      </div>

      {/* Agreement */}
      <div className={styles.panel}>
        <h2 className={styles.sectionTitle}>Authorization & Agreement</h2>
        {input("Authorized Signatory Name", agree.sigName || "", setAgreeF("sigName") as (e: React.ChangeEvent<HTMLInputElement>) => void, "Jane Doe")}
        <div className={styles.checkboxGroup}>
          <label className={styles.checkboxRow}>
            <input type="checkbox" checked={agree.termsAccepted || false} onChange={setAgreeF("termsAccepted") as (e: React.ChangeEvent<HTMLInputElement>) => void} className={styles.checkbox} />
            <span className={styles.checkboxText}>
              I certify that the information provided is accurate. I authorize AIO to process payments for this merchant and to initiate onboarding with our processing partner.
            </span>
          </label>
          <label className={styles.checkboxRow}>
            <input type="checkbox" checked={agree.electronicConsentAccepted || false} onChange={setAgreeF("electronicConsentAccepted") as (e: React.ChangeEvent<HTMLInputElement>) => void} className={styles.checkbox} />
            <span className={styles.checkboxText}>
              I consent to electronic communications and agree that electronic records are legally binding. I understand that KYC verification will be completed by the merchant directly via secure Adyen-hosted forms.
            </span>
          </label>
        </div>
      </div>

      {err && (
        <div className={styles.errorBanner}>
          {err}
        </div>
      )}

      <div className={styles.actions}>
        <button className={styles.btnSecondary} onClick={onBack}>← Back to Proposal</button>
        <button
          className={styles.btnPrimary}
          disabled={saving}
          onClick={handleSave}
        >
          {saving ? "Saving…" : "Save Application →"}
        </button>
      </div>
    </div>
  );
}
