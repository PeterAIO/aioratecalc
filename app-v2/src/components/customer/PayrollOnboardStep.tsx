"use client";

import { useState } from "react";
import { startPayrollOnboardingAction } from "@/lib/actions/customer";
import type { MerchantApplication } from "@/types/merchant";
// Deliberately reuses CustomerOnboardStep's stylesheet — this is the same
// customer-facing form design, and the two should stay visually identical.
import styles from "./CustomerOnboardStep.module.css";

type Props = { app: MerchantApplication };

// Payroll opt-in. Everything Check needs about the business is already on the
// application; the only genuinely new inputs are the first payday and who is
// authorized to sign for payroll, so this form stays deliberately short.
// On submit the customer is sent straight to Check's hosted onboarding.
export default function PayrollOnboardStep({ app }: Props) {
  const owner = app.ownerContact;
  const [startDate, setStartDate] = useState("");
  const [signerName, setSignerName] = useState(
    [owner?.firstName, owner?.lastName].filter(Boolean).join(" ")
  );
  const [signerTitle, setSignerTitle] = useState(owner?.title || "Owner");
  const [signerEmail, setSignerEmail] = useState(owner?.email || "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!startDate) {
      setErr("Enter the date of your first payday with AIO payroll.");
      return;
    }
    if (!signerName.trim() || !signerTitle.trim() || !signerEmail.trim()) {
      setErr("Signer name, title, and email are all required.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const { url } = await startPayrollOnboardingAction(app.id, {
        startDate,
        signer: { name: signerName.trim(), title: signerTitle.trim(), email: signerEmail.trim() },
      });
      window.location.href = url;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not start payroll setup");
      setSaving(false);
    }
  };

  const input = (
    label: string,
    val: string,
    onChange: (v: string) => void,
    placeholder = "",
    type = "text"
  ) => (
    <div className={styles.field}>
      <label className={styles.label}>{label}</label>
      <input
        type={type}
        value={val}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={styles.input}
      />
    </div>
  );

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>Set Up Payroll</h1>
      <p className={styles.pageSubtitle}>
        AIO payroll runs on Check. We&apos;ll reuse the business details you&apos;ve already given us —
        we just need your first payday and who&apos;s authorized to sign. Bank account, EIN, and tax
        details are collected securely by Check directly; AIO never touches that data.
      </p>

      <div className={styles.panel}>
        <h2 className={styles.sectionTitle}>Payroll Start</h2>
        <p className={styles.hint}>
          The date of your first payday with AIO payroll. It doesn&apos;t have to be exact — you can
          change it with Check later.
        </p>
        {input("First Payday", startDate, setStartDate, "", "date")}
      </div>

      <div className={styles.panel}>
        <h2 className={styles.sectionTitle}>Authorized Signer</h2>
        <p className={styles.hint}>
          The person permitted to set up payroll on behalf of the business. Check emails them if the
          setup link expires.
        </p>
        <div className={styles.grid2}>
          {input("Full Name", signerName, setSignerName, "Jane Doe")}
          {input("Title", signerTitle, setSignerTitle, "Owner")}
        </div>
        <div className={styles.row}>
          {input("Email", signerEmail, setSignerEmail, "owner@business.com", "email")}
        </div>
      </div>

      {err && <div className={styles.errorBanner}>{err}</div>}

      <button className={styles.btnPrimary} disabled={saving} onClick={handleSubmit}>
        {saving ? "Starting…" : "Continue to Check →"}
      </button>
    </div>
  );
}
