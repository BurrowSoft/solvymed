"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { demoTitle, leaveDemo } from "@/lib/demo";
import type { CountryChoice } from "@/lib/signupCountry";
import { track } from "@/lib/track";
import { DemoBlockedSheet } from "./DemoGate";

// The demo's bar (specs/demo-mode.md, Vitor's two musts): fixed at the top of
// every dashboard page, amber, "DEMO" + what it is, and the solid teal
// "Criar minha conta grátis" that never scrolls away. At phone widths only
// "DEMO" and the button; the DEMO tag opens a small menu with "Sair da
// demonstração" there. The tab title gets "[Demo] " too. Its height is the
// dashboard's --demo-bar-h (3rem), which the layout and the sidebar offset by.
export function DemoBar({ locale, country }: { locale: string; country: CountryChoice }) {
  const t = useTranslations("demo");
  const prefix = locale === "en" ? "" : `/${locale}`;
  const [menu, setMenu] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // "[Demo] " in front of every page title, also after client navigations
  // (Next rewrites <title>; the observer puts the prefix back).
  useEffect(() => {
    const apply = () => {
      const next = demoTitle(document.title);
      if (next !== document.title) document.title = next;
    };
    apply();
    const obs = new MutationObserver(apply);
    obs.observe(document.head, { subtree: true, childList: true, characterData: true });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menu]);

  // Sign-up from the demo (01): the sandbox ends and the anonymous session is
  // signed out BEFORE the sign-up page loads; country prefilled, Google first
  // there. The demo's data is fictional and never carried over.
  async function signUp() {
    if (leaving) return;
    setLeaving(true);
    track("demo_signup_click", { where: "bar" });
    await leaveDemo(createClient());
    window.location.assign(`${prefix}/auth/signup?c=${country}&via=demo`);
  }

  async function exit() {
    if (leaving) return;
    setLeaving(true);
    track("demo_exit");
    await leaveDemo(createClient());
    window.location.assign(prefix || "/");
  }

  return (
    <>
    <DemoBlockedSheet locale={locale} country={country} />
    <div
      data-testid="demo-bar"
      role="region"
      aria-label={t("barLabel")}
      className="fixed inset-x-0 top-0 z-[60] flex h-12 items-center gap-2.5 bg-[#F59E0B] px-3 text-sm font-bold text-[#1F2937] shadow-md sm:px-4"
    >
      <div ref={menuRef} className="relative">
        <button
          type="button"
          data-testid="demo-menu"
          aria-haspopup="menu"
          aria-expanded={menu}
          aria-label={t("menu")}
          onClick={() => setMenu((m) => !m)}
          className="rounded bg-[#1F2937] px-2 py-0.5 text-[11px] tracking-widest text-[#F59E0B] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1F2937] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F59E0B]"
        >
          DEMO
        </button>
        {menu && (
          <div role="menu" className="absolute left-0 top-9 w-56 rounded-xl border border-slate-200 bg-white p-1 text-slate-800 shadow-xl">
            <button type="button" role="menuitem" data-testid="demo-exit" onClick={exit} disabled={leaving}
              className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold hover:bg-slate-50 disabled:opacity-60">
              {t("exit")}
            </button>
          </div>
        )}
      </div>
      <span className="min-w-0 flex-1 truncate">
        <span className="hidden sm:inline">{t("barText")}</span>
        <span className="sm:hidden">{t("barTextShort")}</span>
      </span>
      <button type="button" onClick={exit} disabled={leaving}
        className="hidden shrink-0 text-xs font-semibold underline decoration-[#1F2937]/40 underline-offset-2 hover:decoration-[#1F2937] disabled:opacity-60 md:inline">
        {t("exit")}
      </button>
      <button
        type="button"
        data-testid="demo-signup"
        onClick={signUp}
        disabled={leaving}
        className="shrink-0 rounded-full bg-[#0D9488] px-3.5 py-2 text-[13px] font-bold text-white shadow-[0_2px_0_rgba(0,0,0,0.15)] transition hover:bg-[#0B7F75] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#116E99] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F59E0B] disabled:opacity-70"
      >
        <span className="hidden min-[380px]:inline">{t("signup")}</span>
        <span className="min-[380px]:hidden">{t("signupShort")}</span>
      </button>
    </div>
    </>
  );
}
