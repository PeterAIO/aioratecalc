"use client";

import { useState, useRef } from "react";
import DebugLogPanel from "@/components/dev/DebugLogPanel";
import type { DebugTraceData } from "@/lib/debugTrace";
import styles from "./UploadStep.module.css";

type Props = {
  onAnalyzed: (analysis: Record<string, unknown>, debug: DebugTraceData | null) => void;
};

export default function UploadStep({ onAnalyzed }: Props) {
  const [file, setFile]         = useState<File | null>(null);
  const [fileData, setFileData] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [debug, setDebug]       = useState<DebugTraceData | null>(null);
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
    setDebug(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileData, mediaType: file.type }),
      });
      const data = await res.json();
      // The API returns `debug` on success AND on failure — surface it either way.
      if (!res.ok) {
        setDebug(data.debug ?? null);
        throw new Error(data.error || "Analysis failed");
      }
      onAnalyzed(data.analysis, data.debug ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    }
    setLoading(false);
  };

  const dropzoneState = file ? "done" : dragOver ? "dragging" : undefined;

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>Upload Merchant Statement</h1>
      <p className={styles.subtitle}>Upload a PDF or image of any merchant processing statement.</p>

      <div
        className={styles.dropzone}
        data-state={dropzoneState}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        onClick={() => fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,image/*"
          className={styles.fileInput}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        {file ? (
          <>
            <div className={styles.dropzoneIcon} data-state="done">✓</div>
            <p className={styles.dropzoneTitle} data-state="done">{file.name}</p>
            <p className={styles.dropzoneSubtitle}>{(file.size / 1024).toFixed(1)} KB · Click to replace</p>
          </>
        ) : (
          <>
            <div className={styles.dropzoneIcon}>⬆</div>
            <p className={styles.dropzoneTitle}>Drop statement here or click to browse</p>
            <p className={styles.dropzoneSubtitle}>PDF or image · Any processor format</p>
          </>
        )}
      </div>

      <div className={styles.chips}>
        {["Stripe", "Square", "First Data", "TSYS", "Heartland", "Worldpay", "Chase Paymentech", "Elavon"].map(p => (
          <div key={p} className={styles.chip}>{p}</div>
        ))}
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
        {loading ? (
          <>
            <span className={`${styles.spinner} spin`} />
            Analyzing statement…
          </>
        ) : "Analyze Statement →"}
      </button>

      {/* When analysis fails we stay on this screen, so show the trace here. */}
      {error && <DebugLogPanel trace={debug} />}
    </div>
  );
}
