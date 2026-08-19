"use client";

// Live debug log surface. Steve has no local console, so any server-side trace
// he needs to reason about a result (e.g. a wrong statement extraction) is
// rendered here, in the browser, with a one-click Copy so the whole thing can
// be pasted back into a conversation with exact numbers. Dark-theme via the
// same CSS-variable tokens the rest of app-v2 uses; no CSS framework.

import { useState } from "react";
import type { DebugTraceData } from "@/lib/debugTrace";

const fmtData = (d: unknown): string =>
  typeof d === "string" ? d : JSON.stringify(d, null, 2);

export default function DebugLogPanel({ trace }: { trace: DebugTraceData | null }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!trace) return null;

  const fullText =
    `=== ${trace.title} ===\n` +
    `started ${trace.startedAt} · ${trace.durationMs} ms · ${trace.steps.length} steps\n\n` +
    trace.steps
      .map(s => `[+${s.t}ms] ${s.label}` + (s.data === undefined ? "" : `\n${fmtData(s.data)}`))
      .join("\n\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard can be blocked (insecure context / permissions) — fall back to
      // selecting the raw text so the user can copy it by hand.
      const el = document.getElementById("debug-log-raw");
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
  };

  return (
    <div
      style={{
        marginTop: "var(--space-xl)",
        border: "1px solid var(--rule)",
        borderRadius: "var(--radius-md)",
        background: "var(--paper-2)",
        overflow: "hidden",
        fontFamily: "var(--font-body)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          padding: "0.75rem 1rem",
          cursor: "pointer",
          borderBottom: open ? "1px solid var(--rule)" : "none",
        }}
        onClick={() => setOpen(o => !o)}
      >
        <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--ink)" }}>
          🔍 Debug Log
        </span>
        <span style={{ fontSize: "0.8rem", color: "var(--ink-3)" }}>
          {trace.steps.length} steps · {trace.durationMs} ms
        </span>
        <span style={{ flex: 1 }} />
        <button
          onClick={e => { e.stopPropagation(); copy(); }}
          style={{
            fontSize: "0.8rem",
            padding: "0.35rem 0.75rem",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--rule)",
            background: copied ? "var(--success-bg)" : "var(--paper)",
            color: copied ? "var(--success)" : "var(--ink-2)",
            cursor: "pointer",
          }}
        >
          {copied ? "✓ Copied" : "Copy full log"}
        </button>
        <span style={{ fontSize: "0.8rem", color: "var(--ink-3)" }}>{open ? "▲" : "▼"}</span>
      </div>

      {open && (
        <div id="debug-log-raw" style={{ padding: "0.5rem 1rem 1rem", maxHeight: "70vh", overflowY: "auto" }}>
          {trace.steps.map((s, i) => (
            <div
              key={i}
              style={{
                padding: "0.6rem 0",
                borderBottom: i < trace.steps.length - 1 ? "1px solid var(--rule)" : "none",
              }}
            >
              <div style={{ display: "flex", gap: "0.6rem", alignItems: "baseline" }}>
                <span
                  style={{
                    fontSize: "0.72rem",
                    color: "var(--ink-3)",
                    fontVariantNumeric: "tabular-nums",
                    minWidth: "3.5rem",
                  }}
                >
                  +{s.t}ms
                </span>
                <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--ink)" }}>{s.label}</span>
              </div>
              {s.data !== undefined && (
                <pre
                  style={{
                    margin: "0.4rem 0 0 4.1rem",
                    padding: "0.6rem 0.8rem",
                    background: "var(--paper)",
                    border: "1px solid var(--rule)",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "0.75rem",
                    lineHeight: 1.5,
                    color: "var(--ink-2)",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    overflowX: "auto",
                  }}
                >
                  {fmtData(s.data)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
