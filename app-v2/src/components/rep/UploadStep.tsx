"use client";

import { useState, useRef } from "react";

const S = {
  panel: { maxWidth: 800, margin: "0 auto", padding: "40px 24px" } as React.CSSProperties,
  h1: { fontSize: 28, fontWeight: 800, color: "#e2e8f0", marginBottom: 8 } as React.CSSProperties,
  sub: { fontSize: 15, color: "#64748b", marginBottom: 32, lineHeight: 1.6 } as React.CSSProperties,
  dropzone: { border: "2px dashed #1e2d45", borderRadius: 16, padding: "60px 40px", textAlign: "center" as const, cursor: "pointer", transition: "all .2s", background: "#0f1628" },
  dropzoneActive: { borderColor: "#f9674e", background: "#f9674e10" },
  dropzoneDone: { borderColor: "#22c55e", background: "#22c55e08" },
  chips: { display: "flex", flexWrap: "wrap" as const, gap: 8, marginTop: 24, justifyContent: "center" },
  chip: { padding: "6px 14px", borderRadius: 20, background: "#0f1628", border: "1px solid #1e2d45", fontSize: 12, color: "#64748b" },
  btn: { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "14px 32px", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: "pointer", border: "none", transition: "all .2s", marginTop: 28 } as React.CSSProperties,
  btnPrimary: { background: "#f9674e", color: "#fff", boxShadow: "0 4px 16px rgba(249,103,78,0.3)" } as React.CSSProperties,
};

type Props = {
  onAnalyzed: (analysis: Record<string, unknown>) => void;
};

export default function UploadStep({ onAnalyzed }: Props) {
  const [file, setFile]         = useState<File | null>(null);
  const [fileData, setFileData] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
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
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileData, mediaType: file.type }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      onAnalyzed(data.analysis);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    }
    setLoading(false);
  };

  const dropzoneStyle = {
    ...S.dropzone,
    ...(dragOver ? S.dropzoneActive : {}),
    ...(file ? S.dropzoneDone : {}),
  };

  return (
    <div style={S.panel}>
      <h1 style={S.h1}>Upload Merchant Statement</h1>
      <p style={S.sub}>Upload a PDF or image of any merchant processing statement.</p>

      <div
        style={dropzoneStyle}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        onClick={() => fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,image/*"
          style={{ display: "none" }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        {file ? (
          <>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
            <p style={{ fontSize: 16, fontWeight: 700, color: "#22c55e", marginBottom: 4 }}>{file.name}</p>
            <p style={{ fontSize: 13, color: "#64748b" }}>{(file.size / 1024).toFixed(1)} KB · Click to replace</p>
          </>
        ) : (
          <>
            <div style={{ fontSize: 40, marginBottom: 16, color: "#64748b" }}>⬆</div>
            <p style={{ fontSize: 16, fontWeight: 700, color: "#e2e8f0", marginBottom: 8 }}>Drop statement here or click to browse</p>
            <p style={{ fontSize: 13, color: "#64748b" }}>PDF or image · Any processor format</p>
          </>
        )}
      </div>

      <div style={S.chips}>
        {["Stripe", "Square", "First Data", "TSYS", "Heartland", "Worldpay", "Chase Paymentech", "Elavon"].map(p => (
          <div key={p} style={S.chip}>{p}</div>
        ))}
      </div>

      {error && (
        <div style={{ marginTop: 16, padding: "12px 16px", background: "#1c0000", border: "1px solid #ef444440", borderRadius: 8, fontSize: 13, color: "#ef4444" }}>
          {error}
        </div>
      )}

      <button
        style={{ ...S.btn, ...S.btnPrimary, opacity: file && !loading ? 1 : 0.4 }}
        disabled={!file || loading}
        onClick={analyze}
      >
        {loading ? (
          <>
            <span className="spin" style={{ display: "inline-block", width: 16, height: 16, border: "2px solid #fff6", borderTopColor: "#fff", borderRadius: "50%" }} />
            Analyzing statement…
          </>
        ) : "Analyze Statement →"}
      </button>
    </div>
  );
}
