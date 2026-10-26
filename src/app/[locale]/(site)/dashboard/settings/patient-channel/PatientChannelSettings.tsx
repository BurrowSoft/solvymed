"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { AnswerKey, Band, ChannelConfig } from "@/lib/patientChannel/score";
import {
  LIMITS,
  addCombination,
  addMedicine,
  addSymptom,
  copyAdjustToAllSymptoms,
  parseWords,
  removeAutoMessage,
  removeCombination,
  removeMedicine,
  removeSymptom,
  renameSymptom,
  saveAutoMessage,
  setAdjust,
  setMinBand,
  setThresholds,
  termLengthOk,
  toStoredRules,
  updateCombination,
  updateSymptom,
  validateRules,
  type AutoDraft,
} from "@/lib/patientChannel/rules";
import { termAllowed } from "@/lib/patientChannel/score";
import { useLeaveGuard } from "@/components/DiscardGuard";
import { PatientChannelTest } from "./PatientChannelTest";
import { BandTag } from "./BandTag";
import { ChannelSettings } from "./ChannelSettings";
import type { PcFaqRow, PcReasonRow, PcSettings } from "@/lib/patientChannel/channel";

// The doctor's Patient Channel rules (M3a; the prototype v17's tab 3): phone first,
// one card per section, no tables. Saved through PUT /api/patient-channel/config (M3b-1).

// A term the database accepts: 2+ characters in any script (237), and the engine's guard.
const termOk = (term: string, max?: number) => termLengthOk(term, max) && termAllowed(term);

const CARD = "min-w-0 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-6";
const H2 = "text-base font-bold text-slate-900";
const SUB = "text-xs leading-relaxed text-slate-500";
const NUM = "w-20 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right text-sm tabular-nums focus:border-teal-500 focus:outline-none";
const INPUT = "w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none";
const MINI = "rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50";
const GHOST = "rounded-xl border border-teal-600 px-4 py-2 text-sm font-bold text-teal-700 hover:bg-teal-50 disabled:opacity-50";
const ANSWERS: { key: AnswerKey; n: number }[] = [
  { key: "when", n: 3 },
  { key: "intensity", n: 3 },
  { key: "stillTaking", n: 2 },
];

type SaveState = "idle" | "saving" | "saved" | "conflict" | "invalid" | "error";

export function PatientChannelSettings({ initialRules, initialVersion, emergencyNumber, professionalId, channel, brandHref }: {
  initialRules: ChannelConfig;
  // pc_settings.rules_version; 0 = no row yet (the first save of either part creates it).
  initialVersion: number;
  emergencyNumber: string | null;
  professionalId: string;
  channel: { settings: PcSettings; reasons: PcReasonRow[]; faq: PcFaqRow[] };
  brandHref: string;
}) {
  const t = useTranslations("patientChannel");
  const [rules, setRules] = useState(initialRules);
  const [version, setVersion] = useState(initialVersion);
  const [savedJson, setSavedJson] = useState(() => JSON.stringify(toStoredRules(initialRules)));
  const [state, setState] = useState<SaveState>("idle");
  const [testing, setTesting] = useState(false);
  const number = emergencyNumber ?? t("test.localNumber");
  const dirty = JSON.stringify(toStoredRules(rules)) !== savedJson;
  const problems = useMemo(() => validateRules(rules), [rules]);
  useLeaveGuard(dirty);

  // PUT /api/patient-channel/config with the version read: a newer save elsewhere → 409,
  // and the page asks to reload instead of writing over it.
  const save = async () => {
    if (!dirty || problems.length > 0 || state === "saving") return;
    setState("saving");
    const sent = toStoredRules(rules);
    try {
      const res = await fetch("/api/patient-channel/config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rules: sent, expectedVersion: version }),
      });
      if (res.ok) {
        const { version: next } = (await res.json()) as { version: number };
        setVersion(next);
        setSavedJson(JSON.stringify(sent));
        setState("saved");
      } else {
        setState(res.status === 409 ? "conflict" : res.status === 422 ? "invalid" : "error");
      }
    } catch {
      setState("error");
    }
  };


  const status =
    state === "conflict" ? t("settings.conflict")
      : state === "invalid" || (dirty && problems.length > 0) ? t("settings.invalid")
      : state === "error" ? t("settings.error")
      : state === "saving" ? t("settings.saving")
      : dirty ? t("settings.unsaved")
      : state === "saved" ? t("settings.saved")
      : "";
  const bad = state === "conflict" || state === "invalid" || state === "error" || (dirty && problems.length > 0);

  return (
    <>
    {/* The test hides the editor without unmounting it: unsaved edits and the channel
        cards' state survive a round trip. relative: absolutely positioned bits (sr-only
        legends/labels) stay inside the dashboard's scrolling <main> instead of stretching
        the whole document (83, #620). */}
    {testing && (
      <div className="relative p-4 sm:p-6 lg:p-8 max-w-6xl">
        <PatientChannelTest rules={rules} emergencyNumber={number} onBack={() => setTesting(false)} />
      </div>
    )}
    <div hidden={testing} className="relative p-4 sm:p-6 lg:p-8 max-w-6xl">
      <h1 className="text-2xl font-extrabold text-slate-900">{t("title")}</h1>
      <p className="mt-1 max-w-prose text-sm text-slate-500">{t("settings.intro")}</p>


      <section className={`${CARD} mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`}>
        <div className="min-w-0">
          <h2 className={H2}>{t("settings.testTitle")}</h2>
          <p className={SUB}>{t("settings.testText")}</p>
        </div>
        <button type="button" onClick={() => setTesting(true)} className="shrink-0 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-700">
          {t("settings.testButton")}
        </button>
      </section>

      <ChannelSettings
        professionalId={professionalId}
        hasRow={version > 0}
        onRowCreated={() => setVersion((v) => (v === 0 ? 1 : v))}
        initial={channel.settings}
        reasons={channel.reasons}
        faq={channel.faq}
        brandHref={brandHref}
      />

      <h2 className="mt-8 text-lg font-extrabold text-slate-900">{t("settings.rulesTitle")}</h2>
      <p className="max-w-prose text-sm text-slate-500">{t("settings.rulesHelp")}</p>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Symptoms rules={rules} setRules={setRules} />
        <div className="flex min-w-0 flex-col gap-4">
          <Combinations rules={rules} setRules={setRules} />
          <Bands rules={rules} setRules={setRules} number={number} />
          <FreeText rules={rules} setRules={setRules} />
        </div>
        <Adjustments rules={rules} setRules={setRules} />
        <AutoMessages rules={rules} setRules={setRules} />
      </div>
      {/* The save bar: stuck to the bottom of the page while scrolling, clear of SolvyAI's opener. */}
      <div data-testid="pc-save-bar" className="sticky bottom-0 z-20 -mx-4 mt-6 border-t border-slate-200 bg-white/95 px-4 py-3 pr-20 backdrop-blur sm:-mx-6 sm:px-6 sm:pr-20 lg:-mx-8 lg:px-8 lg:pr-20">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
          <p role="status" aria-live="polite" className={`min-w-0 text-sm ${bad ? "font-semibold text-red-700" : "text-slate-600"}`}>{status}</p>
          <div className="flex shrink-0 gap-2">
            {state === "conflict" && (
              <button type="button" onClick={() => window.location.reload()} className="rounded-xl border border-teal-600 px-4 py-2 text-sm font-bold text-teal-700">{t("settings.reload")}</button>
            )}
            <button type="button" data-testid="pc-save" onClick={() => void save()} disabled={!dirty || problems.length > 0 || state === "saving" || state === "conflict"}
              className="rounded-xl bg-teal-600 px-5 py-2 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-50">
              {t("settings.save")}
            </button>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}

type SectionProps = { rules: ChannelConfig; setRules: (r: ChannelConfig) => void };

function Symptoms({ rules, setRules }: SectionProps) {
  const t = useTranslations("patientChannel");
  const [name, setName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [badWords, setBadWords] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; value: string; error: string | null } | null>(null);
  const add = () => {
    if (!termOk(name, LIMITS.nameLength)) { setAddError(t("symptoms.termShort")); return; }
    const next = addSymptom(rules, name);
    if (next === rules) { setAddError(t("symptoms.exists")); return; }
    setRules(next);
    setName("");
    setAddError(null);
  };
  const rename = () => {
    if (!renaming) return;
    const r = renameSymptom(rules, renaming.id, renaming.value);
    if (r === "short") { setRenaming({ ...renaming, error: t("symptoms.termShort") }); return; }
    if (r === "exists") { setRenaming({ ...renaming, error: t("symptoms.exists") }); return; }
    setRules(r);
    setRenaming(null);
  };
  return (
    <section className={CARD} aria-labelledby="pc-symptoms">
      <h2 id="pc-symptoms" className={H2}>{t("symptoms.title")}</h2>
      <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">{t("symptoms.textNote")}</p>
      <p className={`${SUB} mt-2`}>{t("symptoms.how")}</p>
      <ul className="mt-3 flex flex-col gap-3">
        {rules.symptoms.length === 0 && <li className={SUB}>{t("symptoms.none")}</li>}
        {rules.symptoms.map((s) => (
          <li key={s.id} data-testid={`pc-symptom-${s.id}`} className="min-w-0 rounded-xl border border-slate-200 p-3">
            {renaming?.id === s.id ? (
              <div className="flex flex-col gap-1.5">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input className={INPUT} autoFocus value={renaming.value} maxLength={LIMITS.nameLength}
                    aria-label={t("symptoms.renameLabel", { name: s.name })}
                    onChange={(e) => setRenaming({ ...renaming, value: e.target.value, error: null })}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); rename(); } if (e.key === "Escape") setRenaming(null); }} />
                  <button type="button" className={GHOST} onClick={rename}>{t("symptoms.renameSave")}</button>
                  <button type="button" className={MINI} onClick={() => setRenaming(null)}>{t("auto.cancel")}</button>
                </div>
                {renaming.error && <p role="alert" className="text-xs font-semibold text-red-600">{renaming.error}</p>}
              </div>
            ) : (
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 break-words text-sm font-bold text-slate-900">{s.name}</span>
                <span className="flex shrink-0 gap-1.5">
                  <button type="button" className={MINI} aria-label={t("symptoms.renameLabel", { name: s.name })} onClick={() => setRenaming({ id: s.id, value: s.name, error: null })}>
                    {t("symptoms.rename")}
                  </button>
                  <button type="button" className={MINI} aria-label={t("symptoms.removeNamed", { name: s.name })} onClick={() => setRules(removeSymptom(rules, s.id))}>
                    {t("symptoms.remove")}
                  </button>
                </span>
              </div>
            )}
            <label className={`${SUB} mt-2 block`} htmlFor={`pc-words-${s.id}`}>{t("symptoms.words")}</label>
            <input
              id={`pc-words-${s.id}`}
              className={INPUT}
              defaultValue={s.words.join(", ")}
              placeholder={t("symptoms.wordsPlaceholder")}
              onBlur={(e) => {
                const words = parseWords(e.target.value);
                const allowed = words.filter((w) => termOk(w));
                setBadWords(allowed.length < words.length ? s.id : null);
                // The field shows what the rule keeps: a refused word goes (01, #614 row).
                e.target.value = allowed.join(", ");
                setRules(updateSymptom(rules, s.id, { words: allowed }));
              }}
            />
            {badWords === s.id && <p role="alert" className="mt-1 text-xs font-semibold text-red-600">{t("symptoms.termShort")}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <label className="flex items-center gap-2">
                {t("symptoms.points")}
                <PointsInput value={s.points} label={t("symptoms.pointsFor", { name: s.name })} onChange={(v) => setRules(updateSymptom(rules, s.id, { points: v }))} />
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={s.immediateWarning} onChange={(e) => setRules(updateSymptom(rules, s.id, { immediateWarning: e.target.checked }))} />
                {t("symptoms.immediate")}
              </label>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          className={INPUT}
          value={name}
          maxLength={LIMITS.nameLength}
          placeholder={t("symptoms.new")}
          aria-label={t("symptoms.new")}
          onChange={(e) => { setName(e.target.value); setAddError(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
        />
        <button type="button" className={GHOST} disabled={!name.trim() || rules.symptoms.length >= LIMITS.symptoms} onClick={add}>{t("symptoms.add")}</button>
      </div>
      {addError && <p role="alert" className="mt-1 text-xs font-semibold text-red-600">{addError}</p>}
      <p className={`${SUB} mt-3`}>{t("symptoms.wordsHelp")}</p>
    </section>
  );
}

function PointsInput({ value, label, onChange }: { value: number; label: string; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={-LIMITS.points}
      max={LIMITS.points}
      className={NUM}
      aria-label={label}
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) => onChange(Math.max(-LIMITS.points, Math.min(LIMITS.points, Math.trunc(Number(e.target.value) || 0))))}
    />
  );
}

function Combinations({ rules, setRules }: SectionProps) {
  const t = useTranslations("patientChannel");
  const [picked, setPicked] = useState<string[]>([]);
  const [bonus, setBonus] = useState(3);
  const [error, setError] = useState<string | null>(null);
  const name = (id: string) => rules.symptoms.find((s) => s.id === id)?.name ?? "?";
  const add = () => {
    const r = addCombination(rules, picked, bonus);
    if (typeof r === "string") { setError(t(`combos.${r}`)); return; }
    setError(null);
    setPicked([]);
    setRules(r);
  };
  return (
    <section className={CARD} aria-labelledby="pc-combos">
      <h2 id="pc-combos" className={H2}>{t("combos.title")}</h2>
      <p className={SUB}>{t("combos.help")}</p>
      <ul className="mt-3 flex flex-col gap-2">
        {rules.combinations.length === 0 && <li className={SUB}>{t("combos.none")}</li>}
        {rules.combinations.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3 text-sm">
            <span className="min-w-0 flex-1 basis-40 break-words">{c.symptomIds.map(name).join(" + ")}</span>
            <span className="flex items-center gap-2">
              {t("combos.bonus")}
              <PointsInput value={c.points} label={t("combos.bonusFor", { names: c.symptomIds.map(name).join(" + ") })} onChange={(v) => setRules(updateCombination(rules, c.id, { points: v }))} />
              <button type="button" className={MINI} onClick={() => setRules(removeCombination(rules, c.id))}>{t("symptoms.remove")}</button>
            </span>
          </li>
        ))}
      </ul>
      {rules.symptoms.length >= 2 && (
        <>
          <h3 className="mt-4 text-sm font-bold text-slate-800">{t("combos.newTitle")}</h3>
          <div className="mt-2 flex max-h-56 flex-col gap-1.5 overflow-auto">
            {rules.symptoms.map((s) => (
              <label key={s.id} className="flex items-start gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <input type="checkbox" checked={picked.includes(s.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, s.id] : picked.filter((x) => x !== s.id))} />
                <span className="min-w-0 break-words">{s.name}</span>
              </label>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            {t("combos.bonus")}
            <PointsInput value={bonus} label={t("combos.bonus")} onChange={setBonus} />
            <button type="button" className={GHOST} onClick={add}>{t("combos.add")}</button>
          </div>
          {error && <p role="alert" className="mt-1 text-xs font-semibold text-red-600">{error}</p>}
        </>
      )}
    </section>
  );
}

function Adjustments({ rules, setRules }: SectionProps) {
  const t = useTranslations("patientChannel");
  const [target, setTarget] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const name = (id: string) => rules.symptoms.find((s) => s.id === id)?.name ?? "?";
  const symptom = rules.symptoms.find((s) => `s:${s.id}` === target);
  const combo = rules.combinations.find((c) => `c:${c.id}` === target);
  const current = symptom ?? combo ?? rules.symptoms[0];
  const currentKey = symptom ? target : combo ? target : current ? `s:${current.id}` : "";
  if (!current) {
    return (
      <section className={CARD} aria-labelledby="pc-adjust">
        <h2 id="pc-adjust" className={H2}>{t("adjust.title")}</h2>
        <p className={`${SUB} mt-2`}>{t("adjust.none")}</p>
      </section>
    );
  }
  const change = (key: AnswerKey, i: number, v: number) => {
    const adjust = setAdjust(current.adjust, key, i, v);
    setCopied(false);
    setRules(currentKey.startsWith("s:") ? updateSymptom(rules, current.id, { adjust }) : updateCombination(rules, current.id, { adjust }));
  };
  return (
    <section className={CARD} aria-labelledby="pc-adjust">
      <h2 id="pc-adjust" className={H2}>{t("adjust.title")}</h2>
      <p className={SUB}>{t("adjust.help")}</p>
      <label htmlFor="pc-adjust-target" className={`${SUB} mt-3 block`}>{t("adjust.target")}</label>
      <select id="pc-adjust-target" className={INPUT} value={currentKey} onChange={(e) => { setTarget(e.target.value); setCopied(false); }}>
        <optgroup label={t("adjust.symptoms")}>
          {rules.symptoms.map((s) => <option key={s.id} value={`s:${s.id}`}>{s.name}</option>)}
        </optgroup>
        {rules.combinations.length > 0 && (
          <optgroup label={t("combos.title")}>
            {rules.combinations.map((c) => <option key={c.id} value={`c:${c.id}`}>{c.symptomIds.map(name).join(" + ")}</option>)}
          </optgroup>
        )}
      </select>
      <div className="mt-3 flex flex-col gap-4">
        {ANSWERS.map(({ key, n }) => (
          <fieldset key={key} className="min-w-0">
            <legend className="text-sm font-bold text-slate-800">{t(`answers.${key}Q`)}</legend>
            {Array.from({ length: n }, (_, i) => (
              <div key={i} className="mt-1.5 flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0">{t(`answers.${key}${i}`)}</span>
                <PointsInput value={current.adjust[key][i] ?? 0} label={`${t(`answers.${key}Q`)} · ${t(`answers.${key}${i}`)}`} onChange={(v) => change(key, i, v)} />
              </div>
            ))}
          </fieldset>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" className={MINI} onClick={() => { setRules(copyAdjustToAllSymptoms(rules, current.adjust)); setCopied(true); }}>{t("adjust.copyAll")}</button>
        {copied && <span role="status" className={SUB}>{t("adjust.copied")}</span>}
      </div>
    </section>
  );
}

function Bands({ rules, setRules, number }: SectionProps & { number: string }) {
  const t = useTranslations("patientChannel");
  const { attention, urgent, warnOnUrgent } = rules.thresholds;
  const invalid = !(urgent > attention && attention >= 0);
  return (
    <section className={CARD} aria-labelledby="pc-bands">
      <h2 id="pc-bands" className={H2}>{t("bands.title")}</h2>
      <div className="mt-3 flex flex-col gap-2 text-sm">
        <label className="flex items-center justify-between gap-3">
          <span><BandTag band="red" /> {t("bands.from")}</span>
          <PointsInput value={urgent} label={`${t("bands.red")} ${t("bands.from")}`} onChange={(v) => setRules(setThresholds(rules, { urgent: v }))} />
        </label>
        <label className="flex items-center justify-between gap-3">
          <span><BandTag band="amber" /> {t("bands.from")}</span>
          <PointsInput value={attention} label={`${t("bands.amber")} ${t("bands.from")}`} onChange={(v) => setRules(setThresholds(rules, { attention: v }))} />
        </label>
        <p><BandTag band="green" /> {t("bands.greenBelow")}</p>
      </div>
      {invalid && <p role="alert" className="mt-2 text-xs font-semibold text-red-600">{t("bands.invalid")}</p>}
      <label className="mt-3 flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={warnOnUrgent} onChange={(e) => setRules(setThresholds(rules, { warnOnUrgent: e.target.checked }))} />
        <span>{t("bands.warnOnUrgent", { number })}</span>
      </label>
    </section>
  );
}

function FreeText({ rules, setRules }: SectionProps) {
  const t = useTranslations("patientChannel");
  return (
    <section className={CARD} aria-labelledby="pc-text">
      <h2 id="pc-text" className={H2}>{t("freeText.title")}</h2>
      <p className={`${SUB} mt-1`}>{t("freeText.how")}</p>
      <label htmlFor="pc-min-band" className={`${SUB} mt-3 block`}>{t("freeText.minBand")}</label>
      <select id="pc-min-band" className={INPUT} value={rules.minBandForTextOnly} onChange={(e) => setRules(setMinBand(rules, e.target.value as Band))}>
        {(["green", "amber", "red"] as const).map((b) => <option key={b} value={b}>{t(`bands.${b}`)}</option>)}
      </select>
      <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">{t("freeText.keywordsOnly")}</p>
    </section>
  );
}

const EMPTY_DRAFT: AutoDraft = { terms: [], when: -1, intensity: -1, stillTaking: -1, tone: "info", text: "" };

function AutoMessages({ rules, setRules }: SectionProps) {
  const t = useTranslations("patientChannel");
  const [draft, setDraft] = useState<AutoDraft>(EMPTY_DRAFT);
  const [editId, setEditId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [med, setMed] = useState("");
  const [medError, setMedError] = useState<string | null>(null);
  const addMed = () => {
    if (!termOk(med)) { setMedError(t("symptoms.termShort")); return; }
    setRules(addMedicine(rules, med));
    setMed("");
    setMedError(null);
  };
  const terms = [
    ...rules.symptoms.map((s) => ({ term: s.name, kind: "symptom" as const })),
    ...rules.medicines.map((m) => ({ term: m, kind: "medicine" as const })),
  ];
  const condition = (key: AnswerKey, v: number) => (v < 0 ? null : t(`answers.${key}${v}`));
  const save = () => {
    const r = saveAutoMessage(rules, draft, editId);
    if (typeof r === "string") { setError(t(`auto.${r}`)); return; }
    setRules(r);
    setDraft(EMPTY_DRAFT);
    setEditId(null);
    setError(null);
  };
  const select = (key: "when" | "intensity" | "stillTaking", n: number, label: string) => (
    <label className="flex min-w-0 flex-col gap-1 text-xs text-slate-500">
      {label}
      <select className={INPUT} value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: Number(e.target.value) })}>
        <option value={-1}>{t("auto.any")}</option>
        {Array.from({ length: n }, (_, i) => <option key={i} value={i}>{t(`answers.${key}${i}`)}</option>)}
      </select>
    </label>
  );
  return (
    <section className={CARD} aria-labelledby="pc-auto">
      <h2 id="pc-auto" className={H2}>{t("auto.title")}</h2>
      <p className={SUB}>{t("auto.help")}</p>
      <ul className="mt-3 flex flex-col gap-2">
        {rules.autoMessages.length === 0 && <li className={SUB}>{t("auto.none")}</li>}
        {rules.autoMessages.map((a) => (
          <li key={a.id} className={`min-w-0 rounded-xl border p-3 text-sm ${a.tone === "attention" ? "border-amber-300 bg-amber-50" : "border-teal-200 bg-teal-50"}`}>
            <span className="block break-words text-xs font-bold uppercase tracking-wide text-slate-600">
              {[a.terms.join(" + "), condition("when", a.when), condition("intensity", a.intensity), condition("stillTaking", a.stillTaking)].filter(Boolean).join(" · ")}
            </span>
            <span className="mt-1 block break-words text-slate-800">{a.text}</span>
            <span className="mt-2 flex gap-2">
              <button type="button" className={MINI} onClick={() => { setEditId(a.id); setDraft({ terms: a.terms, when: a.when, intensity: a.intensity, stillTaking: a.stillTaking, tone: a.tone, text: a.text }); setError(null); }}>
                {editId === a.id ? t("auto.editing") : t("auto.edit")}
              </button>
              <button type="button" className={MINI} onClick={() => { setRules(removeAutoMessage(rules, a.id)); if (editId === a.id) { setEditId(null); setDraft(EMPTY_DRAFT); } }}>{t("symptoms.remove")}</button>
            </span>
          </li>
        ))}
      </ul>

      <h3 className="mt-4 text-sm font-bold text-slate-800">{editId ? t("auto.editTitle") : t("auto.newTitle")}</h3>
      {terms.length === 0 ? (
        <p className={`${SUB} mt-1`}>{t("adjust.none")}</p>
      ) : (
        <fieldset className="mt-2 flex max-h-56 flex-col gap-1.5 overflow-auto">
          <legend className="sr-only">{t("auto.terms")}</legend>
          {terms.map((x) => (
            <label key={`${x.kind}:${x.term}`} className="flex items-start gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={draft.terms.includes(x.term)}
                // At most LIMITS.autoTerms terms per message (237).
                disabled={!draft.terms.includes(x.term) && draft.terms.length >= LIMITS.autoTerms}
                onChange={(e) => setDraft({ ...draft, terms: e.target.checked ? [...draft.terms, x.term] : draft.terms.filter((y) => y !== x.term) })}
              />
              <span className="min-w-0 break-words">{x.term} <span className="text-xs text-slate-400">· {t(x.kind === "symptom" ? "auto.kindSymptom" : "auto.kindMedicine")}</span></span>
            </label>
          ))}
        </fieldset>
      )}
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {select("when", 3, t("auto.when"))}
        {select("intensity", 3, t("auto.intensity"))}
        {select("stillTaking", 2, t("auto.still"))}
        <label className="flex min-w-0 flex-col gap-1 text-xs text-slate-500">
          {t("auto.tone")}
          <select className={INPUT} value={draft.tone} onChange={(e) => setDraft({ ...draft, tone: e.target.value as AutoDraft["tone"] })}>
            <option value="info">{t("auto.toneInfo")}</option>
            <option value="attention">{t("auto.toneAttention")}</option>
          </select>
        </label>
      </div>
      <textarea
        className={`${INPUT} mt-2 min-h-24`}
        maxLength={LIMITS.autoMessageText}
        placeholder={t("auto.placeholder")}
        aria-label={t("auto.message")}
        value={draft.text}
        onChange={(e) => setDraft({ ...draft, text: e.target.value })}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" className={GHOST} onClick={save}>{editId ? t("auto.update") : t("auto.add")}</button>
        {editId && <button type="button" className={MINI} onClick={() => { setEditId(null); setDraft(EMPTY_DRAFT); setError(null); }}>{t("auto.cancel")}</button>}
        {error && <span role="alert" className="text-xs font-semibold text-red-600">{error}</span>}
      </div>

      <h3 className="mt-6 text-sm font-bold text-slate-800">{t("meds.title")}</h3>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {rules.medicines.length === 0 && <li className={SUB}>{t("meds.none")}</li>}
        {rules.medicines.map((m) => (
          <li key={m} className="inline-flex items-center gap-1 rounded-full border border-green-600 bg-green-50 py-0.5 pl-3 pr-1 text-xs font-bold text-green-800">
            {m}
            <button type="button" className="px-1.5" aria-label={t("symptoms.removeNamed", { name: m })} onClick={() => setRules(removeMedicine(rules, m))}>×</button>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          className={INPUT}
          value={med}
          maxLength={LIMITS.termLength}
          placeholder={t("meds.placeholder")}
          aria-label={t("meds.placeholder")}
          onChange={(e) => { setMed(e.target.value); setMedError(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addMed(); } }}
        />
        <button type="button" className={GHOST} disabled={!med.trim()} onClick={addMed}>{t("meds.add")}</button>
      </div>
      {medError && <p role="alert" className="mt-1 text-xs font-semibold text-red-600">{medError}</p>}
      <p className={`${SUB} mt-2`}>{t("meds.help")}</p>
    </section>
  );
}
