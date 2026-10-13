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

// Document Studio (PR3): the doctor's editor for their practice's design,
// with a live preview. Its own page (02, 10-13), opened from My brand;
// doctors only, and nothing until Studio is live (studioEnabled).
export default async function StudioPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!studioEnabled() || !liveFeatures.myBrand) notFound();
  const t = await getTranslations({ locale, namespace: "studio" });
  const tSettings = await getTranslations({ locale, namespace: "settings" });
  const supabase = await createClient({ acting: false });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale === "en" ? "" : locale + "/"}auth/login`);
  const prefix = locale === "en" ? "" : `/${locale}`;
  if ((await isProfessionalRole(supabase, user.id)) !== true) redirect(`${prefix}/dashboard/settings`);

  const [{ data, error }, prof, brand, locations, country] = await Promise.all([
    supabase.rpc("get_practice_design"),
    supabase.from("professionals").select("full_name, specialty, professional_registration, clinic_name").eq("id", user.id).maybeSingle(),
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
  const p = prof.data as { full_name?: string | null; specialty?: string | null; professional_registration?: string | null; clinic_name?: string | null } | null;

  // The texts the editor offers: the prescription and this country's
  // designable documents (country config); other types' stored texts are
  // kept as they are.
  const textTypes = ["prescription" as const, ...documentTypesFor(country).map(designDocType).filter((x) => x !== null)];

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
    />
  );
}
