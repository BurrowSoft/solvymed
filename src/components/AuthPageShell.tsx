import { LanguageSelector } from "@burrowsoft/shared";
import { useTranslations } from "next-intl";
import { routing } from "@/i18n/routing";
import { LegalLinks } from "./LegalLinks";

const ALL_LOCALES = routing.locales as unknown as string[];

// languageSwitcher={false} on pages opened from a one-time link (email
// confirmation, password reset): switching reloads the page, and the link's
// code or tokens can't be used twice.
export function AuthPageShell({
  children,
  languageSwitcher = true,
}: {
  children: React.ReactNode;
  languageSwitcher?: boolean;
}) {
  const tFooter = useTranslations("footer");
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
      {children}
      <div className="mt-6 mb-8 flex flex-wrap items-center justify-center gap-4">
        <LegalLinks />
        {languageSwitcher && (
          <LanguageSelector locales={ALL_LOCALES} className="text-xs border-slate-200 shadow-sm" ariaLabel={tFooter("languageLabel")} />
        )}
      </div>
    </div>
  );
}
