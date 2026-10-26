import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { isProfessionalRole } from "@/lib/effectiveProfId";
import { getPracticeCountry } from "@/lib/practiceCountry";
import { countryProfile } from "@/lib/country";
import { patientChannelEnabled } from "@/lib/patientChannel/live";
import { EMPTY_RULES, fromStoredRules } from "@/lib/patientChannel/rules";
import { settingsFromRow, type PcFaqRow, type PcReasonRow } from "@/lib/patientChannel/channel";
import { serverFlag } from "@/lib/myDoctors";
import { liveFeatures } from "@/lib/liveFeatures";
import { loadPracticeBrand, publicFromPractice } from "@/lib/brand";
import { coverUrl } from "@/lib/patientChannel/cover";
import { pageLook } from "@/lib/patientChannel/pageLook";
import { PatientChannelSettings } from "./PatientChannelSettings";

// Patient Channel (specs/patient-contact-tech.md §6): the doctor's rules editor and "Test
// as a patient". Doctors only; dark (404) unless the patient_channel flag is on or the
// doctor is on 237's testers allowlist. The rules load with their version; Save goes
// through PUT /api/patient-channel/config (validated, versioned, open requests rescored).
export default async function PatientChannelSettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const prefix = locale === "en" ? "" : `/${locale}`;
  const supabase = await createClient({ acting: false });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`${prefix}/auth/login`);
  if (!(await patientChannelEnabled(supabase, user.id))) notFound();
  if ((await isProfessionalRole(supabase, user.id)) !== true) redirect(`${prefix}/dashboard/settings`);
  const [country, saved, settings, reasons, faq, coverOn, me, brandRow] = await Promise.all([
    getPracticeCountry(supabase, user.id, user.id),
    supabase.rpc("pc_get_rules"),
    supabase.from("pc_settings")
      .select("enabled, secretary_sees_all, sla_business_days, reading_hours, reading_note, welcome, page_bg, cover_path")
      .eq("professional_id", user.id).maybeSingle(),
    supabase.from("pc_reasons").select("id, title, subtitle, kind, options, destination, sort")
      .eq("professional_id", user.id).is("archived_at", null).order("sort").order("created_at"),
    supabase.from("pc_faq").select("id, question, answer, sort")
      .eq("professional_id", user.id).is("archived_at", null).order("sort").order("created_at"),
    // The cover upload (246) shows only while its switch is on (testers first).
    serverFlag(supabase, "pc_cover_upload"),
    // "Testar como paciente" shows the page as patients see it (01): the saved look.
    supabase.from("professionals").select("full_name, clinic_name, specialty").eq("id", user.id).maybeSingle(),
    liveFeatures.myBrand ? loadPracticeBrand(supabase, user.id) : Promise.resolve(null),
  ]);
  // A failed read must not open an empty editor (Save would replace the stored rules).
  if (saved.error || settings.error || reasons.error || faq.error) {
    const [t, tSettings] = await Promise.all([getTranslations({ locale, namespace: "patientChannel" }), getTranslations({ locale, namespace: "settings" })]);
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-3xl">
        <h1 className="text-2xl font-extrabold text-slate-900">{t("title")}</h1>
        <div className="error-banner mt-6">{tSettings("loadError")}</div>
      </div>
    );
  }
  const row = saved.data as { rules?: unknown; rulesVersion?: number } | null;
  const initialRules = row?.rules ? fromStoredRules(row.rules, country) : { ...EMPTY_RULES, country };
  const prof = me.data as { full_name?: string | null; clinic_name?: string | null; specialty?: string | null } | null;
  const brand = publicFromPractice(brandRow, { name: prof?.full_name ?? "", specialty: prof?.specialty ?? "" });
  const look = settings.data as { page_bg?: string | null; cover_path?: string | null } | null;
  const patientView = {
    doctorName: brand?.name || prof?.full_name?.trim() || "",
    practiceLine: [prof?.clinic_name, brand?.specialty || prof?.specialty].filter(Boolean).join(" · "),
    look: pageLook(look?.page_bg, { color: brand?.accentColor, logoUrl: brand?.logoUrl ?? null, coverUrl: coverUrl(supabase, look?.cover_path), coverAlt: prof?.clinic_name?.trim() || brand?.name || "" }),
  };

  return (
    <PatientChannelSettings
      initialRules={initialRules}
      initialVersion={row?.rulesVersion ?? 0}
      emergencyNumber={countryProfile(country).emergencyNumber}
      professionalId={user.id}
      channel={{
        settings: settingsFromRow(settings.data as Record<string, unknown> | null),
        reasons: ((reasons.data ?? []) as (Omit<PcReasonRow, "subtitle"> & { subtitle: string | null })[]).map((r) => ({ ...r, subtitle: r.subtitle ?? "" })),
        faq: (faq.data ?? []) as PcFaqRow[],
        cover: coverOn ? { path: ((settings.data as { cover_path?: string | null } | null)?.cover_path) ?? null } : null,
      }}
      brandHref={`${prefix}/dashboard/settings#brand`}
      patientView={patientView}
    />
  );
}
