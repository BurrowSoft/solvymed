"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { dateLocale } from "@/lib/dateLabels";
import {
  CHANNEL_LIMITS,
  PAGE_BGS,
  faqProblems,
  parseOptions,
  reasonProblems,
  settingsProblems,
  settingsRow,
  swapSort,
  type PcFaqRow,
  type PcReasonRow,
  type PcSettings,
  type ReasonKind,
} from "@/lib/patientChannel/channel";
import { CoverCard } from "./CoverCard";

// The Patient Channel's practice settings (M3b-2; 237's pc_settings / pc_reasons /
// pc_faq, the doctor's own rows under RLS): the channel switch, who reads what, the
// response time and reading hours, the welcome and the page background; the reasons
// (→ doctor or front desk) and the FAQ. Reasons and FAQ are archived, never deleted
// (requests point at them). The cover image (246) has its own card, while pc_cover_upload is on.

const CARD = "min-w-0 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-6";
const H2 = "text-base font-bold text-slate-900";
const SUB = "text-xs leading-relaxed text-slate-500";
const INPUT = "w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none";
const MINI = "rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40";
const PRIMARY = "rounded-xl bg-teal-600 px-4 py-2 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-50";
const GHOST = "rounded-xl border border-teal-600 px-4 py-2 text-sm font-bold text-teal-700 hover:bg-teal-50 disabled:opacity-50";

type Status = { kind: "ok" | "error"; text: string } | null;

export function ChannelSettings({ professionalId, hasRow, onRowCreated, initial, reasons: initialReasons, faq: initialFaq, brandHref, cover }: {
  professionalId: string;
  // A pc_settings row exists (the rules were saved, or these settings were).
  hasRow: boolean;
  // The first save here creates the row (rules_version 1): the rules editor follows.
  onRowCreated: () => void;
  initial: PcSettings;
  reasons: PcReasonRow[];
  faq: PcFaqRow[];
  brandHref: string;
  // The cover card: null while pc_cover_upload is off (246).
  cover?: { path: string | null } | null;
}) {
  // The channel can't be turned on without a reason to pick (launch polish 8).
  const [reasonCount, setReasonCount] = useState(initialReasons.length);
  return (
    <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-4">
        <ChannelCard professionalId={professionalId} hasRow={hasRow} onRowCreated={onRowCreated} initial={initial} brandHref={brandHref} reasonCount={reasonCount} />
        {cover && <CoverCard professionalId={professionalId} initialPath={cover.path} />}
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <Reasons professionalId={professionalId} initial={initialReasons} onCount={setReasonCount} />
        <Faq professionalId={professionalId} initial={initialFaq} />
      </div>
    </div>
  );
}

function weekdayNames(locale: string): string[] {
  // Mon = 1 … Sun = 7 (237): 2024-01-01 was a Monday.
  // The app's date locale (lib/dateLabels: th → th-TH with its calendar, en → en-GB).
  const f = new Intl.DateTimeFormat(dateLocale(locale), { weekday: "short", timeZone: "UTC" });
  return Array.from({ length: 7 }, (_, i) => f.format(new Date(Date.UTC(2024, 0, 1 + i))));
}

function ChannelCard({ professionalId, hasRow, onRowCreated, initial, brandHref, reasonCount }: {
  professionalId: string; hasRow: boolean; onRowCreated: () => void; initial: PcSettings; brandHref: string; reasonCount: number;
}) {
  const t = useTranslations("patientChannel.channel");
  const locale = useLocale();
  const days = weekdayNames(locale);
  const [s, setS] = useState(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [created, setCreated] = useState(false);
  const exists = hasRow || created;
  const problems = settingsProblems(s);
  const dirty = JSON.stringify(s) !== saved;

  const save = async () => {
    if (!dirty || problems.length > 0 || busy) return;
    setBusy(true);
    setStatus(null);
    const db = createClient();
    const row = { ...settingsRow(s), updated_at: new Date().toISOString() };
    const update = () => db.from("pc_settings").update(row).eq("professional_id", professionalId);
    let { error } = exists
      ? await update()
      : await db.from("pc_settings").insert({ professional_id: professionalId, ...settingsRow(s) });
    // The row may exist by now (another tab, the app, a template): update it instead.
    if (!exists && error?.code === "23505") ({ error } = await update());
    setBusy(false);
    if (error) { setStatus({ kind: "error", text: t("saveError") }); return; }
    if (!exists) { setCreated(true); onRowCreated(); }
    setSaved(JSON.stringify(s));
    setStatus({ kind: "ok", text: t("saved") });
  };

  const setHour = (i: number, patch: Partial<PcSettings["readingHours"][number]>) =>
    setS({ ...s, readingHours: s.readingHours.map((h, j) => (j === i ? { ...h, ...patch } : h)) });

  return (
    <section className={CARD} aria-labelledby="pc-channel">
      <h2 id="pc-channel" className={H2}>{t("title")}</h2>
      <label className="mt-3 flex items-start gap-2 text-sm">
        {/* Off → on needs a reason; turning it off is always allowed. */}
        <input type="checkbox" className="mt-1" data-testid="pc-channel-enabled" checked={s.enabled} disabled={!s.enabled && reasonCount === 0}
          onChange={(e) => setS({ ...s, enabled: e.target.checked })} />
        <span><b>{t("enabled")}</b><span className={`${SUB} block`}>{t("enabledHelp")}</span></span>
      </label>
      {reasonCount === 0 && <p className="mt-1 text-xs font-semibold text-amber-700" data-testid="pc-channel-needs-reason">{t("needsReason")}</p>}
      <label className="mt-3 flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={s.secretarySeesAll} onChange={(e) => setS({ ...s, secretarySeesAll: e.target.checked })} />
        <span><b>{t("secretarySeesAll")}</b><span className={`${SUB} block`}>{t("secretarySeesAllHelp")}</span></span>
      </label>

      <label htmlFor="pc-sla" className={`${SUB} mt-4 block`}>{t("sla")}</label>
      <select id="pc-sla" className={INPUT} value={s.slaBusinessDays} onChange={(e) => setS({ ...s, slaBusinessDays: Number(e.target.value) as 1 | 2 | 3 })}>
        {[1, 2, 3].map((n) => <option key={n} value={n}>{t("slaDays", { n })}</option>)}
      </select>

      <fieldset className="mt-4 min-w-0">
        <legend className="text-sm font-bold text-slate-800">{t("hours")}</legend>
        <p className={SUB}>{t("hoursHelp")}</p>
        <ul className="mt-2 flex flex-col gap-2">
          {s.readingHours.map((h, i) => (
            <li key={i} className="rounded-xl border border-slate-200 p-3">
              <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("hoursDays")}>
                {days.map((name, d) => (
                  <label key={d} className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs font-semibold ${h.days.includes(d + 1) ? "border-teal-600 bg-teal-50 text-teal-800" : "border-slate-200 text-slate-600"}`}>
                    <input type="checkbox" className="sr-only" checked={h.days.includes(d + 1)}
                      onChange={(e) => setHour(i, { days: e.target.checked ? [...h.days, d + 1] : h.days.filter((x) => x !== d + 1) })} />
                    {name}
                  </label>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <label className="flex items-center gap-1.5">{t("from")}
                  <input type="time" className="rounded-lg border border-slate-200 px-2 py-1" value={h.from} onChange={(e) => setHour(i, { from: e.target.value })} />
                </label>
                <label className="flex items-center gap-1.5">{t("to")}
                  <input type="time" className="rounded-lg border border-slate-200 px-2 py-1" value={h.to} onChange={(e) => setHour(i, { to: e.target.value })} />
                </label>
                <button type="button" className={MINI} onClick={() => setS({ ...s, readingHours: s.readingHours.filter((_, j) => j !== i) })}>{t("remove")}</button>
              </div>
            </li>
          ))}
        </ul>
        <button type="button" className={`${MINI} mt-2`} disabled={s.readingHours.length >= CHANNEL_LIMITS.hoursRows}
          onClick={() => setS({ ...s, readingHours: [...s.readingHours, { days: [1, 2, 3, 4, 5], from: "08:00", to: "18:00" }] })}>
          {t("addHours")}
        </button>
        {problems.includes("hours") && <p role="alert" className="mt-1 text-xs font-semibold text-red-600">{t("hoursInvalid")}</p>}
      </fieldset>

      <label htmlFor="pc-note" className={`${SUB} mt-4 block`}>{t("readingNote")}</label>
      <input id="pc-note" className={INPUT} maxLength={CHANNEL_LIMITS.readingNote} value={s.readingNote} placeholder={t("readingNotePlaceholder")}
        onChange={(e) => setS({ ...s, readingNote: e.target.value })} />

      <label htmlFor="pc-welcome" className={`${SUB} mt-4 block`}>{t("welcome")}</label>
      <textarea id="pc-welcome" className={`${INPUT} min-h-20`} maxLength={CHANNEL_LIMITS.welcome} value={s.welcome}
        onChange={(e) => setS({ ...s, welcome: e.target.value })} />
      <p className={`${SUB} text-right tabular-nums`}>{s.welcome.length} / {CHANNEL_LIMITS.welcome}</p>

      <label htmlFor="pc-bg" className={`${SUB} mt-2 block`}>{t("background")}</label>
      <select id="pc-bg" className={INPUT} value={s.pageBg} onChange={(e) => setS({ ...s, pageBg: e.target.value as PcSettings["pageBg"] })}>
        {PAGE_BGS.map((b) => <option key={b} value={b}>{t(`bg.${b}`)}</option>)}
      </select>
      <p className={`${SUB} mt-1`}>{t.rich("brandNote", { link: (chunks) => <a href={brandHref} className="font-semibold text-teal-700 underline">{chunks}</a> })}</p>
      <p className={`${SUB} mt-1`}>{t("alwaysShown")}</p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" data-testid="pc-channel-save" className={PRIMARY} disabled={!dirty || problems.length > 0 || busy} onClick={() => void save()}>{t("save")}</button>
        {status && <span role="status" className={`text-sm ${status.kind === "error" ? "font-semibold text-red-700" : "text-slate-600"}`}>{status.text}</span>}
      </div>
    </section>
  );
}

const NEW_REASON = { title: "", subtitle: "", kind: "options" as ReasonKind, options: "", destination: "doctor" as const };

function Reasons({ professionalId, initial, onCount }: { professionalId: string; initial: PcReasonRow[]; onCount: (n: number) => void }) {
  const t = useTranslations("patientChannel.reasons");
  const [rows, setRows] = useState([...initial].sort((a, b) => a.sort - b.sort));
  useEffect(() => onCount(rows.length), [rows.length, onCount]);
  const [draft, setDraft] = useState<{ title: string; subtitle: string; kind: ReasonKind; options: string; destination: "doctor" | "secretary" }>(NEW_REASON);
  const [editId, setEditId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const value = { title: draft.title.trim(), subtitle: draft.subtitle.trim(), kind: draft.kind, options: draft.kind === "symptom_form" ? [] : parseOptions(draft.options), destination: draft.destination };
  const problems = reasonProblems(value);

  const save = async () => {
    if (problems.length > 0 || busy) { setStatus({ kind: "error", text: t(`problem.${problems[0]}`) }); return; }
    setBusy(true);
    const db = createClient();
    const row = { title: value.title, subtitle: value.subtitle || null, kind: value.kind, options: value.options, destination: value.destination };
    if (editId) {
      const { error } = await db.from("pc_reasons").update({ ...row, updated_at: new Date().toISOString() }).eq("id", editId);
      setBusy(false);
      if (error) { setStatus({ kind: "error", text: t("saveError") }); return; }
      setRows(rows.map((r) => (r.id === editId ? { ...r, ...value } : r)));
    } else {
      const sort = rows.length + 1;
      const { data, error } = await db.from("pc_reasons").insert({ professional_id: professionalId, ...row, sort }).select("id").single();
      setBusy(false);
      if (error || !data) { setStatus({ kind: "error", text: t("saveError") }); return; }
      setRows([...rows, { id: (data as { id: string }).id, ...value, sort }]);
    }
    setDraft(NEW_REASON);
    setEditId(null);
    setStatus({ kind: "ok", text: t("saved") });
  };

  const archive = async (id: string) => {
    const { error } = await createClient().from("pc_reasons").update({ archived_at: new Date().toISOString() }).eq("id", id);
    if (error) { setStatus({ kind: "error", text: t("saveError") }); return; }
    setRows(rows.filter((r) => r.id !== id));
    if (editId === id) { setEditId(null); setDraft(NEW_REASON); }
  };

  // After a failed ↑↓ (one of the two may have moved): the list as stored.
  const reload = async () => {
    const { data, error } = await createClient().from("pc_reasons").select("id, title, subtitle, kind, options, destination, sort")
      .eq("professional_id", professionalId).is("archived_at", null).order("sort").order("created_at");
    if (!error && data) setRows((data as (Omit<PcReasonRow, "subtitle"> & { subtitle: string | null })[]).map((r) => ({ ...r, subtitle: r.subtitle ?? "" })));
  };

  const move = async (id: string, dir: -1 | 1) => {
    const changes = swapSort(rows, id, dir);
    if (changes.length === 0) return;
    const db = createClient();
    for (const c of changes) {
      const { error } = await db.from("pc_reasons").update({ sort: c.sort }).eq("id", c.id);
      if (error) { setStatus({ kind: "error", text: t("saveError") }); void reload(); return; }
    }
    setRows(rows.map((r) => ({ ...r, sort: changes.find((c) => c.id === r.id)?.sort ?? r.sort })).sort((a, b) => a.sort - b.sort));
  };

  return (
    <section className={CARD} aria-labelledby="pc-reasons">
      <h2 id="pc-reasons" className={H2}>{t("title")}</h2>
      <p className={SUB}>{t("help")}</p>
      <ul className="mt-3 flex flex-col gap-2">
        {rows.length === 0 && <li className={SUB}>{t("none")}</li>}
        {rows.map((r, i) => (
          <li key={r.id} data-testid="pc-reason" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3 text-sm">
            <span className="min-w-0 flex-1 basis-40">
              <b className="block break-words">{r.title}</b>
              <span className="text-xs text-slate-500">{t(`kind.${r.kind}`)} · {t(`to.${r.destination}`)}</span>
            </span>
            <span className="flex shrink-0 flex-wrap gap-1.5">
              <button type="button" className={MINI} aria-label={t("up", { title: r.title })} disabled={i === 0} onClick={() => void move(r.id, -1)}>↑</button>
              <button type="button" className={MINI} aria-label={t("down", { title: r.title })} disabled={i === rows.length - 1} onClick={() => void move(r.id, 1)}>↓</button>
              <button type="button" className={MINI} onClick={() => { setEditId(r.id); setDraft({ title: r.title, subtitle: r.subtitle, kind: r.kind, options: r.options.join("\n"), destination: r.destination }); setStatus(null); }}>{t("edit")}</button>
              <button type="button" className={MINI} onClick={() => void archive(r.id)}>{t("archive")}</button>
            </span>
          </li>
        ))}
      </ul>

      <h3 className="mt-4 text-sm font-bold text-slate-800">{editId ? t("editTitle") : t("newTitle")}</h3>
      <div className="mt-2 flex flex-col gap-2">
        <input className={INPUT} maxLength={CHANNEL_LIMITS.reasonTitle} value={draft.title} placeholder={t("titlePlaceholder")} aria-label={t("titleLabel")} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        <input className={INPUT} maxLength={CHANNEL_LIMITS.reasonSubtitle} value={draft.subtitle} placeholder={t("subtitlePlaceholder")} aria-label={t("subtitleLabel")} onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })} />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="flex min-w-0 flex-col gap-1 text-xs text-slate-500">{t("kindLabel")}
            <select className={INPUT} value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as ReasonKind })}>
              {(["options", "symptom_form", "exam"] as const).map((k) => <option key={k} value={k}>{t(`kind.${k}`)}</option>)}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-xs text-slate-500">{t("destinationLabel")}
            <select className={INPUT} value={draft.destination} onChange={(e) => setDraft({ ...draft, destination: e.target.value as "doctor" | "secretary" })}>
              <option value="doctor">{t("to.doctor")}</option>
              <option value="secretary">{t("to.secretary")}</option>
            </select>
          </label>
        </div>
        {draft.kind !== "symptom_form" && (
          <label className="flex flex-col gap-1 text-xs text-slate-500">{t("optionsLabel")}
            <textarea className={`${INPUT} min-h-24`} value={draft.options} placeholder={t("optionsPlaceholder")} onChange={(e) => setDraft({ ...draft, options: e.target.value })} />
          </label>
        )}
        {draft.kind === "symptom_form" && <p className={SUB}>{t("symptomFormHelp")}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={GHOST} disabled={busy} onClick={() => void save()}>{editId ? t("update") : t("add")}</button>
          {editId && <button type="button" className={MINI} onClick={() => { setEditId(null); setDraft(NEW_REASON); setStatus(null); }}>{t("cancel")}</button>}
          {status && <span role="status" className={`text-xs ${status.kind === "error" ? "font-semibold text-red-700" : "text-slate-600"}`}>{status.text}</span>}
        </div>
      </div>
    </section>
  );
}

function Faq({ professionalId, initial }: { professionalId: string; initial: PcFaqRow[] }) {
  const t = useTranslations("patientChannel.faq");
  const [rows, setRows] = useState([...initial].sort((a, b) => a.sort - b.sort));
  const [draft, setDraft] = useState({ question: "", answer: "" });
  const [editId, setEditId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const value = { question: draft.question.trim(), answer: draft.answer.trim() };
  const problems = faqProblems(value);

  const save = async () => {
    if (problems.length > 0 || busy) { setStatus({ kind: "error", text: t(`problem.${problems[0]}`) }); return; }
    setBusy(true);
    const db = createClient();
    if (editId) {
      const { error } = await db.from("pc_faq").update({ ...value, updated_at: new Date().toISOString() }).eq("id", editId);
      setBusy(false);
      if (error) { setStatus({ kind: "error", text: t("saveError") }); return; }
      setRows(rows.map((r) => (r.id === editId ? { ...r, ...value } : r)));
    } else {
      const sort = rows.length + 1;
      const { data, error } = await db.from("pc_faq").insert({ professional_id: professionalId, ...value, sort }).select("id").single();
      setBusy(false);
      if (error || !data) { setStatus({ kind: "error", text: t("saveError") }); return; }
      setRows([...rows, { id: (data as { id: string }).id, ...value, sort }]);
    }
    setDraft({ question: "", answer: "" });
    setEditId(null);
    setStatus({ kind: "ok", text: t("saved") });
  };

  const archive = async (id: string) => {
    const { error } = await createClient().from("pc_faq").update({ archived_at: new Date().toISOString() }).eq("id", id);
    if (error) { setStatus({ kind: "error", text: t("saveError") }); return; }
    setRows(rows.filter((r) => r.id !== id));
    if (editId === id) { setEditId(null); setDraft({ question: "", answer: "" }); }
  };

  // After a failed ↑↓ (one of the two may have moved): the list as stored.
  const reload = async () => {
    const { data, error } = await createClient().from("pc_faq").select("id, question, answer, sort")
      .eq("professional_id", professionalId).is("archived_at", null).order("sort").order("created_at");
    if (!error && data) setRows(data as PcFaqRow[]);
  };

  const move = async (id: string, dir: -1 | 1) => {
    const changes = swapSort(rows, id, dir);
    if (changes.length === 0) return;
    const db = createClient();
    for (const c of changes) {
      const { error } = await db.from("pc_faq").update({ sort: c.sort }).eq("id", c.id);
      if (error) { setStatus({ kind: "error", text: t("saveError") }); void reload(); return; }
    }
    setRows(rows.map((r) => ({ ...r, sort: changes.find((c) => c.id === r.id)?.sort ?? r.sort })).sort((a, b) => a.sort - b.sort));
  };

  return (
    <section className={CARD} aria-labelledby="pc-faq">
      <h2 id="pc-faq" className={H2}>{t("title")}</h2>
      <p className={SUB}>{t("help")}</p>
      <ul className="mt-3 flex flex-col gap-2">
        {rows.length === 0 && <li className={SUB}>{t("none")}</li>}
        {rows.map((r, i) => (
          <li key={r.id} data-testid="pc-faq" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3 text-sm">
            <span className="min-w-0 flex-1 basis-40 break-words font-semibold">{r.question}</span>
            <span className="flex shrink-0 flex-wrap gap-1.5">
              <button type="button" className={MINI} aria-label={t("up", { question: r.question })} disabled={i === 0} onClick={() => void move(r.id, -1)}>↑</button>
              <button type="button" className={MINI} aria-label={t("down", { question: r.question })} disabled={i === rows.length - 1} onClick={() => void move(r.id, 1)}>↓</button>
              <button type="button" className={MINI} onClick={() => { setEditId(r.id); setDraft({ question: r.question, answer: r.answer }); setStatus(null); }}>{t("edit")}</button>
              <button type="button" className={MINI} onClick={() => void archive(r.id)}>{t("archive")}</button>
            </span>
          </li>
        ))}
      </ul>
      <h3 className="mt-4 text-sm font-bold text-slate-800">{editId ? t("editTitle") : t("newTitle")}</h3>
      <div className="mt-2 flex flex-col gap-2">
        <input className={INPUT} maxLength={CHANNEL_LIMITS.faqQuestion} value={draft.question} placeholder={t("questionPlaceholder")} aria-label={t("questionLabel")} onChange={(e) => setDraft({ ...draft, question: e.target.value })} />
        <textarea className={`${INPUT} min-h-24`} maxLength={CHANNEL_LIMITS.faqAnswer} value={draft.answer} placeholder={t("answerPlaceholder")} aria-label={t("answerLabel")} onChange={(e) => setDraft({ ...draft, answer: e.target.value })} />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={GHOST} disabled={busy} onClick={() => void save()}>{editId ? t("update") : t("add")}</button>
          {editId && <button type="button" className={MINI} onClick={() => { setEditId(null); setDraft({ question: "", answer: "" }); setStatus(null); }}>{t("cancel")}</button>}
          {status && <span role="status" className={`text-xs ${status.kind === "error" ? "font-semibold text-red-700" : "text-slate-600"}`}>{status.text}</span>}
        </div>
      </div>
    </section>
  );
}
