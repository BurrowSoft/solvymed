import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ProfileForm, ClinicForm, WorkingHoursForm, ProceduresPanel, SchedulingRulesForm, BlockedPatientsPanel } from "./SettingsClient";

type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
type WorkingHours = Record<DayKey, { enabled: boolean; start: string; end: string }>;

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "settings" });
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale === "en" ? "" : locale + "/"}auth/login`);

  const [profResult, procsResult, blockedResult] = await Promise.all([
    supabase
      .from("professionals")
      .select("full_name, specialty, clinic_name, clinic_cnpj, clinic_phone, clinic_website, clinic_address, clinic_city, clinic_state, working_hours, max_concurrent_bookings")
      .eq("id", user.id)
      .single(),
    supabase
      .from("procedures")
      .select("id, name, duration_minutes, price, payment_type, active")
      .eq("professional_id", user.id)
      .order("active", { ascending: false })
      .order("name"),
    supabase
      .from("patients")
      .select("id, full_name, email, phone")
      .eq("professional_id", user.id)
      .eq("booking_blocked", true)
      .order("full_name"),
  ]);

  const prof = profResult.data ?? {
    full_name: "", specialty: null,
    clinic_name: null, clinic_cnpj: null, clinic_phone: null,
    clinic_website: null, clinic_address: null, clinic_city: null, clinic_state: null,
    working_hours: null, max_concurrent_bookings: null,
  };

  const procedures = (procsResult.data ?? []) as {
    id: string; name: string; duration_minutes: number; price?: number; payment_type: string; active: boolean;
  }[];
  const blockedPatients = (blockedResult.data ?? []) as {
    id: string; full_name: string; email?: string; phone?: string;
  }[];

  return (
    <div className="p-6 lg:p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-extrabold text-slate-900">{t("pageTitle")}</h1>
        <p className="text-sm text-slate-500 mt-0.5">{t("pageSubtitle")}</p>
      </div>

      <div className="space-y-6">
        <ProfileForm
          fullName={prof.full_name}
          specialty={prof.specialty ?? undefined}
        />

        <ClinicForm
          data={{
            clinic_name: prof.clinic_name ?? undefined,
            clinic_cnpj: prof.clinic_cnpj ?? undefined,
            clinic_phone: prof.clinic_phone ?? undefined,
            clinic_website: prof.clinic_website ?? undefined,
            clinic_address: prof.clinic_address ?? undefined,
            clinic_city: prof.clinic_city ?? undefined,
            clinic_state: prof.clinic_state ?? undefined,
          }}
        />

        <WorkingHoursForm workingHours={prof.working_hours as WorkingHours | null} />

        <SchedulingRulesForm maxConcurrent={(prof.max_concurrent_bookings as number | null) ?? null} />

        <BlockedPatientsPanel patients={blockedPatients} locale={locale} />

        <ProceduresPanel procedures={procedures} />
      </div>
    </div>
  );
}
