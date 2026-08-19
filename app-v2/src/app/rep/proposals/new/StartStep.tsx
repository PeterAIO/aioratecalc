"use client";

import { useState } from "react";
import UploadStep from "@/components/rep/UploadStep";
import { analysisFromQuoteConfigAction } from "@/lib/actions/prospects";
import type { QuoteConfig, StatementAnalysis } from "@/types/merchant";
import styles from "./proposals-new.module.css";

type Props = {
  onStarted: (analysis: StatementAnalysis, quoteConfig: QuoteConfig | null) => void | Promise<void>;
};

/**
 * The wizard's entry. A statement is the better basis, but a rep sitting with a
 * merchant who didn't bring one had no way in at all — UploadStep gates on a
 * file. The ticket/volume pair is the same alternative /rep/prospects/new
 * offers, with the same all-or-nothing validation.
 *
 * The synthesis itself is a server action: analysisFromQuoteConfig lives in
 * pricing.ts, and importing that here would ship AIO's margin floors to the
 * browser.
 */
export default function StartStep({ onStarted }: Props) {
  const [avgTicket, setAvgTicket]         = useState("");
  const [monthlyVolume, setMonthlyVolume] = useState("");
  const [busy, setBusy]                   = useState(false);
  const [error, setError]                 = useState<string | null>(null);

  const ticket = parseFloat(avgTicket) || 0;
  const volume = parseFloat(monthlyVolume) || 0;

  const startFromNumbers = async () => {
    if ((ticket > 0) !== (volume > 0)) {
      setError("Enter both average ticket and monthly volume, or neither.");
      return;
    }
    if (!(ticket > 0) || !(volume > 0)) {
      setError("Enter an average ticket and a monthly volume to price without a statement.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const config: QuoteConfig = { avgTicket: ticket, monthlyVolume: volume };
      const analysis = await analysisFromQuoteConfigAction(config);
      await onStarted(analysis, config);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start from those numbers");
      setBusy(false);
    }
  };

  return (
    <>
      <UploadStep onAnalyzed={raw => onStarted(raw as unknown as StatementAnalysis, null)} />

      <div className={styles.altStart}>
        <div className={styles.altDivider}><span className={styles.altDividerLabel}>or</span></div>
        <h2 className={styles.altTitle}>No statement on hand?</h2>
        <p className={styles.altNote}>
          Price from their numbers instead. Without a statement there&apos;s nothing to compare
          against, so the quote shows the AIO rate rather than a saving.
        </p>
        <div className={styles.altRow}>
          <div className={styles.altField}>
            <label className={styles.altLabel} htmlFor="start-ticket">Average Ticket</label>
            <input
              id="start-ticket" type="number" min="0" step="0.01" inputMode="decimal"
              value={avgTicket} onChange={e => setAvgTicket(e.target.value)}
              placeholder="35.00" className={styles.altInput}
            />
          </div>
          <div className={styles.altField}>
            <label className={styles.altLabel} htmlFor="start-volume">Monthly Volume</label>
            <input
              id="start-volume" type="number" min="0" step="100" inputMode="decimal"
              value={monthlyVolume} onChange={e => setMonthlyVolume(e.target.value)}
              placeholder="100000" className={styles.altInput}
            />
          </div>
        </div>
        {error && <div className={styles.error}>{error}</div>}
        <button
          type="button"
          className={styles.btnGhost}
          disabled={busy || !(ticket > 0 && volume > 0)}
          onClick={startFromNumbers}
        >
          {busy ? "Preparing…" : "Continue Without a Statement →"}
        </button>
      </div>
    </>
  );
}
