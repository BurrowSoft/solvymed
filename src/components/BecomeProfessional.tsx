"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { authErrorKey } from "@/lib/authErrors";
import { browserTimeZone, parseCountryChoice, SIGNUP_COUNTRY_COOKIE, type CountryChoice } from "@/lib/signupCountry";

// "Sou profissional de saúde" (Vitor, 10-18: a Thai doctor signed up as a
// patient with a made-up invite code and got stuck at the code gate). The
// web twin of the app's escape (13): a confirm step with the practice's
// country, then become_professional (migration 231; only an unlinked,
// role-less or unconnected "patient" may), a session refresh (the role is in
// the JWT metadata) and the professional welcome. The RPC has no default
// country (a silent BR would make a Thai doctor Brazilian), so one is chosen.
const COUNTRIES: { code: CountryChoice; flag: string; label: string }[] = [
  { code: "BR", flag: "🇧🇷", label: "Brasil" },
  { code: "TH", flag: "🇹🇭", label: "ประเทศไทย" },
];

function savedCountry(): CountryChoice | null {
  try {
    const raw = document.cookie.split("; ").find((c) => c.startsWith(`${SIGNUP_COUNTRY_COOKIE}=`))?.split("=")[1];
    return parseCountryChoice(raw);
  } catch {
    return null;
  }
}

export function BecomeProfessional({ locale }: { locale: string }) {
  const t = useTranslations("auth.becomeProfessional");
  const tErrors = useTranslations("auth.errors");
  const [open, setOpen] = useState(false);
  const [country, setCountry] = useState<CountryChoice | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  // Preselected from the sign-up's country choice, else the account's own.
  useEffect(() => {
    if (!open || country) return;
    const fromCookie = savedCountry();
    if (fromCookie) {
      setCountry(fromCookie);
      return;
    }
    createClient().auth.getUser().then(({ data: { user } }) => {
      const meta = parseCountryChoice(user?.user_metadata?.country as string | undefined);
      if (meta) setCountry((c) => c ?? meta);
    }).catch(() => {});
  }, [open, country]);

  async function switchAccount() {
    if (working || !country) return;
    setWorking(true);
    setError("");
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("become_professional", { p_country: country, p_time_zone: browserTimeZone() });
    // already_professional: a double tap (or another tab) already switched it;
    // nothing to fix, so on to the welcome as after a success (13).
    if (rpcError && !(rpcError.message ?? "").includes("already_professional")) {
      setWorking(false);
      const m = rpcError.message ?? "";
      setError(
        m.includes("patient_linked") ? t("errorLinked")
          : authErrorKey(rpcError) === "network" ? tErrors("network")
          : tErrors("generic"),
      );
      return;
    }
    // The role lives in the JWT metadata: refresh before routing.
    await supabase.auth.refreshSession().catch(() => null);
    window.location.assign(locale === "en" ? "/auth/professional-welcome" : `/${locale}/auth/professional-welcome`);
  }

  if (!open) {
    return (
      <button type="button" data-testid="become-professional" onClick={() => setOpen(true)} className="mt-4 w-full text-sm font-semibold text-teal-700 hover:underline">
        {t("link")}
      </button>
    );
  }

  return (
    <section role="dialog" aria-modal="false" aria-labelledby="become-professional-title" data-testid="become-professional-confirm" className="mt-4 space-y-3 rounded-2xl border border-teal-100 bg-teal-50/50 p-4 text-left">
      <h2 id="become-professional-title" className="text-sm font-bold text-slate-900">{t("link")}</h2>
      <p className="text-sm text-slate-600">{t("body")}</p>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-slate-700">{t("countryLabel")}</legend>
        <div className="grid grid-cols-2 gap-2">
          {COUNTRIES.map((c) => (
            <label key={c.code} className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 px-3 py-2 text-sm font-semibold ${country === c.code ? "border-teal-600 bg-white text-teal-900" : "border-slate-200 bg-white text-slate-700"}`}>
              <input type="radio" name="become-professional-country" value={c.code} checked={country === c.code} onChange={() => setCountry(c.code)} className="sr-only" />
              <span aria-hidden="true">{c.flag}</span>
              {c.label}
            </label>
          ))}
        </div>
      </fieldset>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          data-testid="become-professional-switch"
          disabled={working || !country}
          onClick={switchAccount}
          className="flex-1 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {working ? <span className="spinner-white" aria-hidden="true" /> : t("switch")}
        </button>
        <button type="button" onClick={() => { setOpen(false); setError(""); }} disabled={working} className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
          {t("cancel")}
        </button>
      </div>
    </section>
  );
}
