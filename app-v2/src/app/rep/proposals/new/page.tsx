"use client";

import { useState, useEffect } from "react";
import { LocalStorageAdapter } from "@/lib/storage/localStorageAdapter";
import UploadStep    from "@/components/rep/UploadStep";
import AnalysisStep  from "@/components/rep/AnalysisStep";
import PricingStep   from "@/components/rep/PricingStep";
import ProposalStep  from "@/components/rep/ProposalStep";
import ApplyStep     from "@/components/rep/ApplyStep";
import type { MerchantApplication, StatementAnalysis, ProposalOutput, Processor, ProcessorTier, AppSettings } from "@/types/merchant";

const STEPS = ["Upload", "Analysis", "Pricing", "Proposal", "Apply"] as const;
type Step = 0 | 1 | 2 | 3 | 4;

const T = { accent: "#f9674e", muted: "#64748b", white: "#e2e8f0", cardBorder: "#1e2d45", green: "#22c55e" };

function newApp(): MerchantApplication {
  return {
    id: `app_${Date.now()}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    stage: "analysis",
    hubspotDealId: null,
    adyenIds: null,
    adyenOnboardingUrl: null,
    merchantLinkToken: null,
    merchantLinkSentAt: null,
    merchantLinkExpiry: null,
    analysis: null,
    proposal: null,
    business: null,
    ownerContact: null,
    processing: null,
    agreement: null,
  };
}

export default function NewProposalPage() {
  const [step, setStep]           = useState<Step>(0);
  const [app, setApp]             = useState<MerchantApplication>(newApp());
  const [settings, setSettings]   = useState<AppSettings | null>(null);
  const [pricingModel, setModel]  = useState<string>("2-tier");
  const [targetMargin, setMargin] = useState(0.008);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storage = new LocalStorageAdapter();
    storage.getSettings().then(s => setSettings(s)).catch(() => {});
  }, []);

  const activeProcessor: Processor | null =
    settings?.processors?.find(p => p.isDefault) ?? settings?.processors?.[0] ?? null;
  const activeTier: ProcessorTier | null =
    activeProcessor?.tiers?.find(t => t.isDefault) ?? activeProcessor?.tiers?.[0] ?? null;

  const handleAnalyzed = async (rawAnalysis: Record<string, unknown>) => {
    const analysis = rawAnalysis as StatementAnalysis;
    const storage  = new LocalStorageAdapter();
    const updated: MerchantApplication = { ...app, analysis, stage: "analysis", updatedAt: new Date().toISOString() };
    setApp(updated);
    await storage.saveApplication(updated);
    setStep(1);
  };

  const handleProposal = async (proposal: ProposalOutput, model: string, margin: number) => {
    const storage  = new LocalStorageAdapter();
    const updated: MerchantApplication = { ...app, proposal, stage: "proposal_ready", updatedAt: new Date().toISOString() };
    setApp(updated);
    setModel(model);
    setMargin(margin);
    await storage.saveApplication(updated);
    setStep(3);
  };

  const handleSaved = (updated: MerchantApplication) => {
    setApp(updated);
  };

  const reset = () => {
    setApp(newApp());
    setStep(0);
  };

  return (
    <div>
      {/* Step indicator */}
      <div style={{ borderBottom: "1px solid #1e2d45", padding: "0 24px" }}>
        <div style={{ maxWidth: 800, margin: "0 auto", display: "flex", gap: 0 }}>
          {STEPS.map((name, i) => {
            const done   = i < step;
            const active = i === step;
            return (
              <button
                key={name}
                disabled={i > step}
                onClick={() => i < step ? setStep(i as Step) : undefined}
                style={{
                  padding: "14px 20px",
                  background: "transparent",
                  border: "none",
                  borderBottom: active ? `2px solid ${T.accent}` : done ? `2px solid ${T.green}` : "2px solid transparent",
                  cursor: i < step ? "pointer" : "default",
                  display: "flex", alignItems: "center", gap: 8,
                  transition: "all .15s",
                }}
              >
                <span style={{
                  width: 22, height: 22, borderRadius: "50%",
                  background: active ? T.accent : done ? T.green : "#1e2d45",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 700, color: active || done ? "#fff" : T.muted,
                  flexShrink: 0,
                }}>
                  {done ? "✓" : i + 1}
                </span>
                <span style={{ fontSize: 13, fontWeight: active ? 700 : 500, color: active ? T.white : done ? T.green : T.muted }}>
                  {name}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Step content */}
      {step === 0 && <UploadStep onAnalyzed={handleAnalyzed} />}
      {step === 1 && app.analysis && (
        <AnalysisStep
          analysis={app.analysis}
          activeProcessor={activeProcessor}
          activeTier={activeTier}
          onBack={() => setStep(0)}
          onContinue={() => setStep(2)}
        />
      )}
      {step === 2 && app.analysis && (
        <PricingStep
          analysis={app.analysis}
          activeProcessor={activeProcessor}
          activeTier={activeTier}
          onBack={() => setStep(1)}
          onProposal={handleProposal}
        />
      )}
      {step === 3 && app.analysis && app.proposal && (
        <ProposalStep
          analysis={app.analysis}
          proposal={app.proposal}
          activeProcessor={activeProcessor}
          activeTier={activeTier}
          targetMargin={targetMargin}
          netMargin={targetMargin}
          onBack={() => setStep(2)}
          onApply={() => setStep(4)}
          onNewProposal={reset}
        />
      )}
      {step === 4 && (
        <ApplyStep
          app={app}
          onSaved={handleSaved}
          onBack={() => setStep(3)}
          onNewProposal={reset}
        />
      )}
    </div>
  );
}
