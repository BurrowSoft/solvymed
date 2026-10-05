"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { GENERIC_SYSTEMS, OPTIONS, SYSTEMS, defaultFoundersCountry, systemName, type FoundersCountry } from "@/lib/founders";
import { track } from "@/lib/track";

// The Founders application form (the brief's 13 questions). It posts to
// /api/founders/apply; the database checks everything again. A hidden
// "website" field catches bots (the route drops them).
type Status = "idle" | "sending" | "new" | "waitlist";

const OPTION_KEYS = {
  usage_years: { lt1: "usageLt1", "1_3": "usage13", "3plus": "usage3plus" },
  patient_count_range: { lt200: "patientsLt200", "200_1000": "patients2001000", "1000_5000": "patients10005000", "5000plus": "patients5000plus" },
  wants: { patients: "wantsPatients", future_appointments: "wantsFuture", appointment_history: "wantsHistory", clinical_records: "wantsRecords", prescriptions: "wantsPrescriptions", files_exams: "wantsFiles" },
  can_export: { yes: "exportYes", not_sure: "exportNotSure", support_only: "exportSupport" },
  team_size: { alone: "teamAlone", one_secretary: "teamOne", two_plus: "teamTwo" },
} as const;
const GENERIC_KEYS = { other: "systemOther", spreadsheet: "systemSpreadsheet", paper: "systemPaper" } as const;

const input = "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20";
const label = "block text-sm font-semibold text-slate-700";

export function FoundersForm({ locale, defaultCountry, showRulesLink }: { locale: string; defaultCountry: FoundersCountry | ""; showRulesLink: boolean }) {
  const t = useTranslations("founders");
  const [country, setCountry] = useState<FoundersCountry | "">(defaultCountry);
  // No country from the language (English): the visitor's, when it's a
  // Founders country (Vercel geo via /api/geo), unless they already chose.
  useEffect(() => {
    if (defaultCountry) return;
    let gone = false;
    Promise.resolve()
      .then(() => fetch("/api/geo"))
      .then((r) => (r.ok ? r.json() : null))
      .then((g: { country?: string | null } | null) => {
        const c = defaultFoundersCountry(locale, g?.country);
        if (!gone && c) setCountry((cur) => cur || c);
      })
      .catch(() => {});
    return () => { gone = true; };
  }, [defaultCountry, locale]);
  const [system, setSystem] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<{ field?: string; text: string } | null>(null);
  const started = useRef(false);

  const systems = country ? SYSTEMS[country] : [];

  function onFirstInput() {
    if (started.current) return;
    started.current = true;
    track("founders_apply_started", { locale });
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!country) { setError({ field: "country", text: t("errorInvalid") }); return; }
    const f = new FormData(e.currentTarget);
    const body = {
      locale,
      country,
      full_name: f.get("full_name"),
      email: f.get("email"),
      phone: f.get("phone"),
      profession: f.get("profession"),
      registration_number: f.get("registration_number"),
      system,
      system_other: system === "other" ? f.get("system_other") : "",
      usage_years: f.get("usage_years"),
      patient_count_range: f.get("patient_count_range"),
      wants: f.getAll("wants"),
      can_export: f.get("can_export"),
      team_size: f.get("team_size"),
      consent: f.get("consent") === "on",
      website: f.get("website"),
    };
    setStatus("sending");
    try {
      const res = await fetch("/api/founders/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = (await res.json().catch(() => ({}))) as { status?: string; code?: string; field?: string };
      if (res.ok && (json.status === "new" || json.status === "waitlist")) {
        setStatus(json.status);
        track("founders_apply_submitted", { system, country });
        return;
      }
      setStatus("idle");
      if (json.code === "already_applied") setError({ text: t("errorAlreadyApplied") });
      else if (json.code === "too_many_attempts") setError({ text: t("errorRateLimit") });
      else if (json.code === "invalid") setError({ field: json.field, text: t("errorInvalid") });
      else setError({ text: t("errorGeneric") });
    } catch {
      setStatus("idle");
      setError({ text: t("errorGeneric") });
    }
  }

  if (status === "new" || status === "waitlist") {
    return (
      <p role="status" className="rounded-2xl bg-teal-50 p-6 text-center text-base font-semibold text-teal-800">
        {status === "new" ? t("successNew") : t("successWaitlist", { system: systemName(system) })}
      </p>
    );
  }

  const fieldError = (name: string) =>
    error?.field === name ? <p role="alert" className="mt-1 text-xs text-red-600">{error.text}</p> : null;
  const req = <span className="text-red-600" aria-label={t("required")}> *</span>;
  const radios = (name: keyof typeof OPTION_KEYS, q: string) => (
    <fieldset>
      <legend className={label}>{q}</legend>
      <div className="mt-2 flex flex-wrap gap-3">
        {(OPTIONS[name] as readonly string[]).map((v) => (
          <label key={v} className="flex items-center gap-2 text-sm text-slate-700">
            <input type="radio" name={name} value={v} className="h-4 w-4 accent-teal-600" />
            {t((OPTION_KEYS[name] as Record<string, string>)[v])}
          </label>
        ))}
      </div>
      {fieldError(name)}
    </fieldset>
  );

  return (
    <form onSubmit={submit} onInput={onFirstInput} className="space-y-5" noValidate>
      {/* A trap for bots: hidden from people and screen readers. */}
      <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label>Website<input type="text" name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>

      <label className={label}>{t("qName")}{req}<input name="full_name" required autoComplete="name" className={input} />{fieldError("full_name")}</label>
      <label className={label}>{t("qEmail")}{req}<input name="email" type="email" required autoComplete="email" className={input} />{fieldError("email")}</label>
      <label className={label}>{t("qPhone")}{req}<input name="phone" type="tel" required autoComplete="tel" className={input} />{fieldError("phone")}</label>

      <label className={label}>{t("qCountry")}{req}
        <select value={country} onChange={(e) => { setCountry(e.target.value as FoundersCountry); setSystem(""); }} className={input}>
          {!country && <option value="">{t("choose")}</option>}
          <option value="BR">{t("countryBR")}</option>
          <option value="TH">{t("countryTH")}</option>
        </select>
        <span className="mt-1 block text-xs font-normal text-slate-500">{t("countryOnly")}</span>
        {fieldError("country")}
      </label>

      <label className={label}>{t("qProfession")}<input name="profession" placeholder={t("qProfessionHint")} className={input} /></label>
      <label className={label}>{t("qRegistration")}<input name="registration_number" className={input} /></label>

      <label className={label}>{t("qSystem")}{req}
        <select value={system} onChange={(e) => setSystem(e.target.value)} required className={input}>
          <option value="">{t("choose")}</option>
          {systems.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
          {GENERIC_SYSTEMS.map((g) => <option key={g} value={g}>{t(GENERIC_KEYS[g])}</option>)}
        </select>
        {fieldError("system")}
      </label>
      {system === "other" && (
        <label className={label}>{t("qSystemOther")}{req}<input name="system_other" required className={input} />{fieldError("system_other")}</label>
      )}

      {radios("usage_years", t("qUsage"))}
      {radios("patient_count_range", t("qPatients"))}

      <fieldset>
        <legend className={label}>{t("qWants")}</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {OPTIONS.wants.map((v) => (
            <label key={v} className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="wants" value={v} className="h-4 w-4 accent-teal-600" />
              {t(OPTION_KEYS.wants[v])}
            </label>
          ))}
        </div>
      </fieldset>

      {radios("can_export", t("qExport"))}
      {radios("team_size", t("qTeam"))}

      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input type="checkbox" name="consent" required className="mt-0.5 h-4 w-4 accent-teal-600" />
        <span>
          {t.rich("consent", {
            rules: (chunks) => (showRulesLink ? <Link href="/founders/rules" className="font-semibold text-teal-700 underline">{chunks}</Link> : <>{chunks}</>),
          })}
          {req}
        </span>
      </label>
      {fieldError("consent")}

      {error && !error.field && <p role="alert" className="text-sm text-red-600">{error.text}</p>}
      <button type="submit" disabled={status === "sending"} className="w-full rounded-xl bg-teal-600 px-6 py-3 text-base font-bold text-white shadow transition hover:bg-teal-700 disabled:opacity-60">
        {status === "sending" ? t("sending") : t("submit")}
      </button>
    </form>
  );
}
