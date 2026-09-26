// Supabase Auth errors → a message key (auth.errors.*), from the error's
// stable code, never its raw message (aligned with the mobile app, #26).
// The wrong-credentials line is deliberately neutral: it never says which
// of the two was wrong, so it can't be used to find accounts.

export type AuthErrorKey =
  | "wrongCredentials"
  | "emailNotConfirmed"
  | "rateLimited"
  | "weakPassword"
  | "samePassword"
  | "accountClosed"
  | "linkExpired"
  | "captchaFailed"
  | "network"
  | "generic";

type AuthErrorLike = { code?: string; status?: number; name?: string; message?: string } | null | undefined;

const LINK_EXPIRED = new Set([
  "otp_expired",
  "session_not_found",
  "session_expired",
  "refresh_token_not_found",
  "refresh_token_already_used",
  "bad_jwt",
]);

export function authErrorKey(error: AuthErrorLike): AuthErrorKey | null {
  if (!error) return null;
  const code = error.code ?? "";
  if (code === "invalid_credentials") return "wrongCredentials";
  if (code === "email_not_confirmed") return "emailNotConfirmed";
  if (code === "over_request_rate_limit" || code === "over_email_send_rate_limit" || error.status === 429) return "rateLimited";
  if (code === "weak_password") return "weakPassword";
  if (code === "same_password") return "samePassword";
  if (code === "user_banned") return "accountClosed";
  if (LINK_EXPIRED.has(code) || code.startsWith("flow_state")) return "linkExpired";
  if (/captcha/i.test(code) || /captcha/i.test(error.message ?? "")) return "captchaFailed";
  if (error.name === "AuthRetryableFetchError" || error.status === 0 || /failed to fetch|network/i.test(error.message ?? "")) return "network";
  return "generic";
}
