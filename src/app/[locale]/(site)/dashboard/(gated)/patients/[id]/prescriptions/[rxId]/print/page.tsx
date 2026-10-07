import { notFound, redirect } from "next/navigation";
import { readLocationLines } from "@/lib/locationLines";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { isProfessionalRole } from "@/lib/effectiveProfId";
import { lookupPracticeCountry } from "@/lib/practiceCountry";
import { PRINT_CSS, docDate, toDocTemplate } from "@/lib/prescriptionDoc";
import { liveFeatures } from "@/lib/liveFeatures";
import { brandedDocTemplate, docBrand, loadPracticeBrand } from "@/lib/brand";
import { PrescriptionDocument } from "./PrescriptionDocument";
import { AccessLogFailed, logAccesses } from "@/components/printAccess";
import { PrintToolbar } from "@/components/PrintToolbar";
import { conditionMet } from "@/lib/conditions";
import { ADDRESS_FIELDS, addressLine, type AddressColumns } from "@/lib/patientAddress";
import { patientIdKind } from "@/lib/patientIds";

// The prescription's print view (Help P6 on the website): the same layout
// as the app's PDF; "Imprimir / Salvar PDF" opens the print window, where
// "Salvar como PDF" gives the file. Doctor only (clinical data), and only
// this practice's patient's prescription.

export default async function PrescriptionPrintPage({
  params,
}: {
  params: Promise<{ locale: string; id: string; rxId: string }>;
}) {
  const { locale, id, rxId } = await params;
  const prefix = locale === "en" ? "" : `/${locale}`;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`${prefix}/auth/login`);
  if ((await isProfessionalRole(supabase, user.id)) !== true) notFound();

  const [patientResult, rxResult, correctionResult, profResult, templateResult, t] = await Promise.all([
    // The address columns only exist once 138 is applied.
    supabase.from("patients").select(conditionMet("patient-address-live") ? `id, full_name, ${ADDRESS_FIELDS.map((f) => f.name).join(", ")}` : "id, full_name").eq("id", id).eq("professional_id", user.id).maybeSingle(),
    supabase.from("prescriptions").select("id, date, notes, prescription_items(name, dosage, frequency, duration)").eq("id", rxId).eq("patient_id", id).maybeSingle(),
    // Replaced by a later correction (097): marked "(corrigido)", like the app.
    supabase.from("prescriptions").select("id").eq("corrects_id", rxId).limit(1),
    supabase.from("professionals").select("full_name, professional_registration").eq("id", user.id).maybeSingle(),
    supabase.from("document_templates").select("primary_color, accent_color, logo_url, header_text, footer_text").eq("professional_id", user.id).eq("document_type", "prescription").maybeSingle(),
    getTranslations({ locale, namespace: "prescriptionDoc" }),
  ]);
  const patient = patientResult.data as unknown as ({ id: string; full_name: string } & AddressColumns) | null;
  const rx = rxResult.data as { id: string; date: string; notes: string | null; prescription_items: { name: string; dosage: string; frequency: string; duration: string }[] | null } | null;
  if (!patient || !rx) notFound();

  // The date in the practice country's format (TH: Buddhist era). Unknown
  // country: an error, never a guessed calendar (7f). Checked before the
  // log, so a failed page records no access.
  const lookup = await lookupPracticeCountry(supabase, user.id, user.id);
  if (!lookup.ok) return <AccessLogFailed backHref={`${prefix}/dashboard/patients/${patient.id}`} text={t("countryFailed")} backLabel={t("back")} />;
  const country = lookup.country;

  // The access log (migration 111). Fail closed (UX 36): no print unless
  // the access was recorded.
  if (!(await logAccesses(supabase, patient.id, [{ kind: "prescription", ref: rx.id }]))) {
    return <AccessLogFailed backHref={`${prefix}/dashboard/patients/${patient.id}`} text={t("accessLogFailed")} backLabel={t("back")} />;
  }

  const prof = profResult.data as { full_name: string | null; professional_registration: string | null } | null;
  // The doctor's brand (1.5.0, behind the flag): the colour, logo and
  // header block, as the app's PDF; the signature stays the legal identity.
  const brand = liveFeatures.myBrand ? await loadPracticeBrand(supabase, user.id) : null;
  const baseTemplate = toDocTemplate(templateResult.data as Record<string, unknown> | null);

  return (
    // A light scope: the print view stays light in the dashboard's dark
    // theme, on screen and in the PDF (Help C8).
    <div data-theme="light" className="min-h-screen bg-slate-50 px-4 py-8">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <PrintToolbar backHref={`${prefix}/dashboard/patients/${patient.id}`} />
      <div className="mx-auto max-w-[680px] shadow-sm ring-1 ring-slate-100">
        <PrescriptionDocument
          template={{ ...brandedDocTemplate(baseTemplate, brand), locationLines: await readLocationLines(supabase, user.id) }}
          brand={docBrand(baseTemplate, brand)}
          labels={{
            title: t("title"), patient: t("patient"), date: t("date"), medications: t("medications"),
            medication: t("medication"), dosage: t("dosage"), frequency: t("frequency"), duration: t("duration"),
            notes: t("notes"), footer: t("footer"), corrected: t("corrected"),
          }}
          patientName={patient.full_name}
          patientAddress={addressLine(patient, patientIdKind(country))}
          date={docDate(country, rx.date)}
          corrected={(correctionResult.data ?? []).length > 0}
          items={rx.prescription_items ?? []}
          notes={rx.notes?.trim() ? rx.notes : null}
          signerName={prof?.full_name ?? ""}
          signerRegistration={prof?.professional_registration?.trim() ? prof.professional_registration : null}
        />
      </div>
    </div>
  );
}
