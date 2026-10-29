// The re-engagement tips (specs/reengagement-contract.md, agreed v3, 10-29): a doctor's
// "Dicas e lembretes do SolvyMed" switches (push / e-mail) in Configurações → Notificações,
// and the e-mails' one-click "stop tips by e-mail" link. Both read 276's RPCs
// (tips_prefs_get / tips_prefs_set / tips_email_optout_confirm).
// The switches wait for the server flag tips_toggles (280; get_server_flags as the doctor, so
// the testers' allowlist applies), the same row the app reads: one write flips both (01).
// The unsubscribe page and route are never gated (01, 10-30): a sent e-mail's link must keep
// working, and without a real token they change nothing. Help and the App Map wait for the
// tips-toggles-live condition, flipped with the flag.
export const TIPS_TOGGLES_FLAG = "tips_toggles";

export type TipsPrefs = { push: boolean; email: boolean };

// 276's answer: anything that isn't a boolean reads as the default (on).
export function toTipsPrefs(data: unknown): TipsPrefs {
  const o = (data && typeof data === "object" ? data : {}) as { push?: unknown; email?: unknown };
  return { push: o.push !== false, email: o.email !== false };
}

// The unsubscribe token: 24 random bytes, base64url without padding = 32 characters
// (the mobile developer's tick mints it on the first e-mail).
const TOKEN = /^[A-Za-z0-9_-]{32}$/;

export function isWellFormedTipsToken(t: unknown): t is string {
  return typeof t === "string" && TOKEN.test(t);
}
