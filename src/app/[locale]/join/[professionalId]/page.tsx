import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";

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

  // Verify professional exists
  const { data: prof } = await supabase
    .from("professionals")
    .select("full_name, clinic_name")
    .eq("user_id", professionalId)
    .maybeSingle();

  if (!prof) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
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
      </div>
    );
  }

  const clinicName = (prof.clinic_name as string | null) ?? (prof.full_name as string);

  if (role === "secretary") {
    await supabase.from("user_roles").upsert(
      {
        user_id: user.id,
        role: "secretary",
        invited_by_professional_id: professionalId,
      },
      { onConflict: "user_id" },
    );
    redirect(`${prefix}/dashboard`);
  }

  // Patient join
  const { data: existingRole } = await supabase
    .from("user_roles")
    .select("linked_patient_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!existingRole?.linked_patient_id) {
    const { data: profile } = await supabase
      .from("patient_profiles")
      .select("full_name, email, phone, birth_date, cpf")
      .eq("user_id", user.id)
      .maybeSingle();

    const patientEmail =
      (profile?.email as string | null) ?? user.email ?? null;
    let linkedPatientId: string | null = null;

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
    }

    if (linkedPatientId) {
      await supabase.from("user_roles").upsert(
        {
          user_id: user.id,
          role: "patient",
          linked_patient_id: linkedPatientId,
          invited_by_professional_id: professionalId,
        },
        { onConflict: "user_id" },
      );
    }
  }

  redirect(`${prefix}/my-appointments`);
}
