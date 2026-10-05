"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { addColleague, removeColleague } from "../colleague-actions";
import { colleagueLogoUrl, colleagueName, type ColleagueError, type ColleagueRow } from "@/lib/colleagues";

// Settings → "Meus colegas" (167; doctors only, behind liveFeatures.colleagues):
// add by a colleague's exact public code, remove; only the doctor sees the
// list. An unavailable colleague (closed, or no longer published) shows the
// name, "Não está mais disponível" and Remove only.
export function ColleaguesCard({ initial, loadFailed }: { initial: ColleagueRow[]; loadFailed: boolean }) {
  const t = useTranslations("colleagues");
  const [rows, setRows] = useState(initial);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, start] = useTransition();

  const errorText = (c: ColleagueError) =>
    t(c === "notFound" ? "notFound" : c === "self" ? "self" : c === "limit" ? "limit" : c === "tooMany" ? "tooMany" : "failed");

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setMsg(null);
    start(async () => {
      const r = await addColleague(code);
      if (!r.ok) { setMsg({ kind: "error", text: errorText(r.code) }); return; }
      setRows((prev) => [...prev.filter((x) => x.colleague_id !== r.row.colleague_id), r.row]
        .sort((a, b) => colleagueName(a).localeCompare(colleagueName(b))));
      setCode("");
      setMsg({ kind: "ok", text: t("added", { doctor: colleagueName(r.row) }) });
    });
  }

  function remove(id: string) {
    setMsg(null);
    start(async () => {
      const r = await removeColleague(id);
      if (r.ok) setRows((prev) => prev.filter((x) => x.colleague_id !== id));
      else setMsg({ kind: "error", text: t("failed") });
    });
  }

  return (
    <section data-testid="colleagues-card" className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold text-slate-900">{t("title")}</h2>
      <p className="mt-1 text-sm text-slate-500">{t("hint")}</p>

      <form onSubmit={add} className="mt-4 flex flex-wrap items-end gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t("codeLabel")}
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={64}
            autoComplete="off"
            className="rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-normal normal-case tracking-normal text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
          />
        </label>
        <button type="submit" disabled={busy || !code.trim()} className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
          {t("addButton")}
        </button>
      </form>
      {msg && <p role="status" className={`mt-2 text-sm ${msg.kind === "ok" ? "text-teal-700" : "text-red-600"}`}>{msg.text}</p>}

      {loadFailed ? (
        <p className="mt-4 text-sm text-red-600">{t("failed")}</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">{t("empty")}</p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100">
          {rows.map((c) => {
            const logo = c.available ? colleagueLogoUrl(c) : null;
            return (
              <li key={c.colleague_id} className="flex items-center justify-between gap-3 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  {logo
                    ? <img src={logo} alt="" className="h-9 w-9 shrink-0 rounded-lg object-contain ring-1 ring-slate-100" />
                    : <span aria-hidden="true" className="h-9 w-9 shrink-0 rounded-lg bg-slate-100" />}
                  <div className="min-w-0">
                    <p className={`truncate text-sm font-semibold ${c.available ? "text-slate-800" : "text-slate-400"}`}>{colleagueName(c)}</p>
                    <p className="truncate text-xs text-slate-500">{c.available ? c.specialty ?? "" : t("unavailable")}</p>
                  </div>
                </div>
                <button type="button" disabled={busy} onClick={() => remove(c.colleague_id)} className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">
                  {t("remove")}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
