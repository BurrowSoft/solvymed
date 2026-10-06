import { createClient } from "@/lib/supabase/server";
import { readPatientFieldRules } from "@/lib/patientFields";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { PatientSearch, NewPatientButton, PatientCard } from "./PatientsClient";
import { PATIENTS_PAGE_SIZE, pageRange, parsePage, patientSearchFilter } from "@/lib/patientSearch";
import { getPracticeCountry } from "@/lib/practiceCountry";
import { patientIdKind } from "@/lib/patientIds";
import { conditionMet } from "@/lib/conditions";
import { INVITE_COLUMNS, isNewInvited, type InviteFields } from "@/lib/invitedPatients";
import { AutoRefresh } from "@/components/AutoRefresh";
import { actingPracticeFor } from "@/lib/effectiveProfId";

export default async function PatientsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string | string[]; archived?: string | string[]; new?: string; page?: string | string[] }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const q = first(sp.q);
  // Archived patients are hidden by default and listed on their own view.
  const showArchived = first(sp.archived) === "1";
  const prefix = locale === "en" ? "" : `/${locale}`;

  const [supabase, t] = await Promise.all([
    createClient(),
    getTranslations("patients"),
  ]);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale === "en" ? "" : locale + "/"}auth/login`);

  const { data: userRoleData } = await supabase
    .from("user_roles")
    .select("role, invited_by_professional_id")
    .eq("user_id", user.id)
    .maybeSingle();

  // A secretary: the doctor chosen in the switcher (1.5.0), else her primary.
  const effectiveProfId = userRoleData?.role === "secretary"
    ? (await actingPracticeFor((userRoleData?.invited_by_professional_id as string | null) ?? null, user.id)) ?? user.id
    : user.id;

  // Paged and searched in the database: a response is capped at 1000 rows,
  // so a large clinic's list must never be loaded whole.
  const page = parsePage(first(sp.page));
  const [from, to] = pageRange(page);
  // The practice country's patient ID (CPF / Thai ID + passport / passport).
  const idKind = patientIdKind(await getPracticeCountry(supabase, user.id, effectiveProfId));
  // 1.8.0 C1: the practice's registration rules (null before 207: today's form).
  const fieldRules = effectiveProfId ? await readPatientFieldRules(supabase, effectiveProfId) : null;
  const filter = patientSearchFilter(q, idKind);

  // The import (130/131): its button for the doctor, and the archived
  // reason column, which exists only once 131 is applied.
  const importLive = conditionMet("patient-import-live");
  const isDoctor = userRoleData?.role !== "secretary";
  // Invited patients (145): only once invited-patients-live (the columns exist).
  const invitedLive = conditionMet("invited-patients-live");
  const listCols: string = `id, full_name, email, phone, sex, birth_date, created_at, archived_at, archived_by_name${importLive ? ", archived_reason" : ""}${invitedLive ? `, ${INVITE_COLUMNS}` : ""}`;
  let query = supabase
    .from("patients")
    .select(listCols, { count: "exact" })
    .eq("professional_id", effectiveProfId)
    .order("full_name")
    .order("id")
    .range(from, to);
  query = showArchived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (filter) query = query.or(filter);

  const countQuery = () => supabase
    .from("patients")
    .select("*", { count: "exact", head: true })
    .eq("professional_id", effectiveProfId);

  const [{ data: patients, count: listCount }, activeCount, archivedCount] = await Promise.all([
    query,
    countQuery().is("archived_at", null),
    countQuery().not("archived_at", "is", null),
  ]);

  const patientList = (patients ?? []) as unknown as ({
    id: string; full_name: string; email?: string; phone?: string;
    sex?: string; birth_date?: string; created_at: string;
    archived_at?: string | null; archived_by_name?: string | null; archived_reason?: string | null;
  } & InviteFields)[];
  // The same-e-mail records' names, for "Mesmo e-mail de {nome}: mesclar?".
  const sameIds = invitedLive ? [...new Set(patientList.filter(isNewInvited).map((p) => p.invite_same_email_as).filter((x): x is string => !!x))] : [];
  const sameNames = new Map<string, string>();
  if (sameIds.length) {
    const { data: others } = await supabase.from("patients").select("id, full_name").eq("professional_id", effectiveProfId).in("id", sameIds);
    for (const o of (others ?? []) as { id: string; full_name: string }[]) sameNames.set(o.id, o.full_name);
  }
  const cards = patientList.map((p) => ({
    ...p,
    newInvited: invitedLive && isNewInvited(p),
    sameEmailAs: invitedLive && isNewInvited(p) && p.invite_same_email_as && sameNames.has(p.invite_same_email_as)
      ? { id: p.invite_same_email_as, name: sameNames.get(p.invite_same_email_as)! } : null,
  }));

  const total = activeCount.count ?? 0;
  const archivedTotal = archivedCount.count ?? 0;
  // A page past the end makes PostgREST reject the range (PGRST103) with no
  // count, so the total then comes from a separate count with the same
  // filters (the unfiltered totals are already known).
  let matched = listCount ?? null;
  if (matched === null) {
    if (!filter) {
      matched = showArchived ? archivedTotal : total;
    } else {
      let c = countQuery();
      c = showArchived ? c.not("archived_at", "is", null) : c.is("archived_at", null);
      matched = (await c.or(filter)).count ?? patientList.length;
    }
  }
  const lastPage = Math.max(1, Math.ceil(matched / PATIENTS_PAGE_SIZE));
  const listHref = (archived: boolean) => `${prefix}/dashboard/patients${archived ? "?archived=1" : ""}`;
  const pageHref = (n: number) => {
    const params = new URLSearchParams();
    if (showArchived) params.set("archived", "1");
    if (q) params.set("q", q);
    if (n > 1) params.set("page", String(n));
    const s = params.toString();
    return `${prefix}/dashboard/patients${s ? `?${s}` : ""}`;
  };
  // A page past the end (an old link, or patients archived meanwhile) goes
  // to the last page instead of an empty list.
  if (page > lastPage) redirect(pageHref(lastPage));
  const chipClass = (active: boolean) =>
    `rounded-full px-3 py-1 text-xs font-semibold transition ${active ? "bg-teal-600 text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50"}`;

  return (
    <div className="p-6 lg:p-8 max-w-5xl">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">{showArchived ? t("archivedTitle") : t("title")}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {t("total", { n: showArchived ? archivedTotal : total })}{q ? ` · ${t("matching", { n: matched, q })}` : ""}
          </p>
        </div>
        {!showArchived && (
          <div className="flex flex-wrap items-center gap-2">
            <AutoRefresh />
            {importLive && isDoctor && (
              <Link href={`${prefix}/dashboard/patients/import`} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition">
                {t("importButton")}
              </Link>
            )}
            <NewPatientButton locale={locale} autoOpen={sp.new === "1"} idKind={idKind} addressLive={conditionMet("patient-address-live")} fieldRules={fieldRules} />
          </div>
        )}
      </div>

      {/* Active / Archived switch. It only appears once a patient has been
          archived, so a new clinic doesn't see an empty feature. */}
      {(showArchived || archivedTotal > 0) && (
        <nav className="mb-4 flex flex-wrap gap-2">
          <Link href={listHref(false)} aria-current={!showArchived ? "page" : undefined} className={chipClass(!showArchived)}>
            {t("activeChip", { n: total })}
          </Link>
          <Link href={listHref(true)} aria-current={showArchived ? "page" : undefined} className={chipClass(showArchived)}>
            {t("archivedChip", { n: archivedTotal })}
          </Link>
        </nav>
      )}

      {/* Search */}
      <div className="mb-5">
        <PatientSearch defaultValue={q ?? ""} />
      </div>

      {/* Patient list */}
      {patientList.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-12 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-50">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7 text-slate-300">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <p className="font-semibold text-slate-500">{q ? t("noResults", { q }) : showArchived ? t("noArchived") : t("noPatients")}</p>
          {!q && !showArchived && <p className="text-sm text-slate-400 mt-1">{t("noPatientsHint")}</p>}
          {!q && !showArchived && importLive && isDoctor && (
            <Link href={`${prefix}/dashboard/patients/import`} className="mt-3 inline-block text-sm font-semibold text-teal-700 underline">{t("importEmptyLink")}</Link>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {cards.map(patient => (
            <PatientCard key={patient.id} patient={patient} locale={locale} />
          ))}
        </div>
      )}

      {/* Pages of PATIENTS_PAGE_SIZE */}
      {matched > PATIENTS_PAGE_SIZE && (
        <nav aria-label={t("pagesLabel")} className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="text-slate-500">
            {t("pageInfo", { from: Math.min(from + 1, matched), to: Math.min(to + 1, matched), total: matched })}
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link href={pageHref(page - 1)} rel="prev" className="rounded-xl border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50">
                {t("prevPage")}
              </Link>
            ) : null}
            {page < lastPage ? (
              <Link href={pageHref(page + 1)} rel="next" className="rounded-xl border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50">
                {t("nextPage")}
              </Link>
            ) : null}
          </div>
        </nav>
      )}
    </div>
  );
}
