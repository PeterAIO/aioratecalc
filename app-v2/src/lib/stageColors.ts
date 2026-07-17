const T = { green: "#22c55e", blue: "#0ea5e9", red: "#ef4444", accent: "#f9674e", gold: "#f59e0b", muted: "#64748b" };

export const STAGE_COLORS: Record<string, string> = {
  prospect_created: T.muted, lead_link_sent: T.gold, lead_analysis_pending: T.gold,
  analysis: T.muted, pricing: T.blue, proposal_ready: T.gold, proposal_sent: T.gold,
  merchant_link_sent: T.accent, merchant_filling: T.accent, adyen_kyc_pending: T.blue,
  adyen_kyc_complete: T.green, adyen_approved: T.green, closed_lost: T.red,
};
