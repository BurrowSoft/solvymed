"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

// "Discard changes?" for settings forms (1.9.0 MUST-fix, 02; the app does
// the same): closing a form with unsaved changes by any path other than its
// own Cancel / Discard button (X, backdrop, Esc, opening another form in its
// place, the sidebar or a link, reloading or closing the tab) asks first,
// never a silent discard. An explicit Cancel is a confirmed discard and
// never asks (settings only: the clinical dialogs keep asking on Cancel,
// #413). Unsaved = the form's values differ from the ones it opened with.

// The forms on this page with unsaved changes (the link guard asks while
// there is any).
const dirtyForms = new Set<symbol>();
export function hasUnsavedChanges(): boolean {
  return dirtyForms.size > 0;
}

// While `dirty`: counted for the link guard, and the browser's own
// leave-page prompt on reload / closing the tab / another site.
export function useLeaveGuard(dirty: boolean) {
  const id = useRef(Symbol("form"));
  useEffect(() => {
    if (!dirty) return;
    const key = id.current;
    dirtyForms.add(key);
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => {
      dirtyForms.delete(key);
      window.removeEventListener("beforeunload", warn);
    };
  }, [dirty]);
}

// A form's values, as it would post them.
export function formValues(form: HTMLFormElement | null): string {
  if (!form) return "";
  const out: [string, string][] = [];
  new FormData(form).forEach((v, k) => { out.push([k, typeof v === "string" ? v : `file:${v.name}:${v.size}`]); });
  return JSON.stringify(out);
}

// An (uncontrolled) form: dirty while its values differ from the ones it
// loaded with, or last saved. Spread `formProps` on the <form>; call
// `markClean()` after a save. `key`: which record the form is open on
// (another one re-reads the starting values).
export function useFormDirty(enabled = true, key: unknown = null) {
  const ref = useRef<HTMLFormElement>(null);
  const base = useRef<string | null>(null);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { base.current = enabled ? formValues(ref.current) : null; setDirty(false); }, [enabled, key]);
  const check = useCallback(() => {
    // After React has applied the change (controlled fields, hidden inputs
    // that follow them).
    setTimeout(() => {
      if (base.current === null || !ref.current) return;
      setDirty(formValues(ref.current) !== base.current);
    }, 0);
  }, []);
  const markClean = useCallback(() => {
    base.current = formValues(ref.current);
    setDirty(false);
  }, []);
  useLeaveGuard(enabled && dirty);
  return { ref, dirty: enabled && dirty, markClean, formProps: { ref, onChange: check, onInput: check } };
}

// "Discard changes?" [Discard] [Keep editing], inline where it's asked.
export function DiscardConfirm({ onDiscard, onKeep, className = "" }: { onDiscard: () => void; onKeep: () => void; className?: string }) {
  const t = useTranslations("common");
  return (
    <div role="alertdialog" aria-labelledby="discard-title" data-testid="discard-confirm" className={`rounded-xl border border-amber-200 bg-amber-50 p-4 ${className}`}>
      <p id="discard-title" className="text-sm font-semibold text-slate-900">{t("discardTitle")}</p>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={onDiscard} className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700">{t("discard")}</button>
        <button type="button" autoFocus onClick={onKeep} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t("keepEditing")}</button>
      </div>
    </div>
  );
}

// Ask before `proceed` when `dirty`; `dialog` renders the question.
export function useDiscardAsk() {
  const [pending, setPending] = useState<null | (() => void)>(null);
  const ask = useCallback((dirty: boolean, proceed: () => void) => {
    if (dirty) setPending(() => proceed);
    else proceed();
  }, []);
  const dialog = pending ? (
    <DiscardConfirm className="mb-3" onDiscard={() => { const p = pending; setPending(null); p(); }} onKeep={() => setPending(null)} />
  ) : null;
  return { ask, dialog, asking: pending !== null };
}

// The sidebar and every link in the dashboard: leaving a page with unsaved
// changes asks first (the browser's prompt covers reload / closing the tab
// / other sites). Clicks are caught before Next's own Link handler.
export function NavigationGuard() {
  const router = useRouter();
  const t = useTranslations("common");
  const [to, setTo] = useState<string | null>(null);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!hasUnsavedChanges() || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      // Another site: the browser's own prompt asks. The same page (a #
      // anchor): nothing is lost.
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      setTo(url.pathname + url.search + url.hash);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  if (!to) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4" data-testid="discard-navigation">
      <div className="w-full max-w-sm rounded-2xl bg-white p-2 shadow-xl">
        <DiscardConfirm
          className="border-0 bg-white"
          onDiscard={() => { const dest = to; dirtyForms.clear(); setTo(null); router.push(dest); }}
          onKeep={() => setTo(null)}
        />
      </div>
      <span className="sr-only">{t("discardTitle")}</span>
    </div>
  );
}
