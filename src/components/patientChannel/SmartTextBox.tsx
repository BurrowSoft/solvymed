"use client";

import { useId, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { findTerms, normalize, suggestTerms, type Chip, type Suggestion, type Vocabulary } from "@/lib/patientChannel/score";

// The Patient Channel's smart text box (specs/patient-contact-tech.md §5; the prototype
// v17): the patient writes in their own words; the doctor's terms (symptom names, patient
// words, medicines) are suggested from 2 letters and lock as chips (a click, Enter, Tab or
// ";", or the whole term followed by a space / punctuation). Recognised terms are
// highlighted INSIDE the box: a backdrop with the same metrics behind a transparent
// textarea. Only findTerms / suggestTerms from score.ts: web, app and the server agree.
// Never blocks typing or sending; no locking during an IME composition (Thai keyboards).

const DELIMS = /[\s;,.!?]/;

export function SmartTextBox({ vocab, text, chips, maxLength, onChange, label, placeholder }: {
  vocab: Vocabulary;
  text: string;
  chips: Chip[];
  maxLength: number;
  onChange: (text: string, chips: Chip[]) => void;
  label: string;
  placeholder: string;
}) {
  const t = useTranslations("patientChannel.patient.textBox");
  const id = useId();
  const ref = useRef<HTMLTextAreaElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const composing = useRef(false);
  const [caret, setCaret] = useState(text.length);
  const [open, setOpen] = useState(true);

  const suggestions = useMemo(() => (open ? suggestTerms(vocab, text.slice(0, caret)) : []), [vocab, text, caret, open]);
  const marks = useMemo(() => findTerms(vocab, text), [vocab, text]);
  const symptomName = (ref: string) => vocab.symptoms.find((s) => s.id === ref)?.name ?? ref;

  const taken = (s: { kind: "symptom" | "medicine"; ref: string }) =>
    chips.some((c) => (s.kind === "symptom" ? c.kind === "symptom" && c.ref === s.ref : c.kind === "medicine" && normalize(c.text) === normalize(s.ref)));
  const withChip = (s: Suggestion, list: Chip[]): Chip[] =>
    taken(s) ? list : [...list, s.kind === "symptom" ? { kind: "symptom", ref: s.ref, text: s.display } : { kind: "medicine", text: s.ref }];

  // The typed tail [from, to) becomes the term in the doctor's spelling (it stays in the
  // text), followed by `after` (the delimiter typed, or a space), and the chip is added once.
  const lock = (s: Suggestion, from: number, to: number, after: string) => {
    const rest = text.slice(to);
    const sep = after || (/^\s/.test(rest) ? "" : " ");
    const next = (text.slice(0, from) + s.term + sep + rest).slice(0, maxLength);
    const pos = Math.min(next.length, from + s.term.length + sep.length);
    onChange(next, withChip(s, chips));
    setCaret(pos);
    requestAnimationFrame(() => ref.current?.setSelectionRange(pos, pos));
  };

  // A whole known term right before the delimiter just typed locks itself.
  const autoLock = (value: string, pos: number): boolean => {
    const delim = value.charAt(pos - 1);
    if (!DELIMS.test(delim)) return false;
    const before = value.slice(0, pos - 1);
    for (const m of findTerms(vocab, before)) {
      if (m.end !== before.length) continue;
      const s: Suggestion = m.kind === "symptom"
        ? { kind: "symptom", ref: m.ref, display: symptomName(m.ref), term: m.term, replaceFrom: m.start }
        : { kind: "medicine", ref: m.ref, display: m.ref, term: m.term, replaceFrom: m.start };
      if (taken(s) && before.slice(m.start) === m.term) return false;
      const rest = value.slice(pos);
      const next = (value.slice(0, m.start) + m.term + delim + rest).slice(0, maxLength);
      onChange(next, withChip(s, chips));
      const at = m.start + m.term.length + 1;
      setCaret(at);
      requestAnimationFrame(() => ref.current?.setSelectionRange(at, at));
      return true;
    }
    return false;
  };

  // Removing a chip removes that term from the text: a symptom's name and all its words.
  const removeChip = (i: number) => {
    const c = chips[i];
    const words = c.kind === "symptom"
      ? [symptomName(c.ref), ...(vocab.symptoms.find((s) => s.id === c.ref)?.words ?? [])]
      : [c.text];
    let next = text;
    for (const w of [...words].sort((a, b) => b.length - a.length)) {
      const hits = findTerms({ symptoms: [{ id: "x", name: w, words: [], immediateWarning: false }], medicines: [] }, next).reverse();
      for (const h of hits) next = next.slice(0, h.start) + next.slice(h.end);
    }
    onChange(next.replace(/ {2,}/g, " ").replace(/^ /, ""), chips.filter((_, j) => j !== i));
    ref.current?.focus();
  };

  const listId = `${id}-sugg`;
  return (
    <div className="min-w-0">
      <label htmlFor={`${id}-text`} className="block text-sm text-slate-700">{label}</label>
      {chips.length > 0 && (
        <ul aria-live="polite" aria-label={t("chips")} data-testid="pc-chips" className="mt-1.5 flex flex-wrap gap-1.5">
          {chips.map((c, i) => (
            <li key={`${c.kind}:${c.kind === "symptom" ? c.ref : c.text}`}
              className={`inline-flex items-center gap-1 rounded-full border py-0.5 pl-2.5 pr-1 text-xs font-bold ${c.kind === "medicine" ? "border-green-600 bg-green-50 text-green-800" : "border-teal-600 bg-teal-50 text-teal-800"}`}>
              <span className="text-[10px] uppercase opacity-80">{t(c.kind === "medicine" ? "kindMedicine" : "kindSymptom")}</span>
              {c.text}
              <button type="button" className="px-1.5" aria-label={t("remove", { term: c.text })} onClick={() => removeChip(i)}>×</button>
            </li>
          ))}
        </ul>
      )}
      <div className="relative mt-1.5">
        <div ref={backRef} aria-hidden="true" data-testid="pc-text-backdrop"
          className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words rounded-lg border border-transparent bg-white px-3 py-2 text-sm text-transparent [overflow-wrap:anywhere]">
          {renderMarks(text, marks)}{"\n "}
        </div>
        <textarea
          ref={ref}
          id={`${id}-text`}
          rows={4}
          maxLength={maxLength}
          value={text}
          placeholder={placeholder}
          autoComplete="off"
          aria-autocomplete="list"
          aria-controls={listId}
          className="relative block w-full min-w-0 resize-y rounded-lg border border-slate-200 bg-transparent px-3 py-2 text-sm [overflow-wrap:anywhere] focus:border-teal-500 focus:outline-none"
          onScroll={(e) => { if (backRef.current) backRef.current.scrollTop = e.currentTarget.scrollTop; }}
          onCompositionStart={() => { composing.current = true; }}
          onCompositionEnd={() => { composing.current = false; }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") { setOpen(false); return; }
            if ((e.key === "Enter" || e.key === "Tab") && suggestions.length > 0 && !composing.current) {
              e.preventDefault();
              lock(suggestions[0], suggestions[0].replaceFrom, caret, "");
            }
          }}
          onChange={(e) => {
            const value = e.target.value;
            const pos = e.target.selectionStart;
            setOpen(true);
            setCaret(pos);
            if (!composing.current) {
              // ";" right after a suggestion picks the first one (the prototype).
              if (value.charAt(pos - 1) === ";" && suggestions.length > 0) {
                const s = suggestions[0];
                const prevText = value.slice(0, pos - 1) + value.slice(pos);
                const next = (prevText.slice(0, s.replaceFrom) + s.term + ";" + prevText.slice(pos - 1)).slice(0, maxLength);
                onChange(next, withChip(s, chips));
                return;
              }
              if (autoLock(value, pos)) return;
            }
            onChange(value, chips);
          }}
        />
      </div>
      {suggestions.length > 0 && (
        <ul id={listId} role="listbox" aria-label={t("suggestions")} data-testid="pc-suggestions"
          className="mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          {suggestions.map((s, i) => (
            <li key={`${s.kind}:${s.ref}`} role="option" aria-selected={i === 0}>
              <button type="button"
                onMouseDown={(e) => { e.preventDefault(); lock(s, s.replaceFrom, caret, ""); }}
                className={`flex w-full justify-between gap-2 border-b border-slate-100 px-3 py-2 text-left text-sm last:border-b-0 ${i === 0 ? "bg-teal-50" : "bg-white"}`}>
                <span className="min-w-0 break-words">{s.term}</span>
                <span className="shrink-0 text-xs text-slate-500">
                  {s.kind === "medicine" ? t("kindMedicine") : normalize(s.term) === normalize(s.display) ? t("kindSymptom") : t("symptomOf", { name: s.display })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-1 flex justify-between gap-2 text-xs text-slate-500">
        <span className="min-w-0">{t("hint")}</span>
        <span className="shrink-0 tabular-nums">{text.length} / {maxLength}</span>
      </div>
    </div>
  );
}

function renderMarks(text: string, marks: ReturnType<typeof findTerms>) {
  const out: React.ReactNode[] = [];
  let pos = 0;
  for (const m of marks) {
    if (m.start < pos) continue;
    out.push(text.slice(pos, m.start));
    out.push(
      <mark key={m.start} className={`rounded text-transparent ${m.kind === "medicine" ? "bg-green-100 shadow-[inset_0_-2px_0_#16a34a]" : "bg-teal-100 shadow-[inset_0_-2px_0_#0d9488]"}`}>
        {text.slice(m.start, m.end)}
      </mark>,
    );
    pos = m.end;
  }
  out.push(text.slice(pos));
  return out;
}
