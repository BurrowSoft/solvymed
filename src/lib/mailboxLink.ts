// "Abrir e-mail" on the "Confirme seu e-mail" page (01's spec, both
// platforms): the web mailbox of the address's provider, by its domain,
// the app's map exactly (13). An unknown domain: no button (never a guess;
// no BR/TH providers whose URLs nobody can vouch for).
const PROVIDERS: { domains: readonly string[]; url: string }[] = [
  { domains: ["gmail.com", "googlemail.com"], url: "https://mail.google.com" },
  { domains: ["outlook.com", "hotmail.com", "live.com", "msn.com", "outlook.com.br", "hotmail.com.br"], url: "https://outlook.live.com/mail" },
  { domains: ["yahoo.com", "yahoo.com.br", "ymail.com"], url: "https://mail.yahoo.com" },
  { domains: ["icloud.com", "me.com", "mac.com"], url: "https://www.icloud.com/mail" },
];

export function mailboxLink(email: string | null | undefined): string | null {
  const domain = (email ?? "").trim().toLowerCase().split("@")[1] ?? "";
  if (!domain) return null;
  return PROVIDERS.find((p) => p.domains.includes(domain))?.url ?? null;
}
