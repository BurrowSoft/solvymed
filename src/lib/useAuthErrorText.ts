import { useTranslations } from "next-intl";
import { authErrorKey } from "@/lib/authErrors";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";

// Translated text for a Supabase Auth error (for client components): the
// UX-approved line for its code, never the raw message. Null when no error.
export function useAuthErrorText() {
  const t = useTranslations("auth");
  return (error: Parameters<typeof authErrorKey>[0]): string | null => {
    const key = authErrorKey(error);
    if (!key) return null;
    if (key === "captchaFailed") return t("captchaFailed");
    if (key === "weakPassword") return t("errors.weakPassword", { min: MIN_PASSWORD_LENGTH });
    return t(`errors.${key}`);
  };
}
