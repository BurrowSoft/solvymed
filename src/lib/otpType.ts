import type { EmailOtpType } from "@supabase/supabase-js";

// The types verifyOtp accepts for a token_hash link. The send-email hook's
// email_change_new is the email_change verification; anything else
// (missing, reauthentication, unknown) is refused, never verified with a
// guessed type.
const OTP_TYPES: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];
const TYPE_ALIASES: Record<string, EmailOtpType> = { email_change_new: "email_change" };

export function otpTypeFor(type: string | null | undefined): EmailOtpType | null {
  if (!type) return null;
  if (TYPE_ALIASES[type]) return TYPE_ALIASES[type];
  return (OTP_TYPES as string[]).includes(type) ? (type as EmailOtpType) : null;
}
