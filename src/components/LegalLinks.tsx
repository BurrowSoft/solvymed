import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

// Privacy Policy and Terms of Service links, in the page's language (the
// locale-aware Link adds the prefix). Used in the landing footer and under
// every auth page (via AuthPageShell); works in server and client components.
export function LegalLinks({ className = "" }: { className?: string }) {
  const t = useTranslations("footer");
  return (
    <nav aria-label={t("legal")} className={`flex items-center gap-4 text-sm text-slate-400 ${className}`}>
      <Link href="/privacy" className="transition hover:text-teal-600">{t("privacy")}</Link>
      <Link href="/terms" className="transition hover:text-teal-600">{t("terms")}</Link>
    </nav>
  );
}
