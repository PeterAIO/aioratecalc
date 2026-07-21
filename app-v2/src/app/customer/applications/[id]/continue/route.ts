import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { postgresStorage } from "@/lib/storage/postgresAdapter";
import { createOnboardingLink } from "@/lib/adapters/adyen";

// "Continue Verification" target. Adyen hosted-onboarding links are single-use
// and expire in minutes, so we never re-serve the stored one (that lands the
// merchant on Adyen's /uo/error/startup-failed page). Every click mints a
// fresh link for the app's existing legal entity and redirects to it.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user || session.user.role !== "customer") {
    return NextResponse.redirect(new URL("/customer/login", req.url));
  }

  const app = await postgresStorage.getApplicationForCustomer(session.user.id, id);
  if (!app) {
    return NextResponse.redirect(new URL("/customer", req.url));
  }

  const legalEntityId = app.adyenIds?.legalEntityId;
  if (!legalEntityId) {
    // Onboarding never actually started — send them to submit their details.
    return NextResponse.redirect(new URL(`/customer/applications/${id}/edit`, req.url));
  }

  try {
    const url = await createOnboardingLink(legalEntityId, id);
    // Keep the stored URL current for admin visibility; the click always
    // regenerates regardless of what's persisted.
    await postgresStorage.updateApplicationAsCustomer(session.user.id, id, { adyenOnboardingUrl: url });
    return NextResponse.redirect(url);
  } catch (err) {
    console.error("Failed to regenerate Adyen onboarding link:", err instanceof Error ? err.message : err);
    return NextResponse.redirect(new URL(`/customer/applications/${id}?error=onboarding_link`, req.url));
  }
}
