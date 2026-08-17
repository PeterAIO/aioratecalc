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
  return [adyenModule(app), payrollModule(app)];
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

// Payroll is opt-in: unlike Adyen, nothing exists on Check's side until the
// customer starts this module themselves. Status reads the cached
// checkIds.onboardStatus snapshot rather than calling Check — the list and
// dashboard views render many applications at once (see syncPayrollStatusAction).
function payrollModule(app: MerchantApplication): OnboardingModule {
  const label = "Payroll (Check)";

  if (app.checkIds?.companyId) {
    if (app.checkIds.onboardStatus === "completed") {
      return {
        key: "payroll",
        label,
        status: "complete",
        description: "Payroll setup is complete.",
      };
    }
    return {
      key: "payroll",
      label,
      status: "in_progress",
      description: app.checkIds.onboardStatus === "blocking"
        ? "Payroll needs a few more details before you can run it."
        : "Finish setting up payroll with our payroll partner.",
      // NOT a stored link — Check onboard links are one-time use and expire
      // after 24h, so this route mints a fresh one per click (same rule as Adyen).
      href: `/customer/applications/${app.id}/payroll/continue`,
      ctaLabel: "Continue Payroll Setup",
    };
  }

  // Check needs the legal name, address, phone, and a contact email to create
  // the company, so payroll can't start before the business details exist.
  if (!app.business || !app.ownerContact) {
    return {
      key: "payroll",
      label,
      status: "not_started",
      description: "Add your business details first to set up payroll.",
    };
  }

  return {
    key: "payroll",
    label,
    status: "not_started",
    description: "Run payroll for your team through AIO.",
    href: `/customer/applications/${app.id}/payroll`,
    ctaLabel: "Set Up Payroll",
  };
}
