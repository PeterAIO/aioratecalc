import type { Processor } from "@/types/merchant";

// Shared default — safe to import from both client components (settings UI)
// and server-only code (postgresAdapter's getSettings fallback).
export const DEFAULT_PROCESSOR: Processor = {
  id: "adyen", name: "Adyen (AIO)", isDefault: true,
  tiers: [{
    id: "adyen-standard", name: "Standard", isDefault: true,
    processingBps: 0.0010, perTxnFee: 0.12, schemeBps: 0.0005, monthlyFee: 0,
  }],
};
