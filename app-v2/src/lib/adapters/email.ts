// Phase 4: transactional email via Resend's HTTP API (no SDK/nodemailer needed).
// Unlike adyen.ts/hubspot.ts (which throw on missing config since they're only
// called from authenticated staff flows where a config error is actionable),
// this degrades gracefully — the caller is an anonymous customer who can't see
// a server error either way, so returning the link directly lets the calling
// code surface it in the UI until RESEND_API_KEY is configured.

export interface SendMagicLinkResult {
  sent: boolean;
  devUrl: string | null;
}

export async function sendMagicLinkEmail(to: string, url: string): Promise<SendMagicLinkResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, devUrl: url };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "AIO Payments <onboarding@resend.dev>",
      to,
      subject: "Continue your AIO Payments application",
      html: `<p>Click below to continue your application:</p><p><a href="${url}">Continue your application &rarr;</a></p><p>This link expires in 30 minutes.</p>`,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend send failed: ${body}`);
  }
  return { sent: true, devUrl: null };
}
