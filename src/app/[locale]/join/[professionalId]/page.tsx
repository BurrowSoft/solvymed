import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import { AuthPageShell } from "@/components/AuthPageShell";

export default async function JoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; professionalId: string }>;
  searchParams: Promise<{ role?: string }>;
}) {
  const { locale, professionalId } = await params;
  const { role = "patient" } = await searchParams;
  const prefix = locale === "en" ? "" : `/${locale}`;

  const [supabase, t] = await Promise.all([
    createClient(),
    getTranslations("join"),
  ]);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(
      `${prefix}/auth/signup?join=${professionalId}&role=${role}`,
    );
  }

  // Verify professional exists. professionals.id is the professional's own
  // user id (matches every other query against this table) — this was the
  // only place using the nonexistent column "user_id", which meant every
  // visit here showed "not found" regardless of whether the professional
  // was real (found by web test).
  const { data: prof } = await supabase
    .from("professionals")
    .select("full_name, clinic_name")
    .eq("id", professionalId)
    .maybeSingle();

  if (!prof) {
    return (
      <AuthPageShell>
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-100 text-center">
          <p className="text-slate-600 font-semibold mb-2">{t("notFound")}</p>
          <p className="text-sm text-slate-400 mb-6">{t("notFoundDesc")}</p>
          <Link
            href={`${prefix}/`}
            className="text-teal-600 text-sm hover:underline"
          >
            {t("backToHome")}
          </Link>
        </div>
      </AuthPageShell>
    );
  }

  const clinicName = (prof.clinic_name as string | null) ?? (prof.full_name as string);

  // `role` is a raw URL query param here, not server-derived metadata — even
  // more directly attacker-controlled than user_metadata elsewhere. Refuse
  // to touch an existing role in either branch below, same principle as
  // api/auth/callback/route.ts and auth/confirm/page.tsx.
  const { data: existingRole, error: roleLookupError } = await supabase
    .from("user_roles")
    .select("role, linked_patient_id, invited_by_professional_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (roleLookupError) {
    // Fail closed — a lookup error must never be treated as "no existing
    // role", or it reopens the overwrite this guard exists to close.
    redirect(`${prefix}/dashboard`);
  }

  if (role === "secretary") {
    if (!existingRole?.role) {
      // The user_roles INSERT/UPDATE policies reject any client write that
      // sets invited_by_professional_id to a non-null value, from any page
      // — per mob dev, this means the secretary-join flow has never
      // actually worked (confirmed, not specific to this code). Surface
      // that instead of redirecting to /dashboard as if it succeeded.
      const { error: secretaryLinkError } = await supabase.from("user_roles").upsert(
        {
          user_id: user.id,
          role: "secretary",
          invited_by_professional_id: professionalId,
        },
        { onConflict: "user_id" },
      );
      if (secretaryLinkError) {
        return (
          <AuthPageShell>
            <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-100 text-center">
              <p className="text-slate-600 font-semibold mb-2">{t("linkFailed")}</p>
              <p className="text-sm text-slate-400 mb-6">{t("linkFailedDesc")}</p>
              <Link href={`${prefix}/`} className="text-teal-600 text-sm hover:underline">
                {t("backToHome")}
              </Link>
            </div>
          </AuthPageShell>
        );
      }
    }
    redirect(`${prefix}/dashboard`);
  }

  // Patient join. Without this check, a professional or secretary visiting
  // /join/{professionalId} with no explicit ?role= param (defaults to
  // "patient") would have their own account silently converted into a
  // patient tied to a different professional's practice — the previous
  // check here only guarded against re-linking an already-linked patient,
  // not against overwriting an unrelated existing role entirely.
  if (existingRole?.role === "professional" || existingRole?.role === "secretary") {
    redirect(`${prefix}/dashboard`);
  }

  // A pending patient (role: "patient", invited_by_professional_id set to
  // a DIFFERENT doctor, not yet linked_patient_id) falls through
  // "!linked_patient_id" the same as a role-less account — without this
  // check they'd be silently reassigned to whichever doctor's join link
  // they visit next, overwriting invited_by_professional_id. Match
  // invite-required/page.tsx's principle: never touch an existing role.
  if (existingRole?.role === "patient" && existingRole.invited_by_professional_id && !existingRole.linked_patient_id) {
    redirect(`${prefix}/auth/pending-confirmation`);
  }

  if (!existingRole?.linked_patient_id) {
    const { data: profile } = await supabase
      .from("patient_profiles")
      .select("full_name, email, phone, birth_date, cpf")
      .eq("user_id", user.id)
      .maybeSingle();

    const patientEmail =
      (profile?.email as string | null) ?? user.email ?? null;
    let linkedPatientId: string | null = null;
    let createdNewPatient = false;

    if (patientEmail) {
      const { data: existing } = await supabase
        .from("patients")
        .select("id")
        .eq("professional_id", professionalId)
        .eq("email", patientEmail)
        .maybeSingle();
      linkedPatientId = (existing?.id as string) ?? null;
    }

    if (!linkedPatientId) {
      const { data: newPatient } = await supabase
        .from("patients")
        .insert({
          full_name:
            (profile?.full_name as string | null) ??
            user.email?.split("@")[0] ??
            "Patient",
          professional_id: professionalId,
          email: patientEmail ?? undefined,
          phone: (profile?.phone as string | null) ?? undefined,
          birth_date: (profile?.birth_date as string | null) ?? undefined,
          cpf: (profile?.cpf as string | null) ?? undefined,
        })
        .select("id")
        .maybeSingle();
      linkedPatientId = (newPatient?.id as string) ?? null;
      createdNewPatient = linkedPatientId !== null;
    }

    if (linkedPatientId) {
      // Same policy as the secretary branch above rejects this too — it
      // also sets invited_by_professional_id to a non-null value.
      const { error: patientLinkError } = await supabase.from("user_roles").upsert(
        {
          user_id: user.id,
          role: "patient",
          linked_patient_id: linkedPatientId,
          invited_by_professional_id: professionalId,
        },
        { onConflict: "user_id" },
      );
      if (patientLinkError) {
        // Only clean up a patient row THIS attempt created — never touch an
        // existing one matched by email above.
        if (createdNewPatient) {
          await supabase.from("patients").delete().eq("id", linkedPatientId);
        }
        return (
          <AuthPageShell>
            <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-100 text-center">
              <p className="text-slate-600 font-semibold mb-2">{t("linkFailed")}</p>
              <p className="text-sm text-slate-400 mb-6">{t("linkFailedDesc")}</p>
              <Link href={`${prefix}/`} className="text-teal-600 text-sm hover:underline">
                {t("backToHome")}
              </Link>
            </div>
          </AuthPageShell>
        );
      }
    }
  }

  redirect(`${prefix}/my-appointments`);
}
