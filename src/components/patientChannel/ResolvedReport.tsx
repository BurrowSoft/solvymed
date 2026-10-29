"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { REPORT_PERIODS, rowText, toResolvedReport, type ReportPeriod, type ResolvedReport as Report } from "@/lib/patientChannel/resolvedReport";

// Item 43, "Resolvidas sem mensagem": which FAQ answers and automatic messages solved
// patients' questions without a message, over 7 / 30 / 90 days (272's pc_selfserve_report:
// the doctor, or a secretary with "sees all"; anyone else is refused and the card stays
// hidden). Highest first; "Sem item específico" last, only when > 0, so the rows add up to
// the total; then the total and how many requests were sent in the same period (the share).
// Only rendered while pc-resolved-items-live (the callers check it).
export function ResolvedReport({ profId, className = "" }: { profId: string; className?: string }) {
  const t = useTranslations("patientChannel");
  const [days, setDays] = useState<ReportPeriod>(7);
  const [state, setState] = useState<{ days: ReportPeriod; report: Report | null; status: "ok" | "error" | "hidden" } | null>(null);

  useEffect(() => {
    let live = true;
    void createClient().rpc("pc_selfserve_report", { p_prof: profId, p_days: days }).then(({ data, error }) => {
      if (!live) return;
      if (error) {
        setState({ days, report: null, status: (error.message ?? "").includes("out_of_scope") ? "hidden" : "error" });
        return;
      }
      const report = toResolvedReport(data);
      setState({ days, report, status: report ? "ok" : "error" });
    }, () => live && setState({ days, report: null, status: "error" }));
    return () => {
      live = false;
    };
  }, [profId, days]);

  if (state?.status === "hidden") return null;
  const report = state?.days === days ? state.report : null;
  const loading = !state || state.days !== days;
  const empty = report && report.total === 0 && report.items.length === 0;

  return (
    <section className={`rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-5 ${className}`} aria-labelledby="pc-report" data-testid="pc-report">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="pc-report" className="text-lg font-extrabold text-slate-900">{t("report.title")}</h2>
          <p className="max-w-prose text-sm text-slate-500">{t("report.intro")}</p>
        </div>
        <div role="group" aria-label={t("report.period")} className="flex shrink-0 gap-1">
          {REPORT_PERIODS.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={d === days}
              data-testid={`pc-report-days-${d}`}
              onClick={() => setDays(d)}
              className={`rounded-full border px-3 py-1 text-sm font-medium ${d === days ? "border-teal-600 bg-teal-50 text-teal-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
            >
              {t("report.days", { n: d })}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-slate-500" aria-busy="true">…</p>
      ) : state?.status === "error" || !report ? (
        <p role="alert" className="mt-4 text-sm text-red-700" data-testid="pc-report-error">{t("report.loadError")}</p>
      ) : empty ? (
        <p className="mt-4 text-sm text-slate-500" data-testid="pc-report-empty">{t("report.empty")}</p>
      ) : (
        <>
          <ol className="mt-4 divide-y divide-slate-100" data-testid="pc-report-list">
            {report.items.map((item) => {
              const { line1, line2 } = rowText(item, (k, v) => t(k as never, v as never));
              return (
                <li key={`${item.kind}:${item.id}`} className="flex items-start justify-between gap-3 py-2" data-testid={`pc-report-row-${item.kind}-${item.id}`}>
                  <span className="min-w-0">
                    <span className="block break-words text-sm text-slate-900">{line1}</span>
                    {line2 && <span className="block break-words text-xs text-slate-500">{line2}</span>}
                  </span>
                  <b className="shrink-0 tabular-nums text-slate-900">{item.n}</b>
                </li>
              );
            })}
            {report.unattributed > 0 && (
              <li className="flex items-start justify-between gap-3 py-2 text-slate-500" data-testid="pc-report-unattributed">
                <span className="min-w-0 text-sm">{t("report.unattributed")}</span>
                <b className="shrink-0 tabular-nums">{report.unattributed}</b>
              </li>
            )}
          </ol>
          <p className="mt-3 border-t border-slate-100 pt-3 text-sm text-slate-700" data-testid="pc-report-totals">
            {t("report.totals", { total: report.total, sent: report.sent })}
          </p>
        </>
      )}
    </section>
  );
}
