"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Card } from "./SettingsClient";
import { createClient } from "@/lib/supabase/client";
import { BRAND_LIMITS, removeBrandImage, saveMyBrand, uploadBrandImage, type Brand } from "@/lib/brand";
import { BRAND_INPUT_MAX_BYTES, BRAND_INPUT_TYPES, BrandImageTooLarge, BrandNotAnImage } from "@/lib/brandImage";
import { brandAccent, brandInitials, DEFAULT_ACCENT, isAccentHex, readableAccent } from "@/lib/readableAccent";

// Configurações → Minha marca / My brand (1.5.0, behind liveFeatures.myBrand):
// the name, title, specialty and registration line patients see, an accent
// colour, a logo (one upload, a square + a wide version) and a photo.
// Empty text fields fall back to the profile's own (the RPC does it).

// Presets (any colour is allowed; the rendering keeps text readable).
export const ACCENT_PRESETS = ["#116e99", "#0d9488", "#2563eb", "#7c3aed", "#db2777", "#dc2626", "#ea580c", "#16a34a", "#334155"];

// The backgrounds the website renders the accent on (light card, dark card).
const LIGHT_BG = "#ffffff";
const DARK_BG = "#0f172b";

export function BrandCard({ uid, brand, fallback }: {
  uid: string;
  brand: Brand | null;
  // The profile's own, shown as placeholders: what an empty field becomes.
  fallback: { fullName: string; specialty: string; registration: string };
}) {
  const t = useTranslations("brand");
  const router = useRouter();
  const [displayName, setDisplayName] = useState(brand?.displayName ?? "");
  const [title, setTitle] = useState(brand?.title ?? "");
  const [specialty, setSpecialty] = useState(brand?.specialty ?? "");
  const [registrationLine, setRegistrationLine] = useState(brand?.registrationLine ?? "");
  const [accent, setAccent] = useState<string | null>(brand?.accentColor ?? null);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [busy, setBusy] = useState<null | "logo" | "photo">(null);
  const [imageError, setImageError] = useState("");

  const shown = brandAccent(accent);
  const light = readableAccent(shown, LIGHT_BG);
  const name = [title.trim(), (displayName.trim() || fallback.fullName).trim()].filter(Boolean).join(" ");

  async function save() {
    setState("saving");
    const res = await saveMyBrand(createClient(), { displayName, title, specialty, registrationLine, accentColor: accent });
    setState(res.ok ? "saved" : "error");
    if (res.ok) router.refresh();
  }

  async function onFile(what: "logo" | "photo", file: File | undefined) {
    setImageError("");
    if (!file) return;
    if (!BRAND_INPUT_TYPES.includes(file.type)) return setImageError(t("badType"));
    if (file.size > BRAND_INPUT_MAX_BYTES) return setImageError(t("tooLarge"));
    setBusy(what);
    try {
      await uploadBrandImage(createClient(), uid, file, what);
      router.refresh();
    } catch (err) {
      setImageError(err instanceof BrandImageTooLarge ? t("tooLarge") : err instanceof BrandNotAnImage ? t("badType") : t("uploadError"));
    } finally {
      setBusy(null);
    }
  }

  async function onRemove(what: "logo" | "photo") {
    setImageError("");
    setBusy(what);
    try {
      await removeBrandImage(createClient(), what);
      router.refresh();
    } catch {
      setImageError(t("uploadError"));
    } finally {
      setBusy(null);
    }
  }

  const field = (id: string, label: string, value: string, set: (v: string) => void, max: number, placeholder?: string) => (
    <div>
      <label htmlFor={id} className="field-label">{label}</label>
      <input id={id} type="text" value={value} maxLength={max} placeholder={placeholder}
        onChange={(e) => { set(e.target.value); setState("idle"); }} className="text-input" />
    </div>
  );

  return (
    <Card title={t("title")} description={t("hint")} id="brand">
      <div data-testid="brand-card" className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          {field("brand-title", t("titleLabel"), title, setTitle, BRAND_LIMITS.title, t("titlePlaceholder"))}
          {field("brand-name", t("displayName"), displayName, setDisplayName, BRAND_LIMITS.displayName, fallback.fullName)}
          {field("brand-specialty", t("specialty"), specialty, setSpecialty, BRAND_LIMITS.specialty, fallback.specialty || undefined)}
          {field("brand-registration", t("registrationLine"), registrationLine, setRegistrationLine, BRAND_LIMITS.registrationLine, fallback.registration || t("registrationPlaceholder"))}
        </div>
        <p className="text-xs text-slate-500">{t("fallbackHint")}</p>

        {/* The accent: presets + any colour. */}
        <div>
          <p className="field-label">{t("accent")}</p>
          <div role="radiogroup" aria-label={t("accent")} className="flex flex-wrap items-center gap-2">
            {ACCENT_PRESETS.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={shown === c} aria-label={c}
                onClick={() => { setAccent(c === DEFAULT_ACCENT ? null : c); setState("idle"); }}
                className={`h-8 w-8 rounded-full border-2 ${shown === c ? "border-slate-900 ring-2 ring-offset-2 ring-slate-400" : "border-white shadow"}`}
                style={{ backgroundColor: c }} />
            ))}
            <label className="ml-1 inline-flex items-center gap-2 text-sm text-slate-600">
              <input type="color" aria-label={t("accentCustom")} value={shown}
                onChange={(e) => { if (isAccentHex(e.target.value)) { setAccent(e.target.value.toLowerCase()); setState("idle"); } }}
                className="h-8 w-10 cursor-pointer rounded border border-slate-200 bg-white" />
              {t("accentCustom")}
            </label>
          </div>
          {light !== shown && <p data-testid="accent-adjusted" className="mt-1.5 text-xs text-slate-500">{t("accentAdjusted", { color: light })}</p>}
        </div>

        {/* Logo and photo. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <ImageField label={t("logo")} hint={t("logoHint")} url={brand?.logoSquareUrl ?? null} own={!!brand?.own.logo}
            busy={busy === "logo"} disabled={!!busy} onFile={(f) => onFile("logo", f)} onRemove={() => onRemove("logo")} testid="brand-logo" />
          <ImageField label={t("photo")} hint={t("photoHint")} url={brand?.photoUrl ?? null} own={!!brand?.own.photo} round
            busy={busy === "photo"} disabled={!!busy} onFile={(f) => onFile("photo", f)} onRemove={() => onRemove("photo")} testid="brand-photo" />
        </div>
        {imageError && <p role="alert" className="text-sm text-red-600">{imageError}</p>}
        <p className="text-xs text-slate-500">{t("publicNote")}</p>

        {/* Preview on both backgrounds, with the readable accent. */}
        <div>
          <p className="field-label">{t("preview")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {([["light", LIGHT_BG, "#0c2230", "#4a6272"], ["dark", DARK_BG, "#f1f5f9", "#94a3b8"]] as const).map(([k, bg, fg, sub]) => {
              const a = readableAccent(shown, bg);
              return (
                <div key={k} data-testid={`brand-preview-${k}`} className="rounded-xl border border-slate-200 p-4" style={{ backgroundColor: bg }}>
                  <p className="mb-2 text-[11px] font-semibold uppercase" style={{ color: sub }}>{k === "light" ? t("previewLight") : t("previewDark")}</p>
                  <div className="flex items-center gap-3">
                    {brand?.logoSquareUrl
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={brand.logoSquareUrl} alt="" className="h-11 w-11 rounded-lg bg-white object-contain" />
                      : <span className="flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold text-white" style={{ backgroundColor: light }}>{brandInitials(name) || "•"}</span>}
                    <div className="min-w-0">
                      <p className="truncate font-bold" style={{ color: fg }}>{name}</p>
                      {(specialty || fallback.specialty) && <p className="truncate text-xs" style={{ color: sub }}>{specialty || fallback.specialty}</p>}
                    </div>
                  </div>
                  {/* White text on a button: the accent made readable against white. */}
                  <span className="mt-3 inline-block rounded-lg px-3 py-1.5 text-xs font-bold text-white" style={{ backgroundColor: light }}>{t("previewButton")}</span>
                  <p className="mt-2 text-xs font-semibold" style={{ color: a }}>{(registrationLine || fallback.registration) || " "}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button type="button" onClick={save} disabled={state === "saving"}
            className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-60">
            {state === "saving" ? t("saving") : t("save")}
          </button>
          {state === "saved" && <span role="status" className="text-sm font-medium text-teal-700">{t("saved")}</span>}
          {state === "error" && <span role="alert" className="text-sm text-red-600">{t("saveError")}</span>}
        </div>
      </div>
    </Card>
  );
}

function ImageField({ label, hint, url, own, round, busy, disabled, onFile, onRemove, testid }: {
  label: string; hint: string; url: string | null; own: boolean; round?: boolean; busy: boolean; disabled: boolean;
  onFile: (f: File | undefined) => void; onRemove: () => void; testid: string;
}) {
  const t = useTranslations("brand");
  const input = useRef<HTMLInputElement>(null);
  // Remove asks first (e7's copy): the image leaves the page and documents.
  const [confirming, setConfirming] = useState(false);
  return (
    <div data-testid={testid}>
      <p className="field-label">{label}</p>
      <div className="flex items-center gap-3">
        <div className={`flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden border border-slate-200 bg-slate-50 ${round ? "rounded-full" : "rounded-xl"}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {url && <img src={url} alt="" className={`h-full w-full ${round ? "object-cover" : "object-contain"}`} />}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={disabled} onClick={() => input.current?.click()}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
            {busy ? t("uploading") : url ? t("replace") : t("upload")}
          </button>
          {own && !confirming && (
            <button type="button" disabled={disabled} onClick={() => setConfirming(true)}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60">
              {t("remove")}
            </button>
          )}
        </div>
        <input ref={input} type="file" accept={BRAND_INPUT_TYPES.join(",")} className="hidden"
          onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
      {confirming && (
        <div role="alertdialog" aria-labelledby={`${testid}-remove-title`} data-testid={`${testid}-remove`} className="mt-2 rounded-xl border border-red-100 bg-red-50 p-3">
          <p id={`${testid}-remove-title`} className="text-sm font-semibold text-slate-900">{t("removeTitle")}</p>
          <p className="mt-0.5 text-xs text-slate-600">{t("removeBody")}</p>
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={disabled} onClick={() => { setConfirming(false); onRemove(); }}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
              {t("removeConfirm")}
            </button>
            <button type="button" onClick={() => setConfirming(false)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              {t("cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
