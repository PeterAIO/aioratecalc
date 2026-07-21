import type { MerchantApplication } from "@/types/merchant";

export type ModuleStatus = "not_started" | "in_progress" | "complete" | "coming_soon";

export type OnboardingModule = {
  key: string;
  label: string;
  status: ModuleStatus;
  description: string;
  href?: string;
  ctaLabel?: string;
};

export function getOnboardingModules(app: MerchantApplication): OnboardingModule[] {
  return [adyenModule(app), payrollModule()];
}

function adyenModule(app: MerchantApplication): OnboardingModule {
  const editHref = `/customer/applications/${app.id}/edit`;

  if (app.stage === "adyen_kyc_complete" || app.stage === "adyen_approved") {
    return {
      key: "adyen",
      label: "Payment Processing (Adyen)",
      status: "complete",
      description: "Verification complete.",
    };
  }

  if (app.adyenOnboardingUrl) {
    return {
      key: "adyen",
      label: "Payment Processing (Adyen)",
      status: "in_progress",
      description: "Finish identity verification with our processing partner.",
      // NOT the stored adyenOnboardingUrl — Adyen links are single-use and
      // expire in minutes, so reusing a stored one fails at startup. This
      // route mints a fresh link on each click, then redirects to Adyen.
      href: `/customer/applications/${app.id}/continue`,
      ctaLabel: "Continue Verification",
    };
  }

  if (app.business && app.ownerContact && app.processing && app.agreement) {
    return {
      key: "adyen",
      label: "Payment Processing (Adyen)",
      status: "in_progress",
      description: "Your details were saved — onboarding link is being generated.",
      href: editHref,
      ctaLabel: "Review Details",
    };
  }

  return {
    key: "adyen",
    label: "Payment Processing (Adyen)",
    status: "not_started",
    description: "Tell us about your business to start verification.",
    href: editHref,
    ctaLabel: "Get Started",
  };
}

// No payroll adapter/type exists yet — this is a static placeholder until a
// real integration is built.
function payrollModule(): OnboardingModule {
  return {
    key: "payroll",
    label: "Payroll",
    status: "coming_soon",
    description: "Coming soon.",
  };
}
