"use client";

import { useState, useEffect, Fragment, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { getSettingsAction, saveApplicationAction, getApplicationAction } from "@/lib/actions/applications";
import UploadStep    from "@/components/rep/UploadStep";
import AnalysisStep  from "@/components/rep/AnalysisStep";
import PricingStep   from "@/components/rep/PricingStep";
import ProposalStep  from "@/components/rep/ProposalStep";
import ApplyStep     from "@/components/rep/ApplyStep";
import type { MerchantApplication, StatementAnalysis, ProposalOutput, Processor, ProcessorTier, AppSettings } from "@/types/merchant";
import styles from "./proposals-new.module.css";

const STEPS = ["Upload", "Analysis", "Pricing", "Proposal", "Apply"] as const;
type Step = 0 | 1 | 2 | 3 | 4;

function newApp(): MerchantApplication {
  return {
    id: `app_${Date.now()}`,
    ownerUserId: "", // stamped from the session by saveApplicationAction on first save
    customerUserId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    stage: "analysis",
    hubspotDealId: null,
    tenantLink: null,
    adyenIds: null,
    adyenOnboardingUrl: null,
    checkIds: null,
    hubspotIds: null,
    quoteConfig: null,
    quoteLines: null,
    targetMargin: null,
    pricingModel: null,
    customerLinkToken: null,
    customerLinkPurpose: null,
    customerLinkSentAt: null,
    customerLinkExpiresAt: null,
    analysis: null,
    proposal: null,
    business: null,
    ownerContact: null,
    processing: null,
    agreement: null,
  };
}

// Which step to reopen a saved application at, based on how far it got.
// Pricing-step inputs aren't persisted, so an app with an analysis but no
// proposal reopens at Analysis and the rep re-runs Pricing from there.
function stepForApp(app: MerchantApplication): Step {
  if (app.analysis && app.proposal) return 3; // Proposal
  if (app.analysis) return 1;                  // Analysis
  return 0;                                    // Upload
}

function NewProposalFlow() {
  const searchParams = useSearchParams();
  const resumeId = searchParams.get("id");

  const [step, setStep]           = useState<Step>(0);
  const [app, setApp]             = useState<MerchantApplication>(newApp());
  const [settings, setSettings]   = useState<AppSettings | null>(null);
  const [loading, setLoading]     = useState<boolean>(!!resumeId);

  useEffect(() => {
    getSettingsAction().then(s => setSettings(s)).catch(() => {});
  }, []);

  // Resume an existing application when arriving with ?id=… (from the dashboard).
  useEffect(() => {
    if (!resumeId) return;
    let cancelled = false;
    setLoading(true);
    getApplicationAction(resumeId)
      .then(existing => {
        if (cancelled) return;
        if (existing) {
          setApp(existing);
          setStep(stepForApp(existing));
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [resumeId]);

  const activeProcessor: Processor | null =
    settings?.processors?.find(p => p.isDefault) ?? settings?.processors?.[0] ?? null;
  const activeTier: ProcessorTier | null =
    activeProcessor?.tiers?.find(t => t.isDefault) ?? activeProcessor?.tiers?.[0] ?? null;

  const handleAnalyzed = async (rawAnalysis: Record<string, unknown>) => {
    const analysis = rawAnalysis as StatementAnalysis;
    const updated: MerchantApplication = { ...app, analysis, stage: "analysis", updatedAt: new Date().toISOString() };
    const saved = await saveApplicationAction(updated);
    setApp(saved);
    setStep(1);
  };

  const handleProposal = async (proposal: ProposalOutput) => {
    const updated: MerchantApplication = { ...app, proposal, stage: "proposal_ready", updatedAt: new Date().toISOString() };
    const saved = await saveApplicationAction(updated);
    setApp(saved);
    setStep(3);
  };

  const handleSaved = async (updated: MerchantApplication) => {
    const saved = await saveApplicationAction(updated);
    setApp(saved);
  };

  const reset = () => {
    setApp(newApp());
    setStep(0);
  };

  if (loading) {
    return <div className={styles.page}><p style={{ padding: "2rem", opacity: 0.6 }}>Loading proposal…</p></div>;
  }

  return (
    <div className={styles.page}>
      {/* Step indicator */}
      <div className={styles.stepperRow}>
        <div className={styles.stepper}>
          {STEPS.map((name, i) => {
            const done   = i < step;
            const active = i === step;
            return (
              <Fragment key={name}>
                {i > 0 && <div className={styles.connector} data-done={i <= step} />}
                <button
                  disabled={i > step}
                  onClick={() => i < step ? setStep(i as Step) : undefined}
                  data-state={active ? "active" : done ? "done" : "pending"}
                  data-clickable={i < step}
                  className={styles.step}
                >
                  <span className={styles.stepCircle}>{done ? "✓" : i + 1}</span>
                  <span className={styles.stepLabel}>{name}</span>
                </button>
              </Fragment>
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

export default function NewProposalPage() {
  return (
    <Suspense>
      <NewProposalFlow />
    </Suspense>
  );
}
