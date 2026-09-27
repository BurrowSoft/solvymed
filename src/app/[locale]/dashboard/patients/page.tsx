import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { PatientSearch, NewPatientButton, PatientCard } from "./PatientsClient";

export default async function PatientsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string | string[]; archived?: string | string[]; new?: string }>;
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

  const effectiveProfId = userRoleData?.role === "secretary"
    ? (userRoleData?.invited_by_professional_id as string | null) ?? user.id
    : user.id;

  let query = supabase
    .from("patients")
    .select("id, full_name, email, phone, sex, birth_date, created_at, archived_at, archived_by_name")
    .eq("professional_id", effectiveProfId)
    .order("full_name");
  query = showArchived ? query.not("archived_at", "is", null) : query.is("archived_at", null);

  if (q) query = query.ilike("full_name", `%${q}%`);

  const countQuery = () => supabase
    .from("patients")
    .select("*", { count: "exact", head: true })
    .eq("professional_id", effectiveProfId);

  const [{ data: patients }, activeCount, archivedCount] = await Promise.all([
    query,
    countQuery().is("archived_at", null),
    countQuery().not("archived_at", "is", null),
  ]);

  const patientList = (patients ?? []) as {
    id: string; full_name: string; email?: string; phone?: string;
    sex?: string; birth_date?: string; created_at: string;
    archived_at?: string | null; archived_by_name?: string | null;
  }[];

  const total = activeCount.count ?? 0;
  const archivedTotal = archivedCount.count ?? 0;
  const listHref = (archived: boolean) => `${prefix}/dashboard/patients${archived ? "?archived=1" : ""}`;
  const chipClass = (active: boolean) =>
    `rounded-full px-3 py-1 text-xs font-semibold transition ${active ? "bg-teal-600 text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50"}`;

  return (
    <div className="p-6 lg:p-8 max-w-5xl">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">{showArchived ? t("archivedTitle") : t("title")}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {t("total", { n: showArchived ? archivedTotal : total })}{q ? ` · ${t("matching", { n: patientList.length, q })}` : ""}
          </p>
        </div>
        {!showArchived && <NewPatientButton locale={locale} autoOpen={sp.new === "1"} />}
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
        </div>
      ) : (
        <div className="space-y-2">
          {patientList.map(patient => (
            <PatientCard key={patient.id} patient={patient} locale={locale} />
          ))}
        </div>
      )}
    </div>
  );
}
