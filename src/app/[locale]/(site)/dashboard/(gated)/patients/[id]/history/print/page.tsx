import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { isProfessionalRole } from "@/lib/effectiveProfId";
import { PRINT_CSS, docDate, docTime, docToday, toDocTemplate } from "@/lib/prescriptionDoc";
import { lookupPracticeCountry } from "@/lib/practiceCountry";
import { countryProfile } from "@/lib/country";
import { getClinicTimeZone } from "@/lib/clinicTime";
import { PrintToolbar } from "@/components/PrintToolbar";
import { HistoryDocument } from "./HistoryDocument";
import { AccessLogFailed, logAccesses } from "@/components/printAccess";

// The patient's history print view (Help P8 on the website): the app's
// "export history" PDF as a print view; "Imprimir / Salvar PDF" opens the
// print window. Doctor only (clinical data), this practice's patient.

type Row = Record<string, unknown>;

export default async function HistoryPrintPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const prefix = locale === "en" ? "" : `/${locale}`;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`${prefix}/auth/login`);
  if ((await isProfessionalRole(supabase, user.id)) !== true) notFound();

  const [patientResult, recordsResult, rxResult, profResult, templateResult, t, tp, tIds] = await Promise.all([
    supabase.from("patients").select("*").eq("id", id).eq("professional_id", user.id).maybeSingle(),
    supabase.from("medical_records").select("id, date, time, content, corrects_id").eq("patient_id", id).order("date", { ascending: false }).order("time", { ascending: false }),
    supabase.from("prescriptions").select("id, date, notes, corrects_id, prescription_items(name, dosage, frequency, duration)").eq("patient_id", id).order("date", { ascending: false }),
    supabase.from("professionals").select("full_name, clinic_name, professional_registration").eq("id", user.id).maybeSingle(),
    supabase.from("document_templates").select("primary_color, accent_color, logo_url, header_text, footer_text").eq("professional_id", user.id).eq("document_type", "medical_record").maybeSingle(),
    getTranslations({ locale, namespace: "prescriptionDoc" }),
    getTranslations({ locale, namespace: "patientDetail" }),
    getTranslations({ locale, namespace: "patientIds" }),
  ]);
  const patient = patientResult.data as Row | null;
  if (!patient) notFound();
  // Never a partial history: a failed read is an error page, not a PDF
  // that silently leaves entries out.
  if (recordsResult.error || rxResult.error) throw new Error("history_load_failed");

  const records = (recordsResult.data ?? []) as { id: string; date: string; time: string | null; content: string; corrects_id: string | null }[];
  const rxs = (rxResult.data ?? []) as { id: string; date: string; notes: string | null; corrects_id: string | null; prescription_items: { name: string; dosage: string; frequency: string; duration: string }[] | null }[];

  // Dates in the practice country's format (TH: Buddhist era); labels in
  // the UI language. Unknown country: an error, never a guessed calendar
  // (7f). Checked before the log, so a failed page records no access.
  const lookup = await lookupPracticeCountry(supabase, user.id, user.id);
  if (!lookup.ok) return <AccessLogFailed backHref={`${prefix}/dashboard/patients/${id}`} text={t("countryFailed")} backLabel={t("back")} />;
  const country = lookup.country;

  // Every entry printed is logged as opened (111), like the app's export
  // (mobile #103): the patient, each record, each prescription. Fail
  // closed (UX 36): no print unless every access was recorded.
  const logged = await logAccesses(supabase, id, [
    { kind: "patient" },
    ...records.map((r) => ({ kind: "record", ref: r.id })),
    ...rxs.map((rx) => ({ kind: "prescription", ref: rx.id })),
  ]);
  if (!logged) return <AccessLogFailed backHref={`${prefix}/dashboard/patients/${id}`} text={t("accessLogFailed")} backLabel={t("back")} />;
  const correctedRecords = new Set(records.map((r) => r.corrects_id).filter(Boolean));
  const correctedRx = new Set(rxs.map((r) => r.corrects_id).filter(Boolean));

  // The patient's details: birth date + age, the practice country's IDs,
  // phone, sex.
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
  const lines: string[] = [];
  const birth = str(patient.birth_date);
  if (birth) {
    const age = Math.floor((Date.now() - new Date(birth).getTime()) / (365.25 * 24 * 3600 * 1000));
    lines.push(`${t("birthDate", { value: docDate(country, birth) })}${age >= 0 ? ` (${tp("age", { n: age })})` : ""}`);
  }
  // The practice country's ID fields (lib/country idFields), in order.
  for (const f of countryProfile(country).idFields) {
    const v = str(patient[f.name]);
    if (v) lines.push(`${tIds(f.label)}: ${v}`);
  }
  if (str(patient.phone)) lines.push(t("phone", { value: patient.phone as string }));
  const sex = str(patient.sex);
  if (sex) lines.push(sex === "male" || sex === "female" || sex === "other" ? tp(sex) : sex);

  const prof = profResult.data as { full_name: string | null; clinic_name: string | null; professional_registration: string | null } | null;
  const timeZone = await getClinicTimeZone(supabase, { professionalId: user.id, isSecretary: false });
  const today = docToday(country, timeZone);

  return (
    <div data-theme="light" className="min-h-screen bg-slate-50 px-4 py-8">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <PrintToolbar backHref={`${prefix}/dashboard/patients/${id}`} />
      <div className="mx-auto max-w-[680px] shadow-sm ring-1 ring-slate-100">
        <HistoryDocument
          template={toDocTemplate(templateResult.data as Row | null)}
          labels={{
            title: t("historyTitle"), medicalRecords: t("medicalRecords"), prescriptions: t("prescriptions"),
            noRecords: t("noRecords"), noPrescriptions: t("noPrescriptions"),
            medication: t("medication"), dosage: t("dosage"), frequency: t("frequency"), duration: t("duration"),
            corrected: t("corrected"), footer: t("footer"),
            exportedBy: t("exportedBy", { name: [prof?.full_name, prof?.clinic_name].filter(Boolean).join(" · "), date: today }),
          }}
          patientName={patient.full_name as string}
          detailLines={lines}
          records={records.map((r) => ({
            id: r.id, date: docDate(country, r.date), time: docTime(r.time),
            content: r.content, corrected: correctedRecords.has(r.id),
          }))}
          prescriptions={rxs.map((rx) => ({
            id: rx.id, date: docDate(country, rx.date), notes: rx.notes?.trim() ? rx.notes : null,
            corrected: correctedRx.has(rx.id), items: rx.prescription_items ?? [],
          }))}
          signerName={prof?.full_name ?? ""}
          signerRegistration={prof?.professional_registration?.trim() ? prof.professional_registration : null}
        />
      </div>
    </div>
  );
}
