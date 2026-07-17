"use client";

import { useState } from "react";
import { createProspectAction } from "@/lib/actions/prospects";
import { fmtPct2 } from "@/lib/utils";
import type { PricingModel } from "@/types/merchant";
import styles from "./prospects-new.module.css";

const MODELS: PricingModel[] = ["flat-rate", "2-tier", "interchange-plus"];

export default function NewProspectPage() {
  const [merchantName, setMerchantName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [targetMargin, setTargetMargin] = useState(0.008);
  const [pricingModel, setPricingModel] = useState<PricingModel>("2-tier");
  const [linkUrl, setLinkUrl]           = useState<string | null>(null);
  const [copied, setCopied]             = useState(false);
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState<string | null>(null);

  const submit = async () => {
    if (!merchantName || !contactEmail) {
      setError("Business name and contact email are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { linkUrl } = await createProspectAction({ merchantName, contactEmail, targetMargin, pricingModel });
      setLinkUrl(linkUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create prospect");
    }
    setSaving(false);
  };

  const reset = () => {
    setMerchantName(""); setContactEmail(""); setTargetMargin(0.008); setPricingModel("2-tier");
    setLinkUrl(null); setCopied(false); setError(null);
  };

  if (linkUrl) {
    return (
      <div className={styles.successWrap}>
        <div className={styles.successMark}>✓</div>
        <h1 className={styles.successTitle}>Prospect Created</h1>
        <p className={styles.successBody}>
          Share this link with <strong>{merchantName}</strong> — they&apos;ll upload their own
          statement and get an instant quote, no account needed.
        </p>
        <div className={`${styles.panel} ${styles.linkRow}`}>
          <code className={styles.linkCode}>{linkUrl}</code>
          <button
            onClick={() => { navigator.clipboard.writeText(linkUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            className={styles.btnCopy}
            data-copied={copied}
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        <button onClick={reset} className={styles.btnGhost}>
          Create Another
        </button>
      </div>
    );
  }

  return (
    <div className={styles.main}>
      <h1 className={styles.headerTitle}>Send Customer a Quote Link</h1>
      <p className={styles.headerSubtitle}>
        Set a margin target before the customer ever uploads a statement. They&apos;ll get an instant, self-serve
        quote at exactly this margin — no cost breakdown, no account required.
      </p>

      <div className={styles.panel}>
        <div className={styles.field}>
          <label className={styles.label}>Business Name</label>
          <input value={merchantName} onChange={e => setMerchantName(e.target.value)} placeholder="Joe's Pizza" className={styles.input} />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Customer Contact Email</label>
          <input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="owner@business.com" className={styles.input} />
        </div>
      </div>

      <div className={styles.panel}>
        <label className={styles.label}>Pricing Model</label>
        <div className={styles.modelRow}>
          {MODELS.map(m => (
            <button key={m} onClick={() => setPricingModel(m)} className={styles.modelPill} data-active={pricingModel === m}>
              {m.replace("-", " ")}
            </button>
          ))}
        </div>
        <div className={styles.marginRow}>
          <span className={styles.marginLabel}>Margin Target</span>
          <span className={styles.marginValue}>{fmtPct2(targetMargin)}</span>
        </div>
        <input
          type="range" min="0.001" max="0.04" step="0.0005"
          value={targetMargin}
          onChange={e => setTargetMargin(parseFloat(e.target.value))}
        />
      </div>

      {error && (
        <div className={styles.error}>
          {error}
        </div>
      )}

      <button onClick={submit} disabled={saving} className={styles.btnPrimary}>
        {saving ? "Creating…" : "Create Link →"}
      </button>
    </div>
  );
}
