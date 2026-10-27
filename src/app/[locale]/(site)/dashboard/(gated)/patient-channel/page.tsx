import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { staffContext } from "@/lib/patientChannel/staff";
import { INBOX_COLUMNS, INBOX_FILTERS, filterInbox, parseFilter, sortInbox, toCounts, toInboxRow, type InboxFilter } from "@/lib/patientChannel/inbox";
import { BandTag } from "../../settings/patient-channel/BandTag";
import { isUnscored } from "@/lib/patientChannel/unscored";

// Patient Channel M5 (specs/patient-contact-tech.md §6): the doctor's / secretary's inbox.
// KPI tiles from 237's pc_inbox_counts (the open ones per band; FAQ- and automatic-message-
// resolved over the last 7 days, the database's window); the list from pc_requests under
// RLS, open first by score (highest first, then the longest waiting), then the closed ones
// (newest first). Filters are links (?filter=), so the page stays a server render.
// A secretary sees what 237 lets her read, plus the count of open ones for the doctor.
export default async function PatientChannelInboxPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ filter?: string | string[] }>;
}) {
  const { locale } = await params;
  const filter = parseFilter((await searchParams).filter);
  const ctx = await staffContext(locale);
  const { supabase, prefix, profId, isSecretary, doctorName, formatWhen } = ctx;
  const [t, tSettings] = await Promise.all([
    getTranslations({ locale, namespace: "patientChannel" }),
    getTranslations({ locale, namespace: "settings" }),
  ]);
  // Who it goes to, from the viewer's side: the doctor reads "To you"; a secretary, the doctor's name
  // (01: no gendered "médico").
  const destination = (d: "doctor" | "secretary") =>
    d === "secretary" ? t("inbox.toSecretary") : isSecretary ? t("inbox.toDoctor", { doctor: doctorName || "—" }) : t("reasons.to.doctor");

  const [open, closed, counts] = await Promise.all([
    supabase.from("pc_requests").select(INBOX_COLUMNS).eq("professional_id", profId).eq("status", "open")
      .order("score_total", { ascending: false }).order("created_at").limit(500),
    supabase.from("pc_requests").select(INBOX_COLUMNS).eq("professional_id", profId).in("status", ["answered", "call_back"])
      .order("created_at", { ascending: false }).limit(100),
    supabase.rpc("pc_inbox_counts", { p_prof: profId }),
  ]);
  const kpi = toCounts(counts.data);
  const failed = !!(open.error || closed.error || counts.error || !kpi);

  const raw = [...(open.data ?? []), ...(closed.data ?? [])] as Record<string, unknown>[];
  const rows = sortInbox(raw.map((r) => toInboxRow(r)));
  // Administrative requests (an options / exam reason) have no score: no band, no points
  // (launch polish 29). A snapshot without a kind (older rows) keeps its score.
  const unscored = new Set(raw.filter((r) => isUnscored(r.reason_snapshot)).map((r) => String(r.id)));
  const shown = filterInbox(rows, filter);
  // What a secretary can't read: the open ones for the doctor (unless the doctor lets her see all).
  const hiddenForDoctor = isSecretary && kpi ? Math.max(0, kpi.openForDoctor - rows.filter((r) => r.status === "open" && r.destination === "doctor").length) : 0;
  const filterLabel = (f: InboxFilter) =>
    f === "all" ? t("inbox.all") : f === "open" ? t("inbox.openOnly") : f === "secretary" ? t("inbox.secretary") : t(`bands.${f}`);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl" data-testid="pc-inbox">
      <h1 className="text-2xl font-extrabold text-slate-900">{t("inbox.title")}</h1>
      {failed && <div className="error-banner mt-6">{tSettings("loadError")}</div>}

      {kpi && (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5" data-testid="pc-inbox-kpis">
          {([["red", kpi.urgent], ["amber", kpi.attention], ["green", kpi.notUrgent]] as const).map(([band, n]) => (
            <div key={band} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm" data-testid={`pc-kpi-${band}`}>
              <BandTag band={band} />
              <p className="mt-2 text-2xl font-extrabold tabular-nums text-slate-900">{n}</p>
              <p className="text-xs text-slate-500">{t("inbox.kpiOpen")}</p>
            </div>
          ))}
          {([["faq", t("inbox.kpiFaq"), kpi.faqResolved7d], ["auto", t("inbox.kpiAuto"), kpi.autoResolved7d]] as const).map(([key, label, n]) => (
            <div key={key} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm" data-testid={`pc-kpi-${key}`}>
              <p className="text-xs font-bold text-slate-700">{label}</p>
              <p className="mt-2 text-2xl font-extrabold tabular-nums text-slate-900">{n}</p>
              <p className="text-xs text-slate-500">{t("inbox.kpiWindow")}</p>
            </div>
          ))}
        </div>
      )}

      <nav className="mt-6 flex flex-wrap gap-2" aria-label={t("inbox.title")}>
        {INBOX_FILTERS.map((f) => (
          <Link
            key={f}
            href={`${prefix}/dashboard/patient-channel${f === "all" ? "" : `?filter=${f}`}`}
            aria-current={f === filter ? "page" : undefined}
            data-testid={`pc-filter-${f}`}
            className={`rounded-full border px-3 py-1 text-sm font-medium ${f === filter ? "border-teal-600 bg-teal-50 text-teal-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
          >
            {filterLabel(f)}
          </Link>
        ))}
      </nav>

      {hiddenForDoctor > 0 && doctorName && (
        <p className="mt-4 text-sm text-slate-600" data-testid="pc-inbox-hidden">{t("inbox.secretaryOthers", { n: hiddenForDoctor, doctor: doctorName })}</p>
      )}

      <ul className="mt-4 flex flex-col gap-2" data-testid="pc-inbox-list">
        {shown.length === 0 && !failed && <li className="text-sm text-slate-500">{t("inbox.empty")}</li>}
        {shown.map((r) => (
          <li key={r.id}>
            <Link
              href={`${prefix}/dashboard/patient-channel/${r.id}`}
              data-testid="pc-inbox-row"
              className={`flex flex-col gap-1 rounded-2xl border bg-white p-4 shadow-sm hover:bg-slate-50 sm:flex-row sm:items-center sm:gap-4 ${r.status === "open" ? "border-slate-200" : "border-slate-100 opacity-80"}`}
            >
              <div className="flex shrink-0 items-center gap-2 sm:w-40">
                {!unscored.has(r.id) && (
                  <>
                    <BandTag band={r.band} />
                    <span className="text-sm font-bold tabular-nums text-slate-700">{t("inbox.points", { n: r.score })}</span>
                  </>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-slate-900">{r.patientName}</p>
                {/* The reason only: the message text is in the (access-logged) detail. */}
                <p className="truncate text-sm text-slate-500">{r.reasonTitle}</p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 sm:flex-col sm:items-end">
                <span>{formatWhen(r.createdAt)}</span>
                <span>{destination(r.destination)} · {t(`inbox.status.${r.status}`)}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
