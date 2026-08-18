"use client";

import { useState, useRef } from "react";
import type { CustomerSafeQuote } from "@/types/merchant";
import LeadQuoteView from "./LeadQuoteView";
import styles from "./LeadUploadStep.module.css";

// The public lead flow's client shell. Two entries into the same destination:
// a quote the rep prepared arrives as `preparedQuote` and renders immediately,
// and a customer who has none uploads a statement to generate one. Both end on
// LeadQuoteView. The quote is always a CustomerSafeQuote — this component never
// sees the raw analysis.
type Props = {
  token: string;
  businessName: string | null;
  contactEmail: string | null;
  preparedQuote?: CustomerSafeQuote | null;
  alreadyAccepted?: boolean;
};

export default function LeadUploadStep({
  token, businessName, contactEmail, preparedQuote = null, alreadyAccepted = false,
}: Props) {
  const [file, setFile]         = useState<File | null>(null);
  const [fileData, setFileData] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [quote, setQuote]       = useState<CustomerSafeQuote | null>(preparedQuote);
  const fileRef = useRef<HTMLInputElement>(null);

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
      <LeadQuoteView
        token={token}
        quote={quote}
        businessName={businessName}
        contactEmail={contactEmail}
        alreadyAccepted={alreadyAccepted}
        // Offered only when the quote came prepared — a customer who just
        // uploaded a statement has nothing better to replace it with — and
        // never once the quote is accepted: the accepted quote's basis is
        // frozen server-side, so a re-upload would produce no new quote.
        onUploadStatement={
          !alreadyAccepted && preparedQuote && quote === preparedQuote ? () => setQuote(null) : undefined
        }
      />
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

        {preparedQuote && (
          <button className={styles.btnGhostLink} onClick={() => setQuote(preparedQuote)}>
            ← Back to my quote
          </button>
        )}
      </div>
    </div>
  );
}
