import { getTranslations } from "next-intl/server";
import { LanguageSelector } from "@burrowsoft/shared";
import { LegalLinks } from "@/components/LegalLinks";
import { SignupCta } from "@/components/SignupCta";
import { Link } from "@/i18n/navigation";
import { publicLocales } from "@/lib/publicLocales";
import { liveFeatures } from "@/lib/liveFeatures";
import { BrandLogo, BrandMarkTile } from "@/components/BrandLogo";

// The public pages' header and footer (home, /pricing).

// Offered languages (Thai stays hidden until the Thai release).
const ALL_LOCALES = publicLocales();

export async function SiteHeader() {
  const t = await getTranslations();
  return (
    <header className="sticky top-0 z-50 border-b border-slate-100 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4">
        <Link href="/" className="flex items-center gap-2">
          {/* Phones: the mark alone, so the header fits (no sideways scroll). */}
          <span className="sm:hidden"><BrandMarkTile size="sm" /></span>
          <span className="hidden sm:inline-flex"><BrandLogo className="h-9" /></span>
        </Link>
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Link href="/pricing" className="hidden text-sm font-semibold text-slate-600 transition-colors hover:text-teal-700 whitespace-nowrap md:inline-block">
            {t("pricing.navLabel")}
          </Link>
          <LanguageSelector
            locales={ALL_LOCALES}
            className="text-xs border-slate-200 bg-white shadow-sm"
            ariaLabel={t("footer.languageLabel")}
          />
          {/* Phones: "Log in" moves under the hero's signup button. */}
          <Link
            href="/auth/login"
            className="hidden rounded-lg border-2 border-teal-600 px-4 py-2 text-sm font-bold text-teal-700 transition-colors hover:bg-teal-50 whitespace-nowrap sm:inline-block"
          >
            {t("auth.logIn")}
          </Link>
          <SignupCta
            label={t("hero.signupCta")}
            className="max-w-[11rem] rounded-lg bg-teal-600 px-3 py-2 text-center text-sm font-bold leading-tight text-white shadow-sm transition-colors hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 sm:max-w-none sm:whitespace-nowrap sm:px-4"
          />
        </div>
      </div>
    </header>
  );
}

export async function SiteFooter() {
  const t = await getTranslations();
  return (
    <footer className="border-t border-slate-100 bg-white py-10">
      <div className="mx-auto max-w-7xl px-4">
        <div className="flex flex-col flex-wrap items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2 text-slate-600">
            <BrandLogo className="h-7" />
          </div>
          <p className="text-sm text-slate-400">{t("footer.copyright")}</p>
          <Link href="/pricing" className="text-sm text-slate-400 transition hover:text-teal-600">
            {t("pricing.navLabel")}
          </Link>
          {/* The Founders Program (off until its launch). */}
          {liveFeatures.founders && (
            <Link href="/founders" className="text-sm text-slate-400 transition hover:text-teal-600">
              {t("founders.footerLink")}
            </Link>
          )}
          <LegalLinks />
          <a
            href="mailto:support@solvymed.com"
            className="text-sm text-slate-400 transition hover:text-teal-600"
          >
            support@solvymed.com
          </a>
        </div>
      </div>
    </footer>
  );
}
