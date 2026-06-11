import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { LanguageSelector } from "@burrowsoft/shared";
import { AppDownloadButtons } from "@/components/AppDownloadButtons";
import { Link } from "@/i18n/navigation";

const ALL_LOCALES = routing.locales as unknown as string[];

type FeatureKey = "scheduling" | "patients" | "records" | "prescriptions" | "payments" | "analytics";

const FEATURE_ICONS: Record<FeatureKey, React.ReactNode> = {
  scheduling: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
      <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
    </svg>
  ),
  patients: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  records: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  ),
  prescriptions: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <path d="M9 12h6M9 16h4" />
    </svg>
  ),
  payments: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  ),
  analytics: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
};

const FEATURE_KEYS: FeatureKey[] = ["scheduling", "patients", "records", "prescriptions", "payments", "analytics"];

export default async function HomePage() {
  const t = await getTranslations();

  const features = FEATURE_KEYS.map((key) => ({
    key,
    icon: FEATURE_ICONS[key],
    title: t(`features.${key}_title`),
    desc: t(`features.${key}_desc`),
  }));

  const highlights = [
    t("highlights.h1"),
    t("highlights.h2"),
    t("highlights.h3"),
    t("highlights.h4"),
    t("highlights.h5"),
    t("highlights.h6"),
  ];

  return (
    <>
      {/* Navbar */}
      <header className="sticky top-0 z-50 border-b border-slate-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-600">
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900">Solvymed</span>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSelector
              locales={ALL_LOCALES}
              className="text-xs border-slate-200 bg-white shadow-sm"
            />
            <Link
              href="/auth/login"
              className="rounded-lg border-2 border-teal-600 px-4 py-2 text-sm font-bold text-teal-700 transition-colors hover:bg-teal-50 whitespace-nowrap"
            >
              {t("auth.logIn")}
            </Link>
            <a
              href="#download"
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 whitespace-nowrap"
            >
              {t("getApp")}
            </a>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden bg-gradient-to-br from-teal-950 via-teal-900 to-slate-900 py-24 text-white md:py-36">
          <div className="absolute inset-0 opacity-10">
            <svg className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
                  <path d="M 32 0 L 0 0 0 32" fill="none" stroke="white" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
            </svg>
          </div>
          <div className="relative mx-auto max-w-4xl px-4 text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-teal-400/30 bg-teal-400/10 px-4 py-1.5 text-sm font-medium text-teal-300">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-teal-400" />
              {t("hero.badge")}
            </div>
            <h1 className="mb-6 text-4xl font-extrabold leading-tight tracking-tight md:text-6xl">
              {t("hero.line1")}{" "}
              <span className="text-teal-400">{t("hero.line2")}</span>
            </h1>
            <p className="mx-auto mb-10 max-w-2xl text-lg text-slate-300 md:text-xl">
              {t("hero.subtitle")}
            </p>

            <div id="download">
              <AppDownloadButtons />
            </div>
          </div>
        </section>

        {/* Feature highlights bar */}
        <section className="border-b border-slate-100 bg-teal-50 py-8">
          <div className="mx-auto max-w-7xl px-4">
            <ul className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-sm font-medium text-teal-800">
              {highlights.map((label) => (
                <li key={label} className="flex items-center gap-2">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-teal-600">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  {label}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Features */}
        <section className="py-24">
          <div className="mx-auto max-w-7xl px-4">
            <div className="mb-16 text-center">
              <h2 className="mb-4 text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">
                {t("features.heading")}
              </h2>
              <p className="mx-auto max-w-xl text-slate-500">{t("features.sub")}</p>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((f) => (
                <div
                  key={f.key}
                  className="group rounded-2xl border border-slate-100 bg-white p-7 shadow-sm transition hover:border-teal-200 hover:shadow-md"
                >
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-teal-50 text-teal-600 transition group-hover:bg-teal-600 group-hover:text-white">
                    {f.icon}
                  </div>
                  <h3 className="mb-2 text-lg font-bold text-slate-900">{f.title}</h3>
                  <p className="text-sm leading-relaxed text-slate-500">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Secondary CTA */}
        <section className="bg-slate-900 py-24">
          <div className="mx-auto max-w-3xl px-4 text-center">
            <h2 className="mb-4 text-3xl font-extrabold text-white md:text-4xl">
              {t("cta.heading")}
            </h2>
            <p className="mb-10 text-slate-400">{t("cta.sub")}</p>
            <AppDownloadButtons />
          </div>
        </section>

      </main>

      {/* Footer */}
      <footer className="border-t border-slate-100 bg-white py-10">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2 text-slate-600">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-teal-600">
                <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                </svg>
              </div>
              <span className="text-sm font-semibold">Solvymed</span>
            </div>
            <p className="text-sm text-slate-400">{t("footer.copyright")}</p>
            <a
              href="mailto:support@solvymed.com"
              className="text-sm text-slate-400 transition hover:text-teal-600"
            >
              support@solvymed.com
            </a>
          </div>
        </div>
      </footer>
    </>
  );
}
