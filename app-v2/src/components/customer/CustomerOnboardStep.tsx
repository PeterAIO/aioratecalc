"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveMyApplicationOnboardingAction, updateMyApplicationDetailsAction } from "@/lib/actions/customer";
import type { MerchantApplication, BusinessInfo, OwnerContact, ProcessingInfo, AgreementInfo } from "@/types/merchant";
import styles from "./CustomerOnboardStep.module.css";

type Props = { app: MerchantApplication };

// Mirrors src/components/rep/ApplyStep.tsx's field groups/layout, but
// customer-facing: saves via saveMyApplicationOnboardingAction (session +
// ownership scoped) instead of the rep/admin-only saveApplicationAction, and
// chains into Adyen onboarding on submit.
export default function CustomerOnboardStep({ app }: Props) {
  const router = useRouter();
  const isEditingAfterAdyen = Boolean(app.adyenOnboardingUrl);
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
  const [agree, setAgree] = useState<Partial<AgreementInfo>>(app.agreement || { sigName: "", sigDate: "", termsAccepted: false, electronicConsentAccepted: false });
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<{ adyenReady: boolean; adyenUrl: string | null } | null>(null);
  const [savedEdit, setSavedEdit] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const b = <T extends Record<string, unknown>>(setter: (fn: (prev: T) => T) => void) =>
    (k: keyof T) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setter((prev: T) => ({ ...prev, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value } as T));

  const setBizF  = b<Partial<BusinessInfo>>(setBiz as Parameters<typeof b>[0]);
  const setOwnerF = b<Partial<OwnerContact>>(setOwner as Parameters<typeof b>[0]);
  const setProcF = b<Partial<ProcessingInfo>>(setProc as Parameters<typeof b>[0]);
  const setAgreeF = b<Partial<AgreementInfo>>(setAgree as Parameters<typeof b>[0]);

  const handleSubmit = async () => {
    if (!agree.termsAccepted || !agree.electronicConsentAccepted) {
      setErr("Both checkboxes are required to submit.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const fields = {
        business: biz as BusinessInfo,
        ownerContact: owner as OwnerContact,
        processing: proc as ProcessingInfo,
        agreement: agree as AgreementInfo,
      };

      if (isEditingAfterAdyen) {
        await updateMyApplicationDetailsAction(app.id, fields);
        setSaving(false);
        setSavedEdit(true);
        return;
      }

      const result = await saveMyApplicationOnboardingAction(app.id, fields);
      if (result.adyenReady && result.app.adyenOnboardingUrl) {
        window.location.href = result.app.adyenOnboardingUrl;
        return;
      }
      setDone({ adyenReady: result.adyenReady, adyenUrl: result.app.adyenOnboardingUrl });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    }
    setSaving(false);
  };

  const input = (label: string, val: string, onChange: (e: React.ChangeEvent<HTMLInputElement>) => void, placeholder = "", type = "text") => (
    <div className={styles.field}>
      <label className={styles.label}>{label}</label>
      <input type={type} value={val} onChange={onChange} placeholder={placeholder} className={styles.input} />
    </div>
  );

  if (savedEdit) {
    return (
      <div className={styles.successWrap}>
        <div className={styles.successIcon}>✓</div>
        <h1 className={styles.successTitle}>Changes Saved</h1>
        <p className={styles.successBody}>
          Your updated info has been saved and sent to our processing partner.
        </p>
        <button
          onClick={() => router.push(`/customer/applications/${app.id}`)}
          className={styles.btnPrimary}
        >
          Back to Overview
        </button>
      </div>
    );
  }

  if (done) {
    return (
      <div className={styles.successWrap}>
        <div className={styles.successIcon}>✓</div>
        <h1 className={styles.successTitle}>Application Submitted</h1>
        <p className={styles.successBody}>
          Thanks — your details have been saved. We&apos;re finishing setting up your secure onboarding link;
          an AIO representative will follow up shortly to help you complete the next step.
        </p>
        <button
          onClick={() => router.push("/customer")}
          className={styles.btnPrimary}
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>
        {isEditingAfterAdyen ? "Edit Your Application" : "Complete Your Application"}
      </h1>
      <p className={styles.pageSubtitle}>
        Fill in the details below to continue onboarding. SSN, bank account, and EIN are collected securely by Adyen directly — AIO never touches that data.
      </p>

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

      <div className={styles.panel}>
        <h2 className={styles.sectionTitle}>Authorization &amp; Agreement</h2>
        {input("Authorized Signatory Name", agree.sigName || "", setAgreeF("sigName") as (e: React.ChangeEvent<HTMLInputElement>) => void, "Jane Doe")}
        <div className={styles.checkboxGroup}>
          <label className={styles.checkboxRow}>
            <input type="checkbox" checked={agree.termsAccepted || false} onChange={setAgreeF("termsAccepted") as (e: React.ChangeEvent<HTMLInputElement>) => void} className={styles.checkbox} />
            <span className={styles.checkboxText}>
              I certify that the information provided is accurate and authorize AIO to process payments for this business and to initiate onboarding with our processing partner.
            </span>
          </label>
          <label className={styles.checkboxRow}>
            <input type="checkbox" checked={agree.electronicConsentAccepted || false} onChange={setAgreeF("electronicConsentAccepted") as (e: React.ChangeEvent<HTMLInputElement>) => void} className={styles.checkbox} />
            <span className={styles.checkboxText}>
              I consent to electronic communications and agree that electronic records are legally binding. I understand that identity verification will be completed by me directly via secure Adyen-hosted forms.
            </span>
          </label>
        </div>
      </div>

      {err && (
        <div className={styles.errorBanner}>
          {err}
        </div>
      )}

      <button
        className={styles.btnPrimary}
        disabled={saving}
        onClick={handleSubmit}
      >
        {saving ? "Saving…" : isEditingAfterAdyen ? "Save Changes" : "Submit & Continue →"}
      </button>
    </div>
  );
}
