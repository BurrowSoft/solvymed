import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isProfessionalRole } from "@/lib/effectiveProfId";
import { getPracticeCountry } from "@/lib/practiceCountry";
import { conditionMet } from "@/lib/conditions";
import { patientsCsv, type CsvPatient } from "@/lib/patientsCsv";
import { routing } from "@/i18n/routing";
import { getTranslations } from "next-intl/server";

// The patient list as CSV (Help P10): doctor only, every patient (active
// and archived). Fail closed (UX 36): each exported patient's access log
// gets an "Exportado na lista de pacientes (CSV)" row first (migration
// 126, log_record_access_batch, all-or-nothing); if that fails, there is
// no file. Off until 126 is applied (the migration-126 condition).

const PAGE = 1000;
const LOG_CHUNK = 5000;

export async function GET(request: NextRequest) {
  if (!conditionMet("migration-126")) return NextResponse.json({ code: "not_found" }, { status: 404 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ code: "unauthorized" }, { status: 401 });
  if ((await isProfessionalRole(supabase, user.id)) !== true) return NextResponse.json({ code: "not_doctor" }, { status: 403 });

  const requested = request.nextUrl.searchParams.get("locale") ?? "";
  const locale = (routing.locales as readonly string[]).includes(requested) ? requested : routing.defaultLocale;

  // Every patient, a page at a time (PostgREST caps a response).
  const patients: (CsvPatient & { id: string })[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("patients")
      .select("*")
      .eq("professional_id", user.id)
      .order("full_name")
      .range(from, from + PAGE - 1);
    if (error) return NextResponse.json({ code: "generic" }, { status: 500 });
    patients.push(...((data ?? []) as (CsvPatient & { id: string })[]));
    if (!data || data.length < PAGE) break;
  }

  for (let i = 0; i < patients.length; i += LOG_CHUNK) {
    const ids = patients.slice(i, i + LOG_CHUNK).map((p) => p.id);
    const { error } = await supabase.rpc("log_record_access_batch", { p_patient_ids: ids, p_kind: "export", p_object_ref: "csv" });
    if (error) return NextResponse.json({ code: "access_log_failed" }, { status: 503 });
  }

  const [t, tIds, tSet] = await Promise.all([
    getTranslations({ locale, namespace: "patientDetail" }),
    getTranslations({ locale, namespace: "patientIds" }),
    getTranslations({ locale, namespace: "settings" }),
  ]);
  const country = await getPracticeCountry(supabase, user.id, user.id);
  const csv = patientsCsv(patients, {
    fullName: t("fullName"), cpf: tIds("cpf"), thaiId: tIds("thaiId"), passport: country === "TH" ? tIds("passport") : tIds("passportOrId"),
    sex: t("sex"), birthDate: t("dateOfBirth"), phone: t("phone"), email: t("email"), profession: t("profession"),
    tags: tSet("csvTags"), archivedOn: tSet("csvArchivedOn"), male: t("male"), female: t("female"), other: t("other"),
  }, country, locale);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="solvymed-patients.csv"`,
      // Patient data: never cached anywhere.
      "Cache-Control": "no-store",
    },
  });
}
