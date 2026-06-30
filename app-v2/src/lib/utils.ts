export const fmt$ = (n: number | null | undefined) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n || 0);

export const fmt$0 = (n: number | null | undefined) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n || 0);

export const fmtPct  = (n: number | null | undefined) => `${((n || 0) * 100).toFixed(4)}%`;
export const fmtPct2 = (n: number | null | undefined) => `${((n || 0) * 100).toFixed(2)}%`;
export const fmtBps  = (n: number | null | undefined) => `${Math.round((n || 0) * 10000)} bps`;

export function parseJSON(text: string): Record<string, unknown> | null {
  try {
    const clean = text.replace(/```json|```/g, "").trim();
    const s = clean.indexOf("{");
    const e = clean.lastIndexOf("}");
    if (s !== -1 && e !== -1) return JSON.parse(clean.slice(s, e + 1));
  } catch {}
  return null;
}
