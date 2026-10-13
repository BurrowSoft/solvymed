"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Card } from "../SettingsClient";
import { studioCountry, type Design } from "@/lib/studio/design";
import type { PosterContent, PosterFormat } from "@/lib/pdf/poster";
import type { StudioDocData } from "@/lib/studio/forDocument";
import { dateLocale } from "@/lib/dateLabels";
import { countryProfile } from "@/lib/country";

// Document Studio PR5: posters and social images in the design (02,
// 10-13). Fill, preview, download: nothing is stored, nothing uploaded.
// Never patient data and never a signature (the renderer takes neither).
// The name + registration line always print; the specialty and a price
// only where the country allows (studioCountry).

export type PosterDay = { day: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun"; open: boolean; start: string; end: string; location: string | null };
const TEMPLATES = ["hours", "service", "announcement", "booking"] as const;
const FORMATS: PosterFormat[] = ["a4", "a3", "post", "story"];
// 2024-01-01 was a Monday: weekday names from Intl, in the page's language.
const DAY_INDEX: Record<PosterDay["day"], number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };

type Props = {
  design: Design;
  country: string;
  practice: StudioDocData["practice"];
  logos: StudioDocData["logos"];
  hours: PosterDay[] | null;
  inviteUrl: string | null;
};

export function StudioPosters({ design, country, practice, logos, hours, inviteUrl }: Props) {
  const t = useTranslations("studio");
  const locale = useLocale();
  const rules = studioCountry(country);
  const [template, setTemplate] = useState<(typeof TEMPLATES)[number]>("hours");
  const [format, setFormat] = useState<PosterFormat>("a4");
  const [headline, setHeadline] = useState("");
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [price, setPrice] = useState("");
  const [state, setState] = useState<"idle" | "rendering" | "ready" | "failed">("idle");
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const run = useRef(0);

  const dayName = useMemo(() => {
    const f = new Intl.DateTimeFormat(dateLocale(locale, countryProfile(country).calendar), { weekday: "long", timeZone: "UTC" });
    return (d: PosterDay["day"]) => { const s = f.format(new Date(Date.UTC(2024, 0, 1 + DAY_INDEX[d]))); return s.charAt(0).toLocaleUpperCase(locale) + s.slice(1); };
  }, [locale, country]);

  // What the poster says (null = it can't be made yet: no hours / no code).
  const content: PosterContent | null = useMemo(() => {
    if (template === "hours") {
      if (!hours?.some((h) => h.open)) return null;
      return {
        kind: "hours", title: headline.trim() || t("poster.defaultHours"), note: note.trim() || null,
        rows: hours.map((h) => ({ day: dayName(h.day), hours: h.open ? [`${h.start}–${h.end}`, h.location].filter(Boolean).join(" · ") : t("poster.closed") })),
      };
    }
    if (template === "booking") {
      if (!inviteUrl) return null;
      return { kind: "booking", title: headline.trim() || t("poster.defaultBooking"), qrUrl: inviteUrl, scanLabel: t("poster.scanToBook"), linkText: inviteUrl.replace(/^https?:\/\/(www\.)?/, "") };
    }
    if (!headline.trim()) return null;
    if (template === "service") return { kind: "service", title: headline.trim(), text: text.trim(), price: rules.posterPrice && price.trim() ? price.trim() : null, note: note.trim() || null };
    return { kind: "announcement", title: headline.trim(), text: text.trim() };
  }, [template, headline, text, note, price, hours, inviteUrl, dayName, rules.posterPrice, t]);

  const input = useMemo(() => content && {
    design, locale, format, content,
    practice: { displayName: practice.displayName, registrationLine: practice.registrationLine, clinicName: practice.clinicName, specialty: rules.posterSpecialty ? practice.specialty : null },
    contacts: design.footer.contacts.map((c) => c.value).filter((v) => v.trim()),
  }, [content, design, locale, format, practice, rules.posterSpecialty]);

  async function make(fmt: PosterFormat) {
    if (!input) throw new Error("nothing to make");
    const [{ renderPoster }, { fontsFor, bytesOf }] = await Promise.all([import("@/lib/pdf/poster"), import("@/lib/pdf/browser")]);
    const [fonts, square, reversed] = await Promise.all([fontsFor(design.font), bytesOf(logos.square), bytesOf(logos.reversed)]);
    return renderPoster({ ...input, format: fmt, logos: { square, reversed } }, fonts);
  }

  const key = JSON.stringify(input);
  useEffect(() => {
    if (!input) { setState("idle"); return; }
    const id = ++run.current;
    setState("rendering");
    const timer = window.setTimeout(async () => {
      try {
        // The preview: A3 looks like A4.
        const bytes = await make(format === "a3" ? "a4" : format);
        const { drawPages } = await import("@/lib/pdf/browser");
        const [page] = await drawPages(bytes, box.current?.clientWidth || 300, 1);
        if (id !== run.current || !canvas.current || !page) return;
        canvas.current.width = page.width;
        canvas.current.height = page.height;
        canvas.current.getContext("2d")?.drawImage(page, 0, 0);
        setState("ready");
      } catch {
        if (id === run.current) setState("failed");
      }
    }, 300);
    return () => window.clearTimeout(timer);
    // `key` stands for the whole input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  async function download() {
    try {
      const bytes = await make(format);
      const { downloadFile, pngOf } = await import("@/lib/pdf/browser");
      const name = `${t(`poster.templates.${template}`)} ${format.toUpperCase()}`;
      if (format === "post" || format === "story") {
        const { POSTER_PNG_WIDTH } = await import("@/lib/pdf/poster");
        downloadFile(await pngOf(bytes, POSTER_PNG_WIDTH), `${name}.png`);
      } else {
        downloadFile(bytes, `${name}.pdf`);
      }
    } catch {
      setState("failed");
    }
  }

  const choice = <V extends string>(name: string, value: V, options: readonly V[], label: (v: V) => string, set: (v: V) => void) => (
    <div role="radiogroup" aria-label={name} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={o} type="button" role="radio" aria-checked={value === o} onClick={() => set(o)}
          className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${value === o ? "border-teal-600 bg-teal-50 text-teal-800" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
          {label(o)}
        </button>
      ))}
    </div>
  );
  const aspect = format === "post" ? "1 / 1" : format === "story" ? "9 / 16" : "595 / 842";
  const blocked = template === "booking" && !inviteUrl ? t("poster.noInviteCode") : template === "hours" && !hours?.some((h) => h.open) ? t("poster.noHours") : null;

  return (
    <Card title={t("posters")} description={t("postersHint")}>
      <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,220px)]" data-testid="studio-posters">
        <div className="min-w-0 space-y-4">
          <div>
            <p className="field-label">{t("poster.template")}</p>
            {choice(t("poster.template"), template, TEMPLATES, (k) => t(`poster.templates.${k}`), setTemplate)}
          </div>
          {(template === "service" || template === "announcement" || template === "hours" || template === "booking") && (
            <div>
              <label htmlFor="poster-headline" className="field-label">{template === "service" ? t("poster.serviceName") : t("poster.headline")}</label>
              <input id="poster-headline" type="text" maxLength={80} value={headline} onChange={(e) => setHeadline(e.target.value)} className="text-input"
                placeholder={template === "hours" ? t("poster.defaultHours") : template === "booking" ? t("poster.defaultBooking") : undefined} />
            </div>
          )}
          {(template === "service" || template === "announcement") && (
            <div>
              <label htmlFor="poster-text" className="field-label">{template === "service" ? t("poster.serviceDescription") : t("poster.text")}</label>
              <textarea id="poster-text" rows={3} maxLength={300} value={text} onChange={(e) => setText(e.target.value)} className="text-input" />
            </div>
          )}
          {template === "service" && rules.posterPrice && (
            <div>
              <label htmlFor="poster-price" className="field-label">{t("poster.price")}</label>
              <input id="poster-price" type="text" maxLength={30} value={price} onChange={(e) => setPrice(e.target.value)} className="text-input" />
            </div>
          )}
          {(template === "service" || template === "hours") && (
            <div>
              <label htmlFor="poster-note" className="field-label">{t("poster.note")}</label>
              <input id="poster-note" type="text" maxLength={120} value={note} onChange={(e) => setNote(e.target.value)} className="text-input" />
            </div>
          )}
          <div>
            <p className="field-label">{t("poster.format")}</p>
            {choice(t("poster.format"), format, FORMATS, (f) => t(`poster.formats.${f}`), setFormat)}
          </div>
          {template === "booking" && inviteUrl && <p className="text-xs text-slate-500">{t("poster.newCodeNote")}</p>}
          {blocked && <p role="status" className="text-sm text-amber-700">{blocked}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" data-testid="poster-download" onClick={() => void download()} disabled={!input || state === "rendering"}
              className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-60">
              {t("poster.download")}
            </button>
            <p className="text-xs text-slate-500">{t("letterheadNotSaved")}</p>
          </div>
          {state === "failed" && <p role="alert" className="text-sm text-red-600">{t("previewFailed")}</p>}
        </div>
        <div ref={box} data-testid="poster-preview" data-state={state} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" style={{ aspectRatio: aspect }}>
          <canvas ref={canvas} role="img" aria-label={t("preview")} className={`h-full w-full ${state === "rendering" ? "opacity-70" : ""} ${input ? "" : "hidden"}`} />
        </div>
      </div>
    </Card>
  );
}
