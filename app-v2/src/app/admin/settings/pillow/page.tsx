"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getActivePaddingPolicy, updatePaddingPolicyAction } from "@/lib/actions/pricing";
import type { PaddingConfig } from "@/lib/pricing";
import styles from "./pillow.module.css";

export default function PaddingSettingsPage() {
  const [policy, setPolicy]   = useState<PaddingConfig | null>(null);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);

  useEffect(() => {
    getActivePaddingPolicy().then(setPolicy).catch(() => {});
  }, []);

  const save = async () => {
    if (!policy) return;
    setSaving(true);
    await updatePaddingPolicyAction(policy);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  if (!policy) return <div className={styles.loading}>Loading…</div>;

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <Link href="/admin" className={styles.back}>← Back to Admin</Link>
        <div className={styles.header}>
          <h1 className={styles.headerTitle}>Margin Padding</h1>
          <p className={styles.headerSubtitle}>
            Controls the padding added to AIO&apos;s true minimum margin floor and true Adyen processing
            cost. Reps see a padded floor and (optionally) no exact cost figure at all — only admins see the
            real numbers.
          </p>
        </div>

        <div className={styles.panel}>
          <div className={styles.field}>
            <label className={styles.label}>Floor padding (basis points added to the true take-rate)</label>
            <input
              type="number" step="1" value={policy.paddingBps}
              onChange={e => setPolicy(p => p && ({ ...p, paddingBps: parseInt(e.target.value) || 0 }))}
              className={styles.input}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Floor padding (flat $ added to the true minimum MRR)</label>
            <input
              type="number" step="1" value={policy.paddingMinMrrAdd}
              onChange={e => setPolicy(p => p && ({ ...p, paddingMinMrrAdd: parseFloat(e.target.value) || 0 }))}
              className={styles.input}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox" checked={policy.paddingAdyenCostHide}
                onChange={e => setPolicy(p => p && ({ ...p, paddingAdyenCostHide: e.target.checked }))}
                className={styles.checkbox}
              />
              <span className={styles.checkboxText}>Hide the exact Adyen cost rate from reps entirely</span>
            </label>
          </div>
        </div>

        <button
          onClick={save} disabled={saving}
          data-saved={saved}
          className={styles.saveButton}
        >
          {saved ? "✓ Saved" : saving ? "Saving…" : "Save Padding"}
        </button>
      </div>
    </div>
  );
}
