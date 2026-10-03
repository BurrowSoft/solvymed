// The Auth emails' layout (brand kit), as the app's edge functions build it
// (mobile notify-clinic-closed/format.ts brandedHtml): a #116E99 header with
// the white logo PNG on www (Gmail / Outlook drop SVG), a navy heading, slate
// text, and the tagline footer. Every value is escaped here.

const FONT = "Roboto,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function brandedHtml(a: { lang: string; heading: string; paragraphs: string[]; tagline: string }): string {
  return `<!DOCTYPE html><html lang="${escapeHtml(a.lang)}"><head><meta charset="UTF-8">`
    + '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
    + '<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><title>SolvyMed</title></head>'
    + '<body style="margin:0;padding:0;background-color:#EEF3F6;">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#EEF3F6;"><tr><td align="center" style="padding:32px 12px;">'
    + '<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;background-color:#FFFFFF;border-radius:12px;">'
    + '<tr><td bgcolor="#116E99" style="background-color:#116E99;padding:22px 32px;border-radius:12px 12px 0 0;">'
    + '<img src="https://www.solvymed.com/email/solvymed-logo-white.png" width="140" height="60" alt="SolvyMed" style="display:block;border:0;outline:none;text-decoration:none;width:140px;height:60px;">'
    + "</td></tr>"
    + `<tr><td style="padding:32px 32px 28px;font-family:${FONT};">`
    + `<h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;font-weight:700;color:#0C2230;">${escapeHtml(a.heading)}</h1>`
    + a.paragraphs.map((p) => `<p style="margin:0 0 10px;font-size:15px;line-height:1.6;color:#4A6272;">${escapeHtml(p)}</p>`).join("")
    + "</td></tr>"
    + `<tr><td style="padding:20px 32px 26px;border-top:1px solid #E3EAEF;font-family:${FONT};font-size:12px;line-height:1.5;color:#7A8C99;">`
    + `SolvyMed · ${escapeHtml(a.tagline)}<br><a href="https://www.solvymed.com" style="color:#116E99;text-decoration:none;">www.solvymed.com</a>`
    + "</td></tr></table></td></tr></table></body></html>";
}
