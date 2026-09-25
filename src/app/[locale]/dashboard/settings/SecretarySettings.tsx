import { getTranslations } from "next-intl/server";
import type { createClient } from "@/lib/supabase/server";
import { Card, InviteCodeCard, BlockedPatientsPanel } from "./SettingsClient";
import { LeaveClinicButton } from "./LeaveClinicButton";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type MyClinic = {
  professional_id: string;
  professional_name: string | null;
  clinic_name: string | null;
  public_invite_code: string | null;
};
type DayHours = { enabled: boolean; start: string; end: string };
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

// Settings for a linked secretary: the doctor's practice read-only (a
// secretary never reads the professionals row directly, only through
// RPCs), plus what they're allowed to do here: share or regenerate the
// doctor's patient invite code, unblock patients, and leave the clinic.
export async function SecretarySettings({ supabase, doctorId, locale }: { supabase: Supabase; doctorId: string; locale: string }) {
  const [t, ts] = await Promise.all([
    getTranslations({ locale, namespace: "secretary" }),
    getTranslations({ locale, namespace: "settings" }),
  ]);

  const [clinicResult, hoursResult, procsResult, blockedResult] = await Promise.all([
    supabase.rpc("get_my_clinic"),
    supabase.rpc("get_professional_working_hours", { p_professional_id: doctorId }),
    supabase.rpc("get_professional_procedures", { p_professional_id: doctorId }),
    supabase
      .from("patients")
      .select("id, full_name, email, phone")
      .eq("professional_id", doctorId)
      .eq("booking_blocked", true)
      .order("full_name"),
  ]);

  const clinic = (Array.isArray(clinicResult.data) ? clinicResult.data[0] : null) as MyClinic | null;
  const hours = (hoursResult.data ?? null) as Record<string, DayHours> | null;
  const procedures = ((procsResult.data ?? []) as { id: string; name: string; duration_minutes: number; price: number | null }[]);
  const blocked = (blockedResult.data ?? []) as { id: string; full_name: string; email?: string; phone?: string }[];
  const doctorName = clinic?.professional_name ?? null;

  return (
    <div className="space-y-6">
      <Card title={t("yourClinicTitle")}>
        {clinic ? (
          <p className="text-sm text-slate-700">
            {clinic.clinic_name
              ? t("worksFor", { name: doctorName ?? "", clinic: clinic.clinic_name })
              : t("worksForNoClinic", { name: doctorName ?? "" })}
          </p>
        ) : (
          <div className="error-banner">{t("clinicLoadError")}</div>
        )}
      </Card>

      {clinic && <InviteCodeCard code={clinic.public_invite_code ?? undefined} />}

      <Card title={ts("hoursTitle")} description={t("readOnlyNote")}>
        {hours ? (
          <ul className="space-y-1.5 text-sm">
            {DAYS.map((d) => (
              <li key={d} className="flex justify-between text-slate-700">
                <span className="font-medium">{ts(d)}</span>
                <span className="text-slate-500">{hours[d]?.enabled ? `${hours[d].start} – ${hours[d].end}` : t("closed")}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">{t("notSet")}</p>
        )}
      </Card>

      <Card title={ts("proceduresTitle")} description={t("readOnlyNote")}>
        {procedures.length > 0 ? (
          <ul className="divide-y divide-slate-100 text-sm">
            {procedures.map((p) => (
              <li key={p.id} className="flex justify-between py-2 text-slate-700">
                <span className="font-medium">{p.name}</span>
                <span className="text-slate-500">
                  {p.duration_minutes} min{p.price != null ? ` · ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(p.price))}` : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">{ts("noProcedures")}</p>
        )}
      </Card>

      <BlockedPatientsPanel patients={blocked} locale={locale} />

      <Card title={t("leaveTitle")} description={t("leaveSub")}>
        <LeaveClinicButton doctorName={doctorName} locale={locale} />
      </Card>
    </div>
  );
}
