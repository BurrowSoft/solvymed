import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { studioEnabled } from "@/lib/studio/live";
import { liveFeatures } from "@/lib/liveFeatures";
import { isProfessionalRole } from "@/lib/effectiveProfId";
import { getPracticeCountry } from "@/lib/practiceCountry";
import { loadPracticeBrand } from "@/lib/brand";
import { DEFAULT_DESIGN, validateDesign, type Design } from "@/lib/studio/design";
import { readStudioLocations, studioLogos, studioPractice, type DesignRow } from "@/lib/studio/forDocument";
import { documentTypesFor } from "@/lib/medicalDocuments";
import { designDocType } from "@/lib/studio/load";
import { StudioEditor } from "./StudioEditor";
import type { PosterDay } from "./StudioPosters";
import { isAccessAllowed, type EffectiveSub } from "@/lib/subscription";
import { withCountryHint } from "@/lib/signupCountry";
import { SITE } from "@/lib/colleagues";
import { signatureEnabled } from "@/lib/studio/signature";

// Document Studio (PR3): the doctor's editor for their practice's design,
// with a live preview. Its own page (02, 10-13), opened from My brand;
// doctors only, and nothing while the document_studio flag is off for
// the caller (studioEnabled).
export default async function StudioPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!liveFeatures.myBrand) notFound();
  const supabase = await createClient({ acting: false });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale === "en" ? "" : locale + "/"}auth/login`);
  if (!(await studioEnabled(supabase))) notFound();
  const t = await getTranslations({ locale, namespace: "studio" });
  const tSettings = await getTranslations({ locale, namespace: "settings" });
  const prefix = locale === "en" ? "" : `/${locale}`;
  if ((await isProfessionalRole(supabase, user.id)) !== true) redirect(`${prefix}/dashboard/settings`);

  const [{ data, error }, prof, brand, locations, country] = await Promise.all([
    supabase.rpc("get_practice_design"),
    supabase.from("professionals").select("full_name, specialty, professional_registration, clinic_name, working_hours, public_invite_code").eq("id", user.id).maybeSingle(),
    loadPracticeBrand(supabase, user.id),
    readStudioLocations(supabase, user.id),
    getPracticeCountry(supabase, user.id, user.id),
  ]);
  const row = (Array.isArray(data) ? data[0] : data) as (DesignRow & { version?: unknown }) | undefined;
  const stored = row && validateDesign(row.design).ok ? (row.design as Design) : null;
  // The editor can't open on a design it couldn't read (or a saved one this
  // client doesn't understand): saving would write over the stored one (as
  // My brand's valuesFailed).
  if (error || prof.error || (row?.saved === true && !stored)) {
    return (
      <div className="p-6 lg:p-8 max-w-3xl">
        <h1 className="text-2xl font-extrabold text-slate-900">{t("open")}</h1>
        <div className="error-banner mt-6">{tSettings("loadError")}</div>
      </div>
    );
  }
  const p = prof.data as { full_name?: string | null; specialty?: string | null; professional_registration?: string | null; clinic_name?: string | null; working_hours?: unknown; public_invite_code?: string | null } | null;

  // Posters (PR5): the week's hours (each day's location named when there
  // are 2+), and the public invite link for the booking poster's QR: none
  // without a code or while the practice is locked (02).
  const { data: clinicRows } = await supabase.from("clinics").select("id, name, is_primary").eq("professional_id", user.id);
  const clinics = (clinicRows ?? []) as { id: string; name: string; is_primary: boolean }[];
  const wh = (p?.working_hours ?? null) as Record<PosterDay["day"], { enabled?: boolean; start?: string; end?: string; location_id?: string | null }> | null;
  const posterHours: PosterDay[] | null = wh
    ? (["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const).map((day) => {
        const h = wh[day];
        const loc = clinics.length > 1 ? (clinics.find((c) => c.id === h?.location_id) ?? clinics.find((c) => c.is_primary))?.name ?? null : null;
        return { day, open: !!h?.enabled && !!h.start && !!h.end, start: h?.start ?? "", end: h?.end ?? "", location: loc };
      })
    : null;
  const { data: subRows, error: subError } = await supabase.rpc("get_effective_subscription", { p_user_id: user.id });
  const sub = subError ? null : ((subRows as EffectiveSub[] | null)?.[0] ?? null);
  const locked = !!sub && !isAccessAllowed(sub);
  const code = p?.public_invite_code?.trim();
  const inviteUrl = code && !locked ? withCountryHint(`${SITE}/join/${encodeURIComponent(code)}`, country) : null;

  // The texts the editor offers: the prescription, this country's
  // designable documents (country config) and the letterhead; other types'
  // stored texts are kept as they are.
  const textTypes = ["prescription" as const, ...documentTypesFor(country).map(designDocType).filter((x) => x !== null), "letterhead" as const];

  return (
    <StudioEditor
      initial={stored ?? structuredClone(DEFAULT_DESIGN)}
      saved={!!stored && row?.saved === true}
      version={Number(row?.version ?? 0)}
      country={country}
      practice={studioPractice(brand, { fullName: p?.full_name ?? "", specialty: p?.specialty, registration: p?.professional_registration, clinicName: p?.clinic_name }, locations)}
      logos={studioLogos(supabase, row?.assets, brand)}
      textTypes={[...new Set(textTypes)]}
      backHref={`${prefix}/dashboard/settings`}
      posterHours={posterHours}
      inviteUrl={inviteUrl}
      uid={user.id}
      signatureOn={await signatureEnabled(supabase)}
    />
  );
}
