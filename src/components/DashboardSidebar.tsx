"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useState, useRef, useEffect } from "react";

interface Props {
  locale: string;
  firstName: string;
  email: string;
  photoUrl?: string | null;
}

const LOCALES: { code: string; label: string; short: string }[] = [
  { code: "en",    label: "English",           short: "EN" },
  { code: "pt-BR", label: "Português (BR)",    short: "PT" },
  { code: "fr",    label: "Français",           short: "FR" },
  { code: "de",    label: "Deutsch",            short: "DE" },
  { code: "it",    label: "Italiano",           short: "IT" },
  { code: "es",    label: "Español",            short: "ES" },
  { code: "ar",    label: "العربية",            short: "AR" },
  { code: "id",    label: "Bahasa Indonesia",   short: "ID" },
  { code: "ja",    label: "日本語",             short: "JA" },
  { code: "ko",    label: "한국어",             short: "KO" },
  { code: "ru",    label: "Русский",            short: "RU" },
  { code: "th",    label: "ภาษาไทย",           short: "TH" },
  { code: "vi",    label: "Tiếng Việt",         short: "VI" },
  { code: "zh",    label: "中文 (简体)",         short: "ZH" },
  { code: "zh-TW", label: "中文 (繁體)",        short: "TW" },
];

const ALL_LOCALE_CODES = LOCALES.map(l => l.code).join("|");
const LOCALE_RE = new RegExp(`^/(${ALL_LOCALE_CODES})(/|$)`);

const CalendarIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
    <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
  </svg>
);
const UsersIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);
const CardIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
    <rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>
  </svg>
);
const GearIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
    <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
);
const HomeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);
const MapPinIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
  </svg>
);
const LogoIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
    <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
  </svg>
);
const GlobeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
    <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>
);

function LanguageSwitcher({ locale }: { locale: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = LOCALES.find(l => l.code === locale) ?? LOCALES[0];

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function switchLocale(newLocale: string) {
    const pathWithoutLocale = pathname.replace(LOCALE_RE, "/");
    const newPath = newLocale === "en" ? pathWithoutLocale : `/${newLocale}${pathWithoutLocale}`;
    setOpen(false);
    router.push(newPath);
  }

  return (
    <div ref={ref} className="relative px-3 pb-2">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition"
      >
        <span className="text-slate-400"><GlobeIcon /></span>
        <span className="flex-1 text-left">{current.label}</span>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">{current.short}</span>
      </button>

      {open && (
        <div className="absolute bottom-full left-3 right-3 mb-1 z-50 rounded-xl border border-slate-100 bg-white shadow-lg overflow-hidden">
          <div className="max-h-60 overflow-y-auto py-1">
            {LOCALES.map(loc => (
              <button
                key={loc.code}
                onClick={() => switchLocale(loc.code)}
                className={`flex w-full items-center gap-3 px-3 py-2 text-sm transition ${
                  loc.code === locale
                    ? "bg-teal-50 text-teal-700 font-semibold"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span className="w-7 text-right text-[10px] font-bold text-slate-400">{loc.short}</span>
                <span>{loc.label}</span>
                {loc.code === locale && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="ml-auto h-3.5 w-3.5 text-teal-600">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function DashboardSidebar({ locale, firstName, email, photoUrl }: Props) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const prefix = locale === "en" ? "" : `/${locale}`;

  const isActive = (path: string) => {
    const full = `${prefix}${path}`;
    if (path === "/dashboard") return pathname === full;
    return pathname.startsWith(full);
  };

  const navItems = [
    { label: t("overview"), path: "/dashboard", icon: <HomeIcon /> },
    { label: t("schedule"), path: "/dashboard/schedule", icon: <CalendarIcon /> },
    { label: t("patients"), path: "/dashboard/patients", icon: <UsersIcon /> },
    { label: t("clinics"), path: "/dashboard/clinics", icon: <MapPinIcon /> },
    { label: t("payments"), path: "/dashboard/payments", icon: <CardIcon /> },
    { label: t("settings"), path: "/dashboard/settings", icon: <GearIcon /> },
  ];

  async function signOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  const NavLinks = () => (
    <nav className="flex-1 space-y-1 px-3 py-4">
      {navItems.map(({ label, path, icon }) => {
        const active = isActive(path);
        return (
          <Link
            key={path}
            href={`${prefix}${path}`}
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
              active
                ? "bg-teal-50 text-teal-700"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <span className={active ? "text-teal-600" : "text-slate-400"}>{icon}</span>
            {label}
            {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-teal-600" />}
          </Link>
        );
      })}
    </nav>
  );

  const UserPanel = () => (
    <div className="border-t border-slate-100 p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-100 text-sm font-bold text-teal-700 overflow-hidden">
          {photoUrl ? (
            <img src={photoUrl} alt="" className="h-9 w-9 object-cover" />
          ) : (
            firstName[0]?.toUpperCase()
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">Dr. {firstName}</p>
          <p className="truncate text-xs text-slate-400">{email}</p>
        </div>
        <button
          onClick={signOut}
          disabled={signingOut}
          title={t("signOut")}
          className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile menu button */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed top-4 left-4 z-50 flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-md border border-slate-100 lg:hidden"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5 text-slate-600">
          {mobileOpen
            ? <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>
            : <><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></>
          }
        </svg>
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-100 bg-white transition-transform duration-300 lg:static lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
        {/* Logo */}
        <div className="flex items-center gap-2.5 border-b border-slate-100 px-5 py-5">
          <img src="/solvymed_logo.png" alt="SolvyMed" className="h-8 w-8 rounded-lg" />
          <span className="text-xl font-bold tracking-tight text-slate-900">Solvymed</span>
        </div>

        <NavLinks />
        <LanguageSwitcher locale={locale} />
        <UserPanel />
      </aside>
    </>
  );
}
