/**
 * Daily Edges email template.
 *
 * Takes the same `Leg` shape returned by /api/parlays?format=legs and renders
 * a dark-themed HTML email + plain-text mirror. Handles the "no edges today"
 * case honestly — markets are efficient some days, we don't manufacture picks.
 */

export interface EdgeLeg {
  sport: string;
  game: string;
  gameId?: string;
  commenceTime?: string;
  pick: string;
  market: string;
  odds: number;
  book: string;
  bookCount?: number;
  impliedProb: number;
  ourProb?: number;
  trueEdge?: number;
  scored?: boolean;
  fairProb?: number;
  sharpEdge?: boolean;
  evVsFair?: number;
  weatherNote?: string | null;
  pitcherNote?: string | null;
  reasons?: string[];
}

export interface GeneratedEmail {
  subject: string;
  html: string;
  text: string;
}

const SITE_URL = "https://bayparlays.vercel.app";
const BRAND_RED = "#FF3B3B";
const BG = "#0a0a0a";
const CARD_BG = "#141414";
const BORDER = "rgba(255,255,255,0.08)";
const TEXT = "#ededed";
const TEXT_DIM = "rgba(255,255,255,0.55)";
const TEXT_MUTED = "rgba(255,255,255,0.4)";

function formatOdds(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

function formatEv(n: number | undefined): string {
  if (typeof n !== "number") return "—";
  return `${n > 0 ? "+" : ""}${(n * 100).toFixed(2)}%`;
}

function formatPct(n: number | undefined): string {
  if (typeof n !== "number") return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function weekdayName(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "long", timeZone: "America/Los_Angeles" });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function unsubscribeUrl(email: string): string {
  return `${SITE_URL}/unsubscribe?email=${encodeURIComponent(email)}`;
}

/**
 * Generate the daily edges email for a single recipient.
 * Pass `email` so the unsubscribe link is pre-populated.
 */
export function generateEdgeEmail(
  legs: EdgeLeg[],
  email: string,
  now: Date = new Date(),
): GeneratedEmail {
  const top = legs.slice(0, 5);
  const day = weekdayName(now);

  // Empty case — honest signal beats fake picks.
  if (top.length === 0) {
    const subject = "No clean edges today";
    const html = emptyHtml(email);
    const text = emptyText(email);
    return { subject, html, text };
  }

  const topEv = top[0].evVsFair ?? top[0].trueEdge ?? 0;
  const subject = `🎯 ${top.length} sharp edge${top.length === 1 ? "" : "s"} for ${day} — top pick ${formatEv(topEv)} EV`;

  const html = buildHtml(top, email);
  const text = buildText(top, email);

  return { subject, html, text };
}

function buildHtml(legs: EdgeLeg[], email: string): string {
  const picksHtml = legs
    .map((leg, i) => edgeCardHtml(leg, i + 1))
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>BayParlays — Daily Edges</title>
</head>
<body style="margin:0;padding:0;background:${BG};color:${TEXT};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BG};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">

          <!-- Header -->
          <tr>
            <td style="padding:0 0 24px 0;border-bottom:1px solid ${BORDER};">
              <div style="font-family:'DM Serif Display',Georgia,serif;font-size:32px;line-height:1;color:${TEXT};letter-spacing:-0.5px;">
                BayParlays
              </div>
              <div style="margin-top:10px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${BRAND_RED};font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">
                Daily Edges
              </div>
            </td>
          </tr>

          <!-- Intro -->
          <tr>
            <td style="padding:24px 0 8px 0;">
              <p style="margin:0;font-size:15px;line-height:1.55;color:${TEXT_DIM};">
                Here's what the model caught today. All positive EV vs no-vig consensus across the market — the spots where retail books are slow to tighten after sharp money moves.
              </p>
            </td>
          </tr>

          <!-- Picks -->
          <tr>
            <td style="padding:16px 0;">
              ${picksHtml}
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td align="center" style="padding:16px 0 32px 0;border-top:1px solid ${BORDER};">
              <a href="${SITE_URL}/edges" style="display:inline-block;background:${BRAND_RED};color:${BG};text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:6px;letter-spacing:0.3px;">
                See full feed →
              </a>
              <div style="margin-top:12px;font-size:12px;color:${TEXT_MUTED};">
                bayparlays.vercel.app/edges
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 0;border-top:1px solid ${BORDER};">
              <p style="margin:0 0 8px 0;font-size:11px;line-height:1.5;color:${TEXT_MUTED};">
                Not financial advice. Gamble responsibly. 21+. If you or someone you know has a gambling problem, call 1-800-GAMBLER.
              </p>
              <p style="margin:0;font-size:11px;line-height:1.5;color:${TEXT_MUTED};">
                You're on the BayParlays list.
                <a href="${unsubscribeUrl(email)}" style="color:${TEXT_MUTED};text-decoration:underline;">Unsubscribe</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function edgeCardHtml(leg: EdgeLeg, rank: number): string {
  const ev = leg.evVsFair ?? leg.trueEdge ?? 0;
  const evColor = ev >= 0.02 ? "#22c55e" : ev >= 0.01 ? "#eab308" : TEXT_DIM;
  const sport = escapeHtml(leg.sport.toUpperCase());
  const pick = escapeHtml(leg.pick);
  const game = escapeHtml(leg.game);
  const market = escapeHtml(leg.market);
  const book = escapeHtml(leg.book);
  const sharpBadge = leg.sharpEdge
    ? `<span style="display:inline-block;margin-left:8px;font-size:10px;font-weight:600;color:#22c55e;letter-spacing:0.5px;text-transform:uppercase;">⚡ Sharp</span>`
    : "";

  const reasonsHtml = leg.reasons && leg.reasons.length
    ? `<div style="margin-top:14px;padding-top:14px;border-top:1px solid rgba(255,255,255,0.05);">
         ${leg.reasons
           .map(
             (r) =>
               `<div style="font-size:12px;line-height:1.55;color:${TEXT_DIM};margin-bottom:4px;">${escapeHtml(r)}</div>`,
           )
           .join("")}
       </div>`
    : "";

  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CARD_BG};border:1px solid ${BORDER};border-radius:8px;margin-bottom:12px;">
    <tr>
      <td style="padding:18px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="vertical-align:top;">
              <div style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:${TEXT_MUTED};font-family:ui-monospace,SFMono-Regular,Menlo,monospace;margin-bottom:6px;">
                #${String(rank).padStart(2, "0")} · <span style="color:#3b82f6;font-weight:600;">${sport}</span> · ${market}${sharpBadge}
              </div>
              <div style="font-size:18px;font-weight:600;line-height:1.25;color:${TEXT};margin-bottom:4px;">
                ${pick}
              </div>
              <div style="font-size:13px;color:${TEXT_DIM};">
                ${game}
              </div>
            </td>
            <td align="right" style="vertical-align:top;padding-left:16px;white-space:nowrap;">
              <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:24px;font-weight:500;color:${BRAND_RED};line-height:1;">
                ${formatOdds(leg.odds)}
              </div>
              <div style="margin-top:6px;font-size:11px;color:${TEXT_MUTED};">
                ${book}
              </div>
            </td>
          </tr>
        </table>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;padding-top:14px;border-top:1px solid ${BORDER};">
          <tr>
            <td style="width:33%;">
              <div style="font-size:10px;letter-spacing:0.5px;text-transform:uppercase;color:${TEXT_MUTED};margin-bottom:4px;">EV vs Fair</div>
              <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:14px;font-weight:500;color:${evColor};">${formatEv(ev)}</div>
            </td>
            <td style="width:33%;">
              <div style="font-size:10px;letter-spacing:0.5px;text-transform:uppercase;color:${TEXT_MUTED};margin-bottom:4px;">Fair Prob</div>
              <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:14px;font-weight:500;color:${TEXT};">${formatPct(leg.fairProb)}</div>
            </td>
            <td style="width:34%;">
              <div style="font-size:10px;letter-spacing:0.5px;text-transform:uppercase;color:${TEXT_MUTED};margin-bottom:4px;">Book Implied</div>
              <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:14px;font-weight:500;color:${TEXT_DIM};">${formatPct(leg.impliedProb)}</div>
            </td>
          </tr>
        </table>

        ${reasonsHtml}
      </td>
    </tr>
  </table>`;
}

function buildText(legs: EdgeLeg[], email: string): string {
  const lines: string[] = [];
  lines.push("BayParlays — Daily Edges");
  lines.push("");
  lines.push(
    "Here's what the model caught today. All positive EV vs no-vig consensus across the market.",
  );
  lines.push("");
  legs.forEach((leg, i) => {
    const ev = leg.evVsFair ?? leg.trueEdge ?? 0;
    lines.push(
      `#${String(i + 1).padStart(2, "0")}  ${leg.sport.toUpperCase()} · ${leg.market}${leg.sharpEdge ? " · SHARP" : ""}`,
    );
    lines.push(`  ${leg.pick}   ${formatOdds(leg.odds)}  (${leg.book})`);
    lines.push(`  ${leg.game}`);
    lines.push(
      `  EV ${formatEv(ev)}  |  Fair ${formatPct(leg.fairProb)}  |  Implied ${formatPct(leg.impliedProb)}`,
    );
    if (leg.reasons && leg.reasons.length) {
      leg.reasons.forEach((r) => lines.push(`  - ${r}`));
    }
    lines.push("");
  });
  lines.push(`See full feed: ${SITE_URL}/edges`);
  lines.push("");
  lines.push("Not financial advice. Gamble responsibly. 21+.");
  lines.push(`Unsubscribe: ${unsubscribeUrl(email)}`);
  return lines.join("\n");
}

function emptyHtml(email: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>BayParlays — No edges today</title>
</head>
<body style="margin:0;padding:0;background:${BG};color:${TEXT};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BG};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">
          <tr>
            <td style="padding:0 0 24px 0;border-bottom:1px solid ${BORDER};">
              <div style="font-family:'DM Serif Display',Georgia,serif;font-size:32px;color:${TEXT};letter-spacing:-0.5px;">BayParlays</div>
              <div style="margin-top:10px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${BRAND_RED};font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">Daily Edges</div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 0;">
              <h2 style="margin:0 0 16px 0;font-family:'DM Serif Display',Georgia,serif;font-size:24px;color:${TEXT};font-weight:normal;">No clean edges today.</h2>
              <p style="margin:0;font-size:15px;line-height:1.6;color:${TEXT_DIM};">
                Markets are efficient today — sending nothing is the honest answer. Back tomorrow morning with fresh picks.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 0;border-top:1px solid ${BORDER};">
              <p style="margin:0;font-size:11px;line-height:1.5;color:${TEXT_MUTED};">
                Not financial advice. Gamble responsibly. 21+.
                <a href="${unsubscribeUrl(email)}" style="color:${TEXT_MUTED};text-decoration:underline;">Unsubscribe</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function emptyText(email: string): string {
  return [
    "BayParlays — Daily Edges",
    "",
    "No clean edges today.",
    "",
    "Markets are efficient today — sending nothing is the honest answer. Back tomorrow morning with fresh picks.",
    "",
    "Not financial advice. Gamble responsibly. 21+.",
    `Unsubscribe: ${unsubscribeUrl(email)}`,
  ].join("\n");
}
