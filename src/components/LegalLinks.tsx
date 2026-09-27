import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { CookieSettingsButton } from "./CookieSettingsButton";

// Privacy Policy and Terms of Service links, in the page's language (the
// locale-aware Link adds the prefix), and "Cookie settings". Used in the landing footer and under
// every auth page (via AuthPageShell); works in server and client components.
export function LegalLinks({ className = "" }: { className?: string }) {
  const t = useTranslations("footer");
  return (
    <nav aria-label={t("legal")} className={`flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-slate-400 ${className}`}>
      <Link href="/privacy" className="transition hover:text-teal-600">{t("privacy")}</Link>
      <Link href="/terms" className="transition hover:text-teal-600">{t("terms")}</Link>
      <CookieSettingsButton className="transition hover:text-teal-600" />
    </nav>
  );
}
