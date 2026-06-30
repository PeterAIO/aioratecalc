"use client";

import { useState, useEffect } from "react";
import { LocalStorageAdapter } from "@/lib/storage/localStorageAdapter";
import type { AppSettings, Processor, ProcessorTier } from "@/types/merchant";

const T = { green: "#22c55e", blue: "#0ea5e9", red: "#ef4444", accent: "#f9674e", muted: "#64748b", white: "#e2e8f0", card: "#0f1628", cardBorder: "#1e2d45" };
const CARD: React.CSSProperties  = { background: T.card, border: `1px solid ${T.cardBorder}`, borderRadius: 12, padding: 24, marginBottom: 20 };
const INPUT: React.CSSProperties = { width: "100%", padding: "10px 12px", background: "#0a0f1e", border: `1px solid ${T.cardBorder}`, borderRadius: 8, color: "#e2e8f0", fontSize: 14, outline: "none" };
const LABEL: React.CSSProperties = { fontSize: 12, color: T.muted, marginBottom: 6, display: "block" };
const BTN: React.CSSProperties   = { padding: "10px 20px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", border: "none" };

const DEFAULT_PROCESSOR: Processor = {
  id: "adyen", name: "Adyen (AIO)", isDefault: true,
  tiers: [{
    id: "adyen-standard", name: "Standard", isDefault: true,
    processingBps: 0.0010, perTxnFee: 0.12, schemeBps: 0.0005, monthlyFee: 0,
  }],
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>({
    processors: [DEFAULT_PROCESSOR],
    adyenConfig: { corsProxy: "https://corsproxy.io/?", environment: "test", lemApiKey: "", managementApiKey: "", balancePlatformApiKey: "", companyId: "" },
  });
  const [saved, setSaved]         = useState(false);
  const [loading, setLoading]     = useState(true);
  const [activeProc, setActiveProc] = useState(0);
  const [activeTier, setActiveTier] = useState(0);

  useEffect(() => {
    const storage = new LocalStorageAdapter();
    storage.getSettings().then(s => {
      if (s) setSettings(s);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const save = async () => {
    const storage = new LocalStorageAdapter();
    await storage.saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const setAdyen  = (k: string, v: string) => setSettings(s => ({ ...s, adyenConfig: { ...s.adyenConfig!, [k]: v } }));
  const setTier   = (pk: number, tk: number, k: keyof ProcessorTier, v: string | number | boolean) =>
    setSettings(s => {
      const procs = [...(s.processors || [])];
      const tiers = [...(procs[pk].tiers || [])];
      tiers[tk] = { ...tiers[tk], [k]: v };
      procs[pk] = { ...procs[pk], tiers };
      return { ...s, processors: procs };
    });
  const setProc = (pk: number, k: keyof Processor, v: string | boolean) =>
    setSettings(s => {
      const procs = [...(s.processors || [])];
      procs[pk] = { ...procs[pk], [k]: v };
      return { ...s, processors: procs };
    });

  const addProc = () => {
    const id = `proc_${Date.now()}`;
    setSettings(s => ({
      ...s,
      processors: [...(s.processors || []), { id, name: "New Processor", isDefault: false, tiers: [{ id: `${id}_t1`, name: "Standard", isDefault: true, processingBps: 0.001, perTxnFee: 0.12, schemeBps: 0.0005, monthlyFee: 0 }] }],
    }));
  };
  const addTier = (pk: number) => {
    const id = `tier_${Date.now()}`;
    setSettings(s => {
      const procs = [...(s.processors || [])];
      procs[pk] = { ...procs[pk], tiers: [...(procs[pk].tiers || []), { id, name: "New Tier", isDefault: false, processingBps: 0.001, perTxnFee: 0.12, schemeBps: 0.0005, monthlyFee: 0 }] };
      return { ...s, processors: procs };
    });
  };

  if (loading) return <div style={{ padding: 48, textAlign: "center", color: T.muted }}>Loading settings…</div>;

  const proc = settings.processors?.[activeProc];
  const tier = proc?.tiers?.[activeTier];

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: T.white, marginBottom: 4 }}>Settings</h1>
          <p style={{ fontSize: 14, color: T.muted }}>Processor rates, Adyen config, and defaults</p>
        </div>
        <button onClick={save} style={{ ...BTN, background: saved ? T.green : T.accent, color: "#fff", minWidth: 120 }}>
          {saved ? "✓ Saved" : "Save Settings"}
        </button>
      </div>

      {/* Processors */}
      <div style={CARD}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: T.white }}>Processors</h2>
          <button onClick={addProc} style={{ ...BTN, background: "#1e2d45", color: T.white, fontSize: 12 }}>+ Add Processor</button>
        </div>

        {/* Processor tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          {(settings.processors || []).map((p, i) => (
            <button key={p.id} onClick={() => { setActiveProc(i); setActiveTier(0); }} style={{ padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", border: `1px solid ${i === activeProc ? T.accent : T.cardBorder}`, background: i === activeProc ? `${T.accent}15` : "transparent", color: i === activeProc ? T.accent : T.muted }}>
              {p.name} {p.isDefault && <span style={{ fontSize: 10, background: T.accent, color: "#fff", padding: "1px 6px", borderRadius: 10, marginLeft: 6 }}>DEFAULT</span>}
            </button>
          ))}
        </div>

        {proc && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 12, marginBottom: 16 }}>
              <div>
                <label style={LABEL}>Processor Name</label>
                <input value={proc.name} onChange={e => setProc(activeProc, "name", e.target.value)} style={INPUT} />
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 0 }}>
                <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                  <input type="checkbox" checked={proc.isDefault} onChange={e => setProc(activeProc, "isDefault", e.target.checked)} style={{ accentColor: T.accent }} />
                  <span style={{ fontSize: 13, color: T.muted }}>Default processor</span>
                </label>
              </div>
            </div>

            {/* Tier tabs */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
              {(proc.tiers || []).map((t, i) => (
                <button key={t.id} onClick={() => setActiveTier(i)} style={{ padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", border: `1px solid ${i === activeTier ? T.blue : T.cardBorder}`, background: i === activeTier ? `${T.blue}15` : "transparent", color: i === activeTier ? T.blue : T.muted }}>
                  {t.name} {t.isDefault && "✓"}
                </button>
              ))}
              <button onClick={() => addTier(activeProc)} style={{ ...BTN, background: "transparent", color: T.muted, border: `1px solid ${T.cardBorder}`, fontSize: 12, padding: "6px 12px" }}>+ Tier</button>
            </div>

            {tier && (
              <div style={{ background: "#0a0f1e", borderRadius: 10, padding: 20 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
                  {[
                    { label: "Processing BPS (e.g. 0.0010)", key: "processingBps" as keyof ProcessorTier, val: tier.processingBps },
                    { label: "Scheme BPS (e.g. 0.0005)", key: "schemeBps" as keyof ProcessorTier, val: tier.schemeBps },
                    { label: "Per-Txn Fee ($)", key: "perTxnFee" as keyof ProcessorTier, val: tier.perTxnFee },
                    { label: "Monthly Fee ($)", key: "monthlyFee" as keyof ProcessorTier, val: tier.monthlyFee },
                  ].map(f => (
                    <div key={f.key}>
                      <label style={LABEL}>{f.label}</label>
                      <input
                        type="number" step="0.0001"
                        value={f.val}
                        onChange={e => setTier(activeProc, activeTier, f.key, parseFloat(e.target.value) || 0)}
                        style={INPUT}
                      />
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 12 }}>
                  <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                    <input type="checkbox" checked={tier.isDefault} onChange={e => setTier(activeProc, activeTier, "isDefault", e.target.checked)} style={{ accentColor: T.accent }} />
                    <span style={{ fontSize: 13, color: T.muted }}>Default tier</span>
                  </label>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Adyen config */}
      <div style={CARD}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: T.white, marginBottom: 4 }}>Adyen Config</h2>
        <p style={{ fontSize: 12, color: T.muted, marginBottom: 20 }}>Phase 2 — Adyen hosted onboarding. API keys should be set as env vars on Vercel, not stored here.</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <label style={LABEL}>CORS Proxy (legacy use only)</label>
            <input value={settings.adyenConfig?.corsProxy || ""} onChange={e => setAdyen("corsProxy", e.target.value)} style={INPUT} />
          </div>
          <div>
            <label style={LABEL}>Environment</label>
            <select value={settings.adyenConfig?.environment || "test"} onChange={e => setAdyen("environment", e.target.value)} style={{ ...INPUT, appearance: "auto" as const }}>
              <option value="test">test</option>
              <option value="live">live</option>
            </select>
          </div>
          <div>
            <label style={LABEL}>Company ID</label>
            <input value={settings.adyenConfig?.companyId || ""} onChange={e => setAdyen("companyId", e.target.value)} placeholder="YOUR_COMPANY_ID" style={INPUT} />
          </div>
        </div>
        <div style={{ marginTop: 16, padding: "12px 16px", background: "#1c1200", border: "1px solid #f59e0b40", borderRadius: 8 }}>
          <p style={{ fontSize: 12, color: "#f59e0b", lineHeight: 1.6 }}>
            For production: set <code>ADYEN_LEM_API_KEY</code>, <code>ADYEN_MANAGEMENT_API_KEY</code>, <code>ADYEN_WEBHOOK_HMAC_KEY</code> as Vercel env vars — never store API keys in localStorage.
          </p>
        </div>
      </div>
    </div>
  );
}
