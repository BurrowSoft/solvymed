import { conditionMet } from "@/lib/conditions";

// The re-engagement tips (specs/reengagement-contract.md, agreed v3, 10-29): a doctor's
// "Dicas e lembretes do SolvyMed" switches (push / e-mail) in Configurações → Notificações,
// and the e-mails' one-click "stop tips by e-mail" link. Both read 276's RPCs
// (tips_prefs_get / tips_prefs_set / tips_email_optout_confirm), so everything here waits
// for tips-toggles-live (276 live). The privacy text that names them merges after (§0).

export function tipsTogglesLive(): boolean {
  return conditionMet("tips-toggles-live");
}

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
