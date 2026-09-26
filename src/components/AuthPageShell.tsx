import { LanguageSelector } from "@burrowsoft/shared";
import { routing } from "@/i18n/routing";
import { LegalLinks } from "./LegalLinks";

const ALL_LOCALES = routing.locales as unknown as string[];

export function AuthPageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
      {children}
      <div className="mt-6 mb-8 flex flex-wrap items-center justify-center gap-4">
        <LegalLinks />
        <LanguageSelector locales={ALL_LOCALES} className="text-xs border-slate-200 shadow-sm" />
      </div>
    </div>
  );
}
