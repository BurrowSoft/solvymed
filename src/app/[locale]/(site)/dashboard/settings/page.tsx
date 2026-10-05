import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card, ProfileForm, ClinicForm, WorkingHoursForm, ProceduresPanel, SchedulingRulesForm, BlockedPatientsPanel, InviteCodeCard } from "./SettingsClient";
import { TeamPanel, type TeamRow } from "./TeamPanel";
import { SecretarySettings } from "./SecretarySettings";
import { NotifyPrefsCard, type NotifyPref } from "./NotifyPrefsCard";
import { ShowSetupRow } from "./ShowSetupRow";
import { NewsSettingsCard, TourSettingsCard } from "@/components/tour/TourProvider";
import { liveFeatures } from "@/lib/liveFeatures";
import { actingPracticeFor, myPractices } from "@/lib/effectiveProfId";
import { doctorColors } from "@/lib/doctorPalette";
import { conditionMet } from "@/lib/conditions";
import { SolvyAiSettingsCard } from "@/components/solvyai/SolvyAiSettings";
import { CookieSettingsButton } from "@/components/CookieSettingsButton";
import { countryProfile, messagingChannel } from "@/lib/country";
import { getPracticeCountry } from "@/lib/practiceCountry";
import { getSetupProgress } from "@/lib/setup";
import { CloseAccountPanel, type ClosurePreview } from "./CloseAccountPanel";
import { ChangePasswordPanel } from "./ChangePasswordPanel";
import { ExportPatientsCard } from "./ExportPatientsCard";
import { AppearanceCard } from "./AppearanceCard";
import { SubscriptionPanel } from "./SubscriptionPanel";
import { FoundersCard } from "./FoundersCard";
import { BrandCard } from "./BrandCard";
import { loadPracticeBrand, type BrandFieldsRow } from "@/lib/brand";
import { isAccessAllowed, planSummary, type EffectiveSub } from "@/lib/subscription";

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

  // Programa Fundadores (stage 2, migration 132): the card only for an
  // accepted founder with uploads allowed (founder_upload_check, as the
  // doctor); nothing when the function is missing, the page isn't live or
  // uploads aren't (founders-upload-live: 132 + the purge deployed).
  let founder: { uploadsLeft: number } | null = null;
  if (liveFeatures.founders && conditionMet("founders-upload-live") && userRoleData?.role !== "secretary") {
    const { data: fc, error: fcError } = await supabase.rpc("founder_upload_check");
    const row = (Array.isArray(fc) ? fc[0] : fc) as { allowed?: boolean; uploads_left?: number } | null;
    if (!fcError && row?.allowed === true) founder = { uploadsLeft: Number(row.uploads_left ?? 0) };
  }

  // Close/delete account (migration 102). No panel if the preview can't
  // load: the page must never offer an action it can't describe.
  const { data: previewRows } = await supabase.rpc("get_account_closure_preview");
  const closurePreview = (Array.isArray(previewRows) ? previewRows[0] : previewRows) as ClosurePreview | undefined;

  // A secretary gets their own view: the doctor's practice read-only via
  // RPCs, never the editable forms below (which would write under the
  // secretary's own id, and whose actions refuse them anyway).
  if (userRoleData?.role === "secretary" && userRoleData.invited_by_professional_id) {
    // 166 (behind the flag): her notifications per doctor, read without the
    // acting header (they span every doctor she serves). null on an error.
    let notifyPrefs: NotifyPref[] | null = null;
    // Each doctor's colour, as on the Agenda's "Todos" (by her list's order).
    let notifyColors: Record<string, string> = {};
    if (liveFeatures.multiPractice) {
      const plain = await createClient({ acting: false });
      const [{ data, error }, practices] = await Promise.all([plain.rpc("get_secretary_notify_prefs"), myPractices(user.id)]);
      notifyPrefs = error ? null : ((data ?? []) as NotifyPref[]);
      notifyColors = Object.fromEntries(doctorColors((practices ?? []).map((p) => p.professional_id)));
    }
    return (
      <div className="p-6 lg:p-8 max-w-3xl">
        <div className="mb-8">
          <h1 className="text-2xl font-extrabold text-slate-900">{t("pageTitle")}</h1>
        </div>
        {/* The doctor she's acting for (the switcher, 1.5.0), else her primary. */}
        <SecretarySettings supabase={supabase} doctorId={(await actingPracticeFor(userRoleData.invited_by_professional_id as string, user.id)) ?? (userRoleData.invited_by_professional_id as string)} locale={locale} />
        {/* 166: notifications per doctor, once she serves 2+ (a single
            doctor has nothing to choose between). */}
        {notifyPrefs && notifyPrefs.length > 1 && (
          <div className="mt-6">
            <NotifyPrefsCard prefs={notifyPrefs} colors={notifyColors} />
          </div>
        )}
        <div className="mt-6">
          <AppearanceCard />
        </div>
        <div className="mt-6">
          <TourSettingsCard />
        </div>
        {liveFeatures.news && (
          <div className="mt-6">
            <NewsSettingsCard />
          </div>
        )}
        {user.email && (
          <div className="mt-6">
            <ChangePasswordPanel email={user.email} locale={locale} />
          </div>
        )}
        {closurePreview && (
          <div className="mt-6">
            <CloseAccountPanel preview={closurePreview} locale={locale} />
          </div>
        )}
      </div>
    );
  }

  const [profResult, procsResult, blockedResult, teamResult, subResult] = await Promise.all([
    supabase
      .from("professionals")
      .select("full_name, specialty, professional_registration, clinic_name, clinic_cnpj, clinic_phone, clinic_website, clinic_address, clinic_city, clinic_state, pix_key, working_hours, max_concurrent_bookings, public_invite_code, subscription_provider, subscription_id")
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
    supabase.rpc("get_effective_subscription", { p_user_id: user.id }),
  ]);
  // Settings → Assinatura: no card if the plan can't be read. The portal
  // button only for a Stripe subscription (the route re-checks all of it).
  const effSub = subResult.error ? null : ((subResult.data?.[0] ?? null) as EffectiveSub | null);
  const plan = subResult.error ? null : planSummary(effSub);
  // Locked (the paywall's rule): Settings stays open, but no patient invite
  // code/link: new patients shouldn't join a practice that can't see them (UX).
  const locked = !!effSub && !isAccessAllowed(effSub);
  const profBilling = profResult.data as { subscription_provider?: string | null; subscription_id?: string | null } | null;
  const canManageBilling = profBilling?.subscription_provider === "stripe" && !!profBilling.subscription_id;
  // "Show setup checklist": only when the doctor hid it before finishing.
  const setupProgress = await getSetupProgress(supabase);
  const offerShowSetup = !!setupProgress && setupProgress.setup_hidden && !setupProgress.completed_ack && setupProgress.done_count < 6;

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
    full_name: "", specialty: null, professional_registration: null,
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

  // The practice country: what it decides (currency, payment QR), and its
  // name in the page's language ('ZZ' = unknown).
  const practiceCountry = await getPracticeCountry(supabase, user.id, user.id);
  const practiceProfile = countryProfile(practiceCountry);
  let countryName = t("practiceCountryOther");
  if (practiceCountry !== "ZZ") {
    try {
      countryName = new Intl.DisplayNames([locale], { type: "region" }).of(practiceCountry) ?? practiceCountry;
    } catch {
      countryName = practiceCountry;
    }
  }
  // The PromptPay ID (Thai practices; the column is from migration 110, so
  // it's only read for them). If it can't be read, the field is left out:
  // an empty field would clear the stored ID on the next save.
  const promptPayResult = practiceProfile.paymentQr === "promptpay"
    ? await supabase.from("professionals").select("promptpay_id").eq("id", user.id).maybeSingle()
    : null;
  const showPromptPay = !!promptPayResult && !promptPayResult.error;
  // The clinic tax ID (Thai practices; migration 112), read the same way.
  const taxIdResult = practiceProfile.clinicTaxId === "th_tax_id"
    ? await supabase.from("professionals").select("clinic_tax_id").eq("id", user.id).maybeSingle()
    : null;
  const showTaxId = !!taxIdResult && !taxIdResult.error;
  // 1.5.0 "My brand" (flag; Previews only until the release). null while
  // migration 161 isn't there: the card opens empty with the defaults.
  const brand = liveFeatures.myBrand ? await loadPracticeBrand(supabase, user.id) : null;
  // The fields' own values: the raw row (the owner may read it), never the
  // RPC's profile fallbacks, or a first Save would copy the profile into the
  // brand (d7, 9a; as the app). No row = empty fields.
  // A read error is kept apart from "no row": the card then can't save,
  // or it would write empty fields over the saved ones (9a).
  const brandRowResult = liveFeatures.myBrand
    ? await supabase.from("professional_brand").select("display_name, title, specialty, registration_line, accent_color").eq("professional_id", user.id).maybeSingle()
    : null;
  const brandRow = (brandRowResult?.data ?? null) as BrandFieldsRow | null;
  const brandRowFailed = !!brandRowResult?.error;

  return (
    <div className="p-6 lg:p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-extrabold text-slate-900">{t("pageTitle")}</h1>
        <p className="text-sm text-slate-500 mt-0.5">{t("pageSubtitle")}</p>
      </div>

      <div className="space-y-6">
        {offerShowSetup && <ShowSetupRow />}

        <AppearanceCard />
        <TourSettingsCard />
        {liveFeatures.news && <NewsSettingsCard />}
        {liveFeatures.solvyAi && <SolvyAiSettingsCard prefix={locale === "en" ? "" : `/${locale}`} />}
        {founder && <FoundersCard uploadsLeft={founder.uploadsLeft} bookingUrl={process.env.NEXT_PUBLIC_FOUNDERS_BOOKING_URL || undefined} />}

        <ProfileForm
          fullName={prof.full_name}
          specialty={prof.specialty ?? undefined}
          registration={(prof as { professional_registration?: string | null }).professional_registration ?? undefined}
          country={practiceCountry}
        />

        {liveFeatures.myBrand && (
          <BrandCard
            uid={user.id}
            brand={brand}
            values={brandRow}
            valuesFailed={brandRowFailed}
            country={practiceCountry}
            fallback={{
              fullName: prof.full_name ?? "",
              specialty: prof.specialty ?? "",
              registration: (prof as { professional_registration?: string | null }).professional_registration ?? "",
            }}
          />
        )}

        {!locked && <InviteCodeCard code={(prof as { public_invite_code?: string | null }).public_invite_code ?? undefined} country={practiceCountry} />}

        <TeamPanel rows={teamRows} loadFailed={!!teamResult.error} country={practiceCountry} whatsapp={messagingChannel(practiceProfile) === "whatsapp"} />

        {/* The practice country (set at signup, support-only to change). */}
        <Card title={t("practiceCountry")}>
          <p className="text-sm font-semibold text-slate-900">{countryName}</p>
          <p className="mt-1 text-xs text-slate-500">{t("practiceCountryHint")}</p>
        </Card>

        <ClinicForm
          country={practiceCountry}
          showPix={practiceProfile.paymentQr === "pix"}
          showPromptPay={showPromptPay}
          showTaxId={showTaxId}
          data={{
            clinic_name: prof.clinic_name ?? undefined,
            clinic_cnpj: prof.clinic_cnpj ?? undefined,
            clinic_phone: prof.clinic_phone ?? undefined,
            clinic_website: prof.clinic_website ?? undefined,
            clinic_address: prof.clinic_address ?? undefined,
            clinic_city: prof.clinic_city ?? undefined,
            clinic_state: prof.clinic_state ?? undefined,
            pix_key: (prof as { pix_key?: string | null }).pix_key ?? undefined,
            clinic_tax_id: (taxIdResult?.data as { clinic_tax_id?: string | null } | null)?.clinic_tax_id ?? undefined,
            promptpay_id: (promptPayResult?.data as { promptpay_id?: string | null } | null)?.promptpay_id ?? undefined,
          }}
        />

        <WorkingHoursForm workingHours={prof.working_hours as WorkingHours | null} />

        <SchedulingRulesForm maxConcurrent={(prof.max_concurrent_bookings as number | null) ?? null} />

        <BlockedPatientsPanel patients={blockedPatients} locale={locale} />

        <ProceduresPanel procedures={procedures} currency={practiceProfile.currency} />

        {/* Help P10: live once migration 126 (the export access log) is. */}
        {conditionMet("migration-126") && <ExportPatientsCard locale={locale} />}

        <CookieSettingsButton className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-3 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50" />

        {plan && <SubscriptionPanel plan={plan} canManage={canManageBilling} locale={locale} />}

        {user.email && <ChangePasswordPanel email={user.email} locale={locale} />}

        {closurePreview && <CloseAccountPanel preview={closurePreview} locale={locale} />}
      </div>
    </div>
  );
}
