import { createClient } from "@/lib/supabase/server";
import { readPatientFieldRules } from "@/lib/patientFields";
import { getPracticeCountry } from "@/lib/practiceCountry";
import { patientIdKind } from "@/lib/patientIds";
import { conditionMet } from "@/lib/conditions";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PatientTabs, ArchivedBanner, type MedRecord, type Rx } from "./PatientDetailClient";
import type { MedDoc } from "./MedicalDocuments";
import { getArchivePreview, mergeAvailable } from "../actions";
import { MergedNotice } from "./MergeNotice";
import { ImportedData } from "./ImportedData";
import { ReferColleague } from "./ReferColleague";
import { liveFeatures } from "@/lib/liveFeatures";
import { countryProfile, messagingChannel } from "@/lib/country";
import { logPatientOpen, readAccessLog } from "@/lib/accessLog";
import { getClinicTimeZone } from "@/lib/clinicTime";
import { AutoRefresh } from "@/components/AutoRefresh";
import { actingPracticeFor } from "@/lib/effectiveProfId";
import { serverFlag } from "@/lib/myDoctors";
import { currentRecordSections, parseTemplateSections, type RecordTemplate } from "@/lib/recordTemplates";

export default async function PatientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams?: Promise<{ mergeWith?: string }>;
}) {
  const { locale, id } = await params;
  // "Mesmo e-mail de {nome}: mesclar?" opens the merge with that pair (145).
  const mergeWithRaw = (await searchParams)?.mergeWith;
  const mergeWith = typeof mergeWithRaw === "string" && /^[0-9a-f-]{36}$/i.test(mergeWithRaw) ? mergeWithRaw : null;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale === "en" ? "" : locale + "/"}auth/login`);

  const prefix = locale === "en" ? "" : `/${locale}`;

  const { data: userRoleData } = await supabase
    .from("user_roles")
    .select("role, invited_by_professional_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const isSecretary = userRoleData?.role === "secretary";
  // A secretary: the doctor chosen in the switcher (1.5.0), else her primary.
  const effectiveProfId = isSecretary
    ? (await actingPracticeFor((userRoleData?.invited_by_professional_id as string | null) ?? null, user.id)) ?? user.id
    : user.id;

  // Records and prescriptions are doctor-only. RLS already denies them to
  // a secretary, but the page doesn't even ask, so clinical content can
  // never reach a secretary's browser through these props.
  const noRows = Promise.resolve({ data: [] as never[] });
  // 1.8.0 D (migration 189, flag 'record_templates'): the columns are only
  // asked for once the flag is on, so the page works before 189 too.
  const templatesOn = !isSecretary && (await serverFlag(supabase, "record_templates"));
  const recordCols: string = `id, date, time, content, record_type, created_at, created_by, created_by_name, corrects_id, correction_reason${templatesOn ? ", template_name, sections" : ""}`;
  const [patientResult, recordsResult, prescriptionsResult, apptsResult, preview, t, templatesResult] = await Promise.all([
    supabase.from("patients").select("*").eq("id", id).eq("professional_id", effectiveProfId).single(),
    isSecretary
      ? noRows
      : supabase.from("medical_records").select(recordCols).eq("patient_id", id).order("date", { ascending: false }).order("time", { ascending: false }),
    isSecretary
      ? noRows
      : supabase.from("prescriptions").select("id, date, notes, created_at, created_by, created_by_name, corrects_id, correction_reason, prescription_items(name, dosage, frequency, duration)").eq("patient_id", id).order("date", { ascending: false }),
    supabase.from("appointments").select("id, date, start_time, consultation_type, status, payment_status, payment_amount").eq("patient_id", id).neq("status", "blocked").order("date", { ascending: false }).limit(50),
    // Whether Delete is offered at all (only without clinical history).
    // Null on error: Delete stays hidden and Archive is always available.
    getArchivePreview(id),
    getTranslations("patientDetail"),
    templatesOn
      ? supabase.from("record_templates").select("id, name, sections, position").eq("professional_id", user.id).order("position").order("created_at")
      : noRows,
  ]);

  if (!patientResult.data) notFound();

  // The access log (migration 111): this open is recorded (doctor or
  // secretary), and the doctor gets the log's first page for its tab.
  // Secretaries never see the log. Logged first, so the log shown
  // includes this open.
  await logPatientOpen(supabase, id);
  // The clinic's time zone: the access log's times, and the page's dates
  // (the same on the server and in the browser, so no hydration mismatch).
  const timeZone = await getClinicTimeZone(supabase, { professionalId: effectiveProfId, isSecretary });
  const accessLog = isSecretary ? null : await readAccessLog(supabase, id, { locale, timeZone });

  const patient = patientResult.data as {
    id: string; full_name: string; email?: string; phone?: string; cpf?: string;
    sex?: string; birth_date?: string; profession?: string; emergency_phone?: string;
    convenio_type?: string; invite_code?: string; created_at: string;
    booking_blocked?: boolean;
    // Brought by an import (migration 131): "Dados importados", doctor only.
    import_id?: string | null;
    archived_at?: string | null; archived_by_name?: string | null; archived_reason?: string | null;
  };
  const isArchived = !!patient.archived_at;
  const practiceCountry = await getPracticeCountry(supabase, user.id, effectiveProfId);
  // 1.8.0 B (flag 'clinical_documents'): the doctor's documents for this
  // patient, in "Receitas e documentos". Never read for a secretary.
  const docsOn = !isSecretary && (await serverFlag(supabase, "clinical_documents"));
  const docsResult = docsOn
    ? await supabase.from("medical_documents")
        .select("id, doc_type, language, fields, body, created_at, created_by, created_by_name, corrects_id, correction_reason")
        .eq("patient_id", id).order("created_at", { ascending: false })
    : null;
  const records = ((recordsResult.data ?? []) as unknown as (MedRecord & { sections?: unknown })[])
    .map((r) => ({ ...r, sections: currentRecordSections(r.sections, r.content) }));
  const recordTemplates: RecordTemplate[] | null = templatesOn
    ? ((templatesResult.data ?? []) as { id: string; name: string; sections: unknown; position: number }[])
        .map((r) => ({ id: r.id, name: r.name, sections: parseTemplateSections(r.sections), position: r.position ?? 0 }))
    : null;
  const prescriptions = (prescriptionsResult.data ?? []) as Rx[];
  const appointments = (apptsResult.data ?? []) as { id: string; date: string; start_time: string; consultation_type: string; status: string; payment_status: string; payment_amount: number | null }[];

  const initials = patient.full_name.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase();
  const age = patient.birth_date
    ? Math.floor((Date.now() - new Date(patient.birth_date).getTime()) / (365.25 * 24 * 3600 * 1000))
    : null;

  return (
    <div className="p-6 lg:p-8 max-w-4xl">
      {/* Back */}
      <Link href={`${prefix}/dashboard/patients`} className="mb-6 flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-700 transition">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><polyline points="15 18 9 12 15 6"/></svg>
        {t("allPatients")}
      </Link>

      {/* Patient header */}
      <div className="mb-8 flex items-center gap-5">
        <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-xl font-bold ${patient.booking_blocked ? "bg-red-100 text-red-600" : "bg-teal-100 text-teal-700"}`}>
          {initials}
        </div>
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-extrabold text-slate-900">{patient.full_name}</h1>
            {/* The patient's appointments stay current (item 25). */}
            <AutoRefresh />
            {patient.booking_blocked && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-700">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3 w-3"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                {t("blockedTitle")}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            {[patient.sex ? patient.sex.charAt(0).toUpperCase() + patient.sex.slice(1) : null, age ? t("age", { n: age }) : null, patient.email].filter(Boolean).join(" · ")}
          </p>
        </div>
        {/* The history print view (Help P8): clinical, so doctor only. "Indicar
            colega" (167): doctors only, an archived patient never. */}
        {!isSecretary && (
          <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
            {liveFeatures.colleagues && !isArchived && (
              <ReferColleague
                patientName={patient.full_name}
                patientPhone={patient.phone ?? null}
                practiceCountry={practiceCountry}
                whatsapp={messagingChannel(countryProfile(practiceCountry)) === "whatsapp"}
              />
            )}
            <a
              href={`${prefix}/dashboard/patients/${patient.id}/history/print`}
              className="shrink-0 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              {t("historyPdf")}
            </a>
          </div>
        )}
      </div>

      {isArchived && (
        <ArchivedBanner
          patientId={patient.id}
          archivedAt={patient.archived_at!}
          archivedByName={patient.archived_by_name ?? null}
          archivedReason={patient.archived_reason ?? null}
          locale={locale}
        />
      )}

      {/* Tabs */}
      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm p-6">
        <MergedNotice />
        <PatientTabs
          patient={patient}
          records={records}
          prescriptions={prescriptions}
          appointments={appointments}
          locale={locale}
          isSecretary={isSecretary}
          isArchived={isArchived}
          currentUserId={user.id}
          idKind={patientIdKind(practiceCountry)}
          canMerge={!isSecretary && (await mergeAvailable())}
          mergeWith={mergeWith}
          // "Excluir cadastro" stays visible with appointments (as app #299):
          // a click explains why it can't and offers Arquivar.
          canDelete={preview?.hasClinicalHistory === false}
          hasAppointments={preview?.hasAppointments === true}
          accessLog={accessLog}
          timeZone={timeZone}
          recordTemplates={recordTemplates}
          fieldRules={await readPatientFieldRules(supabase, effectiveProfId)}
          medicalDocs={docsResult && !docsResult.error ? {
            list: (docsResult.data ?? []) as MedDoc[],
            country: practiceCountry,
            hasPatientId: !!(patient.cpf || (patient as { passport_number?: string | null }).passport_number),
          } : null}
          documentsOn={!isSecretary && (await serverFlag(supabase, "patient_documents"))}
          addressLive={conditionMet("patient-address-live")}
        />
      </div>
      {/* The app's "Dados importados": doctor only (the RPC refuses a
          secretary too), read and logged when opened. */}
      {!isSecretary && patient.import_id && <ImportedData key={patient.id} patientId={patient.id} />}
    </div>
  );
}
