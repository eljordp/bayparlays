/**
 * Resend email wrapper.
 *
 * Uses fetch() directly against the Resend REST API so we don't need to add
 * the `resend` npm package for v1. If RESEND_API_KEY is missing we log a
 * warning and return a no-op success — that way the daily cron doesn't throw
 * in preview environments or before the key is wired in production.
 *
 * NOTE: The `from` address uses `mail.bayparlays.com`, which JP must verify
 * inside Resend (Domains → Add Domain → DNS TXT/MX records → Verify) before
 * sends will succeed. Until that's done Resend will return a 403.
 */

export const DOMAIN = "mail.bayparlays.com";
export const FROM_ADDRESS = `BayParlays <edges@${DOMAIN}>`;

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text: string;
  from?: string;
}

export interface SendEmailResult {
  ok: boolean;
  id?: string;
  error?: string;
  skipped?: boolean;
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
  from = FROM_ADDRESS,
}: SendEmailParams): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(
      "[lib/email] RESEND_API_KEY not set — skipping send to",
      to,
    );
    return { ok: true, skipped: true };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html, text }),
    });

    const data = (await res.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      name?: string;
    };

    if (!res.ok) {
      return {
        ok: false,
        error: data.message || data.name || `HTTP ${res.status}`,
      };
    }

    return { ok: true, id: data.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
