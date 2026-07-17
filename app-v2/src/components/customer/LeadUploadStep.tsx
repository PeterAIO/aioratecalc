"use client";

import { useState, useRef } from "react";
import { fmt$, fmtPct2 } from "@/lib/utils";
import type { CustomerSafeQuote } from "@/types/merchant";
import styles from "./LeadUploadStep.module.css";

type Props = {
  token: string;
  businessName: string | null;
  contactEmail: string | null;
};

export default function LeadUploadStep({ token, businessName, contactEmail }: Props) {
  const [file, setFile]         = useState<File | null>(null);
  const [fileData, setFileData] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [quote, setQuote]       = useState<CustomerSafeQuote | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [accessEmail, setAccessEmail]     = useState(contactEmail || "");
  const [requestingAccess, setRequesting] = useState(false);
  const [accessSent, setAccessSent]       = useState(false);
  const [accessDevUrl, setAccessDevUrl]   = useState<string | null>(null);
  const [accessError, setAccessError]     = useState<string | null>(null);

  const requestAccess = async () => {
    if (!accessEmail) return;
    setRequesting(true);
    setAccessError(null);
    try {
      const res = await fetch(`/api/lead/${token}/request-access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: accessEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setAccessSent(true);
      setAccessDevUrl(data.devUrl || null);
    } catch (err) {
      setAccessError(err instanceof Error ? err.message : "Request failed");
    }
    setRequesting(false);
  };

  const readFile = (f: File, cb: (data: string) => void) => {
    const r = new FileReader();
    r.onload = e => cb((e.target!.result as string).split(",")[1]);
    r.readAsDataURL(f);
  };

  const handleFile = (f: File) => {
    setFile(f);
    setError(null);
    readFile(f, setFileData);
  };

  const analyze = async () => {
    if (!fileData || !file) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/lead/${token}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileData, mediaType: file.type }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      setQuote(data.quote);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    }
    setLoading(false);
  };

  if (quote) {
    return (
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.quoteHead}>
            <div className={styles.quoteEyebrow}>Your Quote</div>
            <h1 className={styles.quoteBusiness}>{businessName || "Your Business"}</h1>
          </div>

          <div className={styles.statWrap}>
            <div className={styles.statCaption}>Estimated Annual Savings</div>
            <div className={styles.statHero}>{fmt$(quote.annualSavings)}</div>
            <div className={styles.statTicker}>
              <div className={styles.statTickerItem}>
                <div className={styles.statTickerValue}>{fmt$(quote.monthlySavings)}</div>
                <div className={styles.statTickerLabel}>Monthly Savings</div>
              </div>
              <div className={styles.statTickerItem}>
                <div className={styles.statTickerValue}>{fmtPct2(quote.effectiveRate)}</div>
                <div className={styles.statTickerLabel}>New Effective Rate</div>
              </div>
            </div>
          </div>

          <div className={styles.panel}>
            {accessSent ? (
              <div>
                <p className={styles.accessSuccess}>
                  Check your email for a link to continue setting up your account.
                </p>
                {accessDevUrl && (
                  <div className={styles.devUrl}>
                    Dev mode (no email configured):{" "}
                    <a href={accessDevUrl}>{accessDevUrl}</a>
                  </div>
                )}
              </div>
            ) : (
              <>
                <h2 className={styles.panelTitle}>Ready to move forward?</h2>
                <p className={styles.panelText}>
                  Create your free account to finish onboarding yourself — no need to wait on a rep.
                </p>
                <div className={styles.accessRow}>
                  <input
                    type="email" value={accessEmail} onChange={e => setAccessEmail(e.target.value)}
                    placeholder="you@business.com"
                    className={styles.accessInput}
                  />
                  <button
                    onClick={requestAccess}
                    disabled={!accessEmail || requestingAccess}
                    className={styles.accessBtn}
                  >
                    {requestingAccess ? "Sending…" : "Continue →"}
                  </button>
                </div>
                {accessError && <div className={styles.accessError}>{accessError}</div>}
              </>
            )}
          </div>
          <p className={styles.footnote}>
            Prefer to talk it through? Your AIO representative will follow up shortly too.
          </p>
        </div>
      </div>
    );
  }

  const dropzoneState = file ? "done" : dragOver ? "dragging" : undefined;

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <h1 className={styles.title}>
          {businessName ? `Hi ${businessName}, upload your statement` : "Upload Your Statement"}
        </h1>
        <p className={styles.subtitle}>
          Upload a recent processing statement (PDF or image) and get an instant estimate of your savings with AIO.
        </p>

        <div
          className={styles.dropzone}
          data-state={dropzoneState}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          onClick={() => fileRef.current?.click()}
        >
          <input ref={fileRef} type="file" accept=".pdf,image/*" className={styles.fileInput} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          {file ? (
            <>
              <div className={styles.dropzoneIcon} data-state="done">✓</div>
              <p className={styles.dropzoneTitle} data-state="done">{file.name}</p>
              <p className={styles.dropzoneSubtitle}>Click to replace</p>
            </>
          ) : (
            <>
              <div className={styles.dropzoneIcon}>⬆</div>
              <p className={styles.dropzoneTitle}>Drop statement here or click to browse</p>
              <p className={styles.dropzoneSubtitle}>PDF or image · Any processor format</p>
            </>
          )}
        </div>

        {error && (
          <div className={styles.error}>
            {error}
          </div>
        )}

        <button
          className={styles.btnPrimary}
          disabled={!file || loading}
          onClick={analyze}
        >
          {loading ? "Analyzing statement…" : "Get My Quote →"}
        </button>
      </div>
    </div>
  );
}
