"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Card } from "../SettingsClient";
import { ReloadButton } from "@/components/ReloadButton";
import { timeLimit } from "@/lib/netError";
import { useLeaveGuard } from "@/components/DiscardGuard";
import { StudioPreview, type PreviewInput } from "./StudioPreview";
import { StudioPosters, type PosterDay } from "./StudioPosters";
import { StudioSignature } from "./StudioSignature";
import { useDemo } from "@/components/DemoGate";
import { removeSignature } from "@/lib/studio/signature";
import { createClient } from "@/lib/supabase/client";
import { saveMyDesign } from "../studio-actions";
import {
  CONTACT_KINDS, CURATED_FONTS, LAYOUTS, PALETTE_PRESETS, defaultContactKind, studioCountry,
  type ContactKind, type Design, type DocType, type KnownLayout,
} from "@/lib/studio/design";
import { cleanDesign, forEditing, withBand, withLayout, withSectionFill } from "@/lib/studio/starters";
import type { StudioDocData } from "@/lib/studio/forDocument";
import { dateLocale } from "@/lib/dateLabels";
import { countryProfile } from "@/lib/country";

// Document Studio (PR3): the doctor's design, with the real PDF as a live
// preview (sample patient). Saved with the version it was opened at; a
// design changed elsewhere meanwhile is refused, never overwritten. A layout
// this client doesn't know (a newer one) is kept unless the doctor picks
// another (02).

const CONTACTS_MAX = 6;
const CONTACT_MAX = 120;
const TEXT_MAX = 300;
export const SAVE_LIMIT_MS = 20_000;

// The preview's sample prescription (data, not labels: the labels are the
// real ones), in the page's language; other languages show the English one.
const SAMPLE: Record<string, { patient: string; items: { name: string; form: string; instructions: string }[]; notes: string }> = {
  en: {
    patient: "Alex Morgan",
    items: [
      { name: "Amoxicillin 500 mg", form: "Capsule", instructions: "1 capsule every 8 hours · 7 days" },
      { name: "Ibuprofen 400 mg", form: "Tablet", instructions: "1 tablet every 8 hours if needed · 3 days" },
    ],
    notes: "Take with food.",
  },
  "pt-BR": {
    patient: "Ana Souza",
    items: [
      { name: "Amoxicilina 500 mg", form: "Cápsula", instructions: "1 cápsula a cada 8 horas · 7 dias" },
      { name: "Ibuprofeno 400 mg", form: "Comprimido", instructions: "1 comprimido a cada 8 horas se necessário · 3 dias" },
    ],
    notes: "Tomar após as refeições.",
  },
  th: {
    patient: "สมหญิง ใจดี",
    items: [
      { name: "อะม็อกซีซิลลิน 500 มก.", form: "แคปซูล", instructions: "ครั้งละ 1 แคปซูล ทุก 8 ชั่วโมง · 7 วัน" },
      { name: "ไอบูโพรเฟน 400 มก.", form: "เม็ด", instructions: "ครั้งละ 1 เม็ด ทุก 8 ชั่วโมง เมื่อมีอาการ · 3 วัน" },
    ],
    notes: "รับประทานหลังอาหาร",
  },
};

type Props = {
  initial: Design;
  // Whether a design was ever saved: an unsaved one (today's look) can be
  // saved as it is.
  saved: boolean;
  version: number;
  country: string;
  practice: StudioDocData["practice"];
  logos: StudioDocData["logos"];
  textTypes: DocType[];
  backHref: string;
  // Posters (PR5): the week's hours and the booking poster's invite link.
  posterHours: PosterDay[] | null;
  inviteUrl: string | null;
  // The signature image (studio_signature_image): the card only while it's
  // on; while it's off a design is always saved with image:false (225).
  uid: string;
  signatureOn: boolean;
};

export function StudioEditor({ initial, saved: initialSaved, version: initialVersion, country, practice, logos, textTypes, backHref, posterHours, inviteUrl, uid, signatureOn }: Props) {
  const t = useTranslations("studio");
  const tRx = useTranslations("prescriptionDoc");
  const tDocType = useTranslations("documents.type");
  const tSettings = useTranslations("settings");
  const tBrand = useTranslations("brand");
  const tDemo = useTranslations("demo");
  const { demo } = useDemo();
  const tReload = useTranslations("versionGate");
  const tDocsPdf = useTranslations("documents");
  const locale = useLocale();

  const start = useMemo(() => forEditing(initial), [initial]);
  const [design, setDesign] = useState<Design>(start);
  const [baseline, setBaseline] = useState(() => JSON.stringify(cleanDesign(start)));
  const [version, setVersion] = useState(initialVersion);
  const [everSaved, setEverSaved] = useState(initialSaved);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "conflict" | "error">("idle");
  const [textType, setTextType] = useState<DocType>(textTypes[0] ?? "prescription");

  const cleaned = useMemo(() => cleanDesign(design), [design]);
  const dirty = JSON.stringify(cleaned) !== baseline;
  const knownLayout = (LAYOUTS as readonly string[]).includes(design.layout);
  const legalNote = studioCountry(country).legalNote;

  // Leaving with unsaved changes asks "Discard changes?" (#530's guard, 02):
  // the sidebar and every dashboard link, plus the browser's own prompt on
  // reload / closing the tab.
  useLeaveGuard(dirty);

  const change = (next: Design | ((d: Design) => Design)) => {
    setDesign((d) => (typeof next === "function" ? next(d) : next));
    if (state !== "saving") setState("idle");
  };

  // A removed signature image: its file is deleted after the design that
  // drops it is saved (c5: design first, then the file).
  const removeSignatureFile = useRef(false);

  async function save() {
    if (state === "saving") return;
    setState("saving");
    const toSave: Design = signatureOn ? cleaned : { ...cleaned, signature: { ...cleaned.signature, image: false } };
    try {
      // Never "Saving…" forever (fa, #540): an answer that doesn't come in
      // SAVE_LIMIT_MS is an error the doctor can retry (a retry with the old
      // version is then a conflict, never an overwrite).
      const r = await timeLimit(saveMyDesign(toSave, version), SAVE_LIMIT_MS, { ok: false as const, code: "generic" as const });
      if (r.ok) {
        setVersion(r.version);
        setEverSaved(true);
        if (removeSignatureFile.current) {
          removeSignatureFile.current = false;
          void removeSignature(createClient()).catch(() => undefined);
        }
        setBaseline(JSON.stringify(cleaned));
        setDesign(cleaned);
        setState("saved");
      } else {
        setState(r.code === "conflict" ? "conflict" : "error");
      }
    } catch {
      setState("error");
    }
  }

  const sample = SAMPLE[locale] ?? SAMPLE.en;
  const today = useMemo(() => {
    // The practice's calendar, as its documents (Buddhist years in Thailand).
    try { return new Intl.DateTimeFormat(dateLocale(locale, countryProfile(country).calendar), { dateStyle: "long" }).format(new Date()); } catch { return new Date().toISOString().slice(0, 10); }
  }, [locale, country]);
  const previewTexts = cleaned.texts.prescription;
  const preview: PreviewInput = {
    design: cleaned,
    locale,
    practice,
    logoUrls: logos,
    rx: {
      title: tRx("title"), patientLabel: tRx("patient"), patientName: sample.patient, dateLabel: tRx("date"), date: today,
      items: sample.items, notesLabel: tRx("notes"), notes: sample.notes,
    },
    headerText: previewTexts?.header ?? null,
    footerText: previewTexts?.footer ?? null,
  };

  const typeLabel = (k: DocType) => (k === "prescription" ? tRx("title") : k === "letterhead" ? t("letterhead") : tDocType(k as "certificate"));

  // The letterhead (PR4; 02, 10-13): the design as it stands on this page,
  // with an optional typed title and body, printed and never stored. The
  // typed stamp only under a body; never a signature image.
  const [lhTitle, setLhTitle] = useState("");
  const [lhBody, setLhBody] = useState("");
  const [lhState, setLhState] = useState<"idle" | "busy" | "failed">("idle");
  async function printLetterhead() {
    setLhState("busy");
    try {
      const [{ renderInBrowser, printPdf }, { letterheadContent }] = await Promise.all([import("@/lib/pdf/browser"), import("@/lib/studio/content")]);
      const lt = cleaned.texts.letterhead;
      const bytes = await renderInBrowser({
        design: cleaned, locale, practice, logoUrls: logos,
        doc: { ...letterheadContent({ title: lhTitle, body: lhBody }), headerText: lt?.header ?? null, footerText: lt?.footer ?? null },
        // Demo: the DEMO stamp, as on every document a demo makes.
        demoFooter: demo ? tDemo("pdfFooter") : null,
      });
      printPdf(bytes, `${t("letterhead")}.pdf`);
      setLhState("idle");
    } catch {
      setLhState("failed");
    }
  }
  const presetId = design.palette.preset;
  const contacts = design.footer.contacts;
  const texts = design.texts[textType] ?? { header: null, footer: null };
  const setText = (part: "header" | "footer", value: string) =>
    change((d) => ({ ...d, texts: { ...d.texts, [textType]: { ...(d.texts[textType] ?? { header: null, footer: null }), [part]: value } } }));

  const choice = <V extends string | number>(name: string, value: V, options: readonly V[], label: (v: V) => string, set: (v: V) => void) => (
    <div role="radiogroup" aria-label={name} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={String(o)} type="button" role="radio" aria-checked={value === o} onClick={() => set(o)}
          className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${value === o ? "border-teal-600 bg-teal-50 text-teal-800" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
          {label(o)}
        </button>
      ))}
    </div>
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl">
      <div className="mb-6">
        <Link href={backHref} className="text-sm font-semibold text-teal-700 hover:underline">← {tSettings("pageTitle")}</Link>
        <h1 className="mt-2 text-2xl font-extrabold text-slate-900">{t("open")}</h1>
        <p className="mt-0.5 text-sm text-slate-500">{t("intro")}</p>
        {legalNote && <p data-testid="studio-legal-note" className="mt-1 text-xs text-slate-500">{t(`legalNote.${legalNote}`)}</p>}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <div className="min-w-0 space-y-6" data-testid="studio-editor">
          <Card title={t("layout")}>
            <div role="radiogroup" aria-label={t("layout")} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {LAYOUTS.map((l) => (
                <button key={l} type="button" role="radio" aria-checked={design.layout === l} data-layout={l}
                  onClick={() => change((d) => withLayout(d, l as KnownLayout))}
                  className={`rounded-xl border px-3 py-3 text-sm font-bold transition ${design.layout === l ? "border-teal-600 bg-teal-50 text-teal-800" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
                  {t(`layouts.${l}`)}
                </button>
              ))}
            </div>
            {!knownLayout && <p data-testid="studio-unknown-layout" className="mt-3 text-sm text-amber-700">{t("unknownLayout")}</p>}
            <p className="mt-3 text-xs text-slate-500">{t("moreLayouts")}</p>
          </Card>

          <Card title={t("colours")}>
            <div role="radiogroup" aria-label={t("colours")} className="flex flex-wrap gap-2">
              {Object.entries(PALETTE_PRESETS).map(([id, p]) => (
                <button key={id} type="button" role="radio" aria-checked={presetId === id}
                  onClick={() => change((d) => ({ ...d, palette: { ...p, preset: id } }))}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-semibold ${presetId === id ? "border-teal-600 bg-teal-50 text-teal-800" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
                  <span className="flex">
                    {[p.primary, p.accent, p.light].map((c) => <span key={c} className="-ml-1 h-4 w-4 rounded-full border border-white first:ml-0" style={{ backgroundColor: c }} />)}
                  </span>
                  {t(`presets.${id}`)}
                </button>
              ))}
              <span className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-sm font-semibold ${presetId === null ? "border-teal-600 bg-teal-50 text-teal-800" : "border-slate-200 text-slate-500"}`}>{t("presets.custom")}</span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {(["primary", "accent", "light"] as const).map((k) => (
                <label key={k} className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="color" value={design.palette[k].toLowerCase()} aria-label={t(`palette.${k}`)}
                    onChange={(e) => { const v = e.target.value; if (/^#[0-9a-fA-F]{6}$/.test(v)) change((d) => ({ ...d, palette: { ...d.palette, [k]: v.toLowerCase(), preset: null } })); }}
                    className="h-8 w-10 cursor-pointer rounded border border-slate-200 bg-white" />
                  {t(`palette.${k}`)}
                </label>
              ))}
            </div>
          </Card>

          <Card title={t("typeface")}>
            {choice(t("typeface"), design.font, CURATED_FONTS, (f) => f[0].toUpperCase() + f.slice(1), (font) => change((d) => ({ ...d, font })))}
            <p className="field-label mt-5">{t("nameStyle")}</p>
            {choice(t("nameStyle"), design.nameBlock.style, ["regular", "spaced", "large"] as const, (s) => t(`nameStyles.${s}`), (style) => change((d) => ({ ...d, nameBlock: { style } })))}
          </Card>

          <Card title={t("logo")}>
            {choice(t("logo"), design.logoUse.header, ["wide", "square", "reversed", "none"] as const, (s) => t(`logos.${s}`), (header) => change((d) => ({ ...d, logoUse: { header } })))}
            <label className="mt-5 flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={design.watermark.on} onChange={(e) => { const on = e.target.checked; change((d) => ({ ...d, watermark: { ...d.watermark, on } })); }} />
              {t("watermark")}
            </label>
            {design.watermark.on && (
              <div className="mt-3">
                {choice(t("watermark"), design.watermark.size, ["s", "m", "l"] as const, (s) => t(`sizes.${s}`), (size) => change((d) => ({ ...d, watermark: { ...d.watermark, size } })))}
              </div>
            )}
          </Card>

          <Card title={t("sectionBars")}>
            {choice(t("sectionBars"), design.sectionBar.fill === "light" ? "none" : design.sectionBar.fill, ["none", "primary", "accent"] as const, (s) => t(`sectionFills.${s}`), (fill) => change((d) => withSectionFill(d, fill)))}
            <p className="field-label mt-5">{t("fields")}</p>
            {choice(t("fields"), design.field.style, ["plain", "underline", "box"] as const, (s) => t(`fieldStyles.${s}`), (style) => change((d) => ({ ...d, field: { ...d.field, style } })))}
          </Card>

          <Card title={t("footer")}>
            <p className="field-label">{t("columns")}</p>
            {choice(t("columns"), design.footer.columns, [1, 2, 3] as const, (n) => String(n), (columns) => change((d) => ({ ...d, footer: { ...d.footer, columns } })))}
            <label className="mt-5 flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={design.footer.locations} onChange={(e) => { const locations = e.target.checked; change((d) => ({ ...d, footer: { ...d.footer, locations } })); }} />
              {t("showLocations")}
            </label>

            <p className="field-label mt-5">{t("contacts")}</p>
            <div className="space-y-2" data-testid="studio-contacts">
              {contacts.map((c, i) => (
                <div key={i} className="flex gap-2">
                  <select value={c.kind} aria-label={t("contacts")} className="text-input w-36 shrink-0"
                    onChange={(e) => { const kind = e.target.value as ContactKind; change((d) => ({ ...d, footer: { ...d.footer, contacts: d.footer.contacts.map((x, j) => (j === i ? { ...x, kind } : x)) } })); }}>
                    {CONTACT_KINDS.map((k) => <option key={k} value={k}>{t(`contactKinds.${k}`)}</option>)}
                  </select>
                  <input type="text" value={c.value} maxLength={CONTACT_MAX} aria-label={t(`contactKinds.${c.kind}`)} className="text-input min-w-0 flex-1"
                    onChange={(e) => { const value = e.target.value; change((d) => ({ ...d, footer: { ...d.footer, contacts: d.footer.contacts.map((x, j) => (j === i ? { ...x, value } : x)) } })); }} />
                  <button type="button" aria-label={tBrand("remove")} title={tBrand("remove")} onClick={() => change((d) => ({ ...d, footer: { ...d.footer, contacts: d.footer.contacts.filter((_, j) => j !== i) } }))}
                    className="rounded-lg px-3 text-sm font-semibold text-red-600 hover:bg-red-50">×</button>
                </div>
              ))}
              {contacts.length < CONTACTS_MAX && (
                <button type="button" onClick={() => change((d) => ({ ...d, footer: { ...d.footer, contacts: [...d.footer.contacts, { kind: defaultContactKind(country), value: "" }] } }))}
                  className="rounded-lg px-3 py-1.5 text-sm font-semibold text-teal-700 hover:bg-teal-50">+ {t("addContact")}</button>
              )}
            </div>

            <p className="field-label mt-5">{t("band")}</p>
            {choice(t("band"), design.band.style, ["none", "flat", "twoTone", "rounded", "angled"] as const, (s) => t(`bandStyles.${s}`), (style) => change((d) => withBand(d, style)))}
          </Card>

          <Card title={t("texts")}>
            {textTypes.length > 1 && (
              <div className="mb-4">
                {choice(t("texts"), textType, textTypes, typeLabel, setTextType)}
              </div>
            )}
            <div className="grid gap-4">
              {(["header", "footer"] as const).map((part) => (
                <div key={part}>
                  <label htmlFor={`studio-${part}-text`} className="field-label">{t(part === "header" ? "headerText" : "footerText")}</label>
                  <textarea id={`studio-${part}-text`} rows={2} maxLength={TEXT_MAX} value={texts[part] ?? ""}
                    onChange={(e) => setText(part, e.target.value)} className="text-input" />
                </div>
              ))}
            </div>
          </Card>

          {signatureOn && (
            <StudioSignature uid={uid} signature={design.signature}
              onChange={(signature, removeFile) => { if (removeFile) removeSignatureFile.current = true; change((d) => ({ ...d, signature })); }} />
          )}

          <Card title={t("letterhead")} description={t("letterheadHint")}>
            <div className="grid gap-4" data-testid="studio-letterhead">
              <div>
                <label htmlFor="studio-lh-title" className="field-label">{t("letterheadTitle")}</label>
                <input id="studio-lh-title" type="text" maxLength={120} value={lhTitle} onChange={(e) => setLhTitle(e.target.value)} className="text-input" />
              </div>
              <div>
                <label htmlFor="studio-lh-body" className="field-label">{t("letterheadBody")}</label>
                <textarea id="studio-lh-body" rows={6} maxLength={5000} value={lhBody} onChange={(e) => setLhBody(e.target.value)} className="text-input" />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" data-testid="studio-print-letterhead" onClick={() => void printLetterhead()} disabled={lhState === "busy"}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-teal-700 hover:bg-slate-50 disabled:opacity-60">
                  {t("printLetterhead")}
                </button>
                <p className="text-xs text-slate-500">{t("letterheadNotSaved")}</p>
              </div>
              {lhState === "failed" && <p role="alert" className="text-sm text-red-600">{tDocsPdf("pdfFailed")}</p>}
            </div>
          </Card>

          <StudioPosters design={cleaned} country={country} practice={practice} logos={logos} hours={posterHours} inviteUrl={inviteUrl} />
        </div>

        <div className="min-w-0">
          <div className="space-y-3 lg:sticky lg:top-6">
            <p className="field-label">{t("preview")}</p>
            <StudioPreview input={preview} label={t("preview")} failedLabel={t("previewFailed")} />
            <p className="text-xs text-slate-500">{t("previewNote")}</p>
            <div className="flex flex-wrap items-center gap-3">
              <button data-server type="button" data-testid="studio-save" onClick={save} disabled={state === "saving" || (everSaved && !dirty)}
                className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-60">
                {state === "saving" ? tBrand("saving") : t("save")}
              </button>
              {state === "saved" && <p role="status" data-testid="studio-saved" className="text-sm text-teal-700">{t("saved")}</p>}
              {state === "error" && <p role="alert" className="text-sm text-red-600">{t("error")}</p>}
            </div>
            {state === "conflict" && (
              <div role="alert" data-testid="studio-conflict" className="space-y-2">
                <p className="text-sm text-red-600">{t("conflict")}</p>
                <ReloadButton label={tReload("reload")} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
