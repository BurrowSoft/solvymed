import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ProfileForm, ClinicForm, WorkingHoursForm, ProceduresPanel, SchedulingRulesForm, BlockedPatientsPanel, InviteCodeCard } from "./SettingsClient";
import { TeamPanel, type TeamRow } from "./TeamPanel";
import { SecretarySettings } from "./SecretarySettings";
import { CloseAccountPanel, type ClosurePreview } from "./CloseAccountPanel";

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

  const { data: userRoleData } = await supabase
    .from("user_roles")
    .select("role, invited_by_professional_id")
    .eq("user_id", user.id)
    .maybeSingle();

  // Close/delete account (migration 100). No panel if the preview can't
  // load: the page must never offer an action it can't describe.
  const { data: previewRows } = await supabase.rpc("get_account_closure_preview");
  const closurePreview = (Array.isArray(previewRows) ? previewRows[0] : previewRows) as ClosurePreview | undefined;

  // A secretary gets their own view: the doctor's practice read-only via
  // RPCs, never the editable forms below (which would write under the
  // secretary's own id, and whose actions refuse them anyway).
  if (userRoleData?.role === "secretary" && userRoleData.invited_by_professional_id) {
    return (
      <div className="p-6 lg:p-8 max-w-3xl">
        <div className="mb-8">
          <h1 className="text-2xl font-extrabold text-slate-900">{t("pageTitle")}</h1>
        </div>
        <SecretarySettings supabase={supabase} doctorId={userRoleData.invited_by_professional_id as string} locale={locale} />
        {closurePreview && (
          <div className="mt-6">
            <CloseAccountPanel preview={closurePreview} locale={locale} />
          </div>
        )}
      </div>
    );
  }

  const [profResult, procsResult, blockedResult, teamResult] = await Promise.all([
    supabase
      .from("professionals")
      .select("full_name, specialty, clinic_name, clinic_cnpj, clinic_phone, clinic_website, clinic_address, clinic_city, clinic_state, pix_key, working_hours, max_concurrent_bookings, public_invite_code")
      .eq("id", user.id)
      .maybeSingle(),
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
      .is("archived_at", null)
      .order("full_name"),
    supabase.rpc("list_my_team"),
  ]);

  // A failed load must not fall through to the blank defaults below: the
  // forms would render empty and saving one overwrites the real row. Only a
  // missing row (new professional, data null with no error) gets defaults.
  if (profResult.error) {
    return (
      <div className="p-6 lg:p-8 max-w-3xl">
        <h1 className="text-2xl font-extrabold text-slate-900">{t("pageTitle")}</h1>
        <div className="error-banner mt-6">{t("loadError")}</div>
      </div>
    );
  }

  const prof = profResult.data ?? {
    full_name: "", specialty: null,
    clinic_name: null, clinic_cnpj: null, clinic_phone: null,
    clinic_website: null, clinic_address: null, clinic_city: null, clinic_state: null,
    pix_key: null, working_hours: null, max_concurrent_bookings: null, public_invite_code: null,
  };

  const procedures = (procsResult.data ?? []) as {
    id: string; name: string; duration_minutes: number; price?: number; payment_type: string; active: boolean;
  }[];
  const blockedPatients = (blockedResult.data ?? []) as {
    id: string; full_name: string; email?: string; phone?: string;
  }[];
  const teamRows = (Array.isArray(teamResult.data) ? teamResult.data : []) as TeamRow[];

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

        <InviteCodeCard code={(prof as { public_invite_code?: string | null }).public_invite_code ?? undefined} />

        <TeamPanel rows={teamRows} loadFailed={!!teamResult.error} />

        <ClinicForm
          data={{
            clinic_name: prof.clinic_name ?? undefined,
            clinic_cnpj: prof.clinic_cnpj ?? undefined,
            clinic_phone: prof.clinic_phone ?? undefined,
            clinic_website: prof.clinic_website ?? undefined,
            clinic_address: prof.clinic_address ?? undefined,
            clinic_city: prof.clinic_city ?? undefined,
            clinic_state: prof.clinic_state ?? undefined,
            pix_key: (prof as { pix_key?: string | null }).pix_key ?? undefined,
          }}
        />

        <WorkingHoursForm workingHours={prof.working_hours as WorkingHours | null} />

        <SchedulingRulesForm maxConcurrent={(prof.max_concurrent_bookings as number | null) ?? null} />

        <BlockedPatientsPanel patients={blockedPatients} locale={locale} />

        <ProceduresPanel procedures={procedures} />

        {closurePreview && <CloseAccountPanel preview={closurePreview} locale={locale} />}
      </div>
    </div>
  );
}
