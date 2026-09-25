import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import { AuthPageShell } from "@/components/AuthPageShell";

// Patient-only. Secretary linking has no equivalent RPC and has never
// actually worked in any flow (confirmed by mob dev) — don't invent one
// here; that's a separate, pending product decision.
export default async function JoinPage({
  params,
}: {
  params: Promise<{ locale: string; code: string }>;
}) {
  const { locale, code } = await params;
  const prefix = locale === "en" ? "" : `/${locale}`;

  const [supabase, t] = await Promise.all([
    createClient(),
    getTranslations("join"),
  ]);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Signup treats `join` the same as a manually-typed invite code (pre-
    // filled, role locked to patient) — no separate metadata shape.
    redirect(`${prefix}/auth/signup?join=${encodeURIComponent(code)}`);
  }

  // `role` is never read from a URL/query param here — only the persisted
  // user_roles row, same guard principle as api/auth/callback/route.ts and
  // auth/invite-required/page.tsx: never touch an existing role.
  const [{ data: existingRole, error: roleLookupError }, { data: professionalRow, error: professionalLookupError }] = await Promise.all([
    supabase.from("user_roles").select("role, linked_patient_id, invited_by_professional_id").eq("user_id", user.id).maybeSingle(),
    supabase.from("professionals").select("id").eq("id", user.id).maybeSingle(),
  ]);

  if (roleLookupError || professionalLookupError) {
    // Fail closed — a lookup error must never be treated as "no existing
    // role"/"no professionals row", or it reopens the overwrite this guard
    // exists to close.
    redirect(`${prefix}/dashboard`);
  }
  if (existingRole?.role === "professional" || existingRole?.role === "secretary") {
    redirect(`${prefix}/dashboard`);
  }
  // A role-less account can still own a professionals row (e.g. signup
  // completed but role setup never finished) — user_roles.role alone can't
  // tell them apart from a genuinely pending patient. Same second signal
  // auth/invite-required/page.tsx uses: without it, this account could fall
  // through to the RPC below and get linked as a patient.
  if (!existingRole?.role && professionalRow) {
    redirect(`${prefix}/dashboard`);
  }
  if (existingRole?.role === "patient" && existingRole.linked_patient_id) {
    redirect(`${prefix}/my-appointments`);
  }
  if (existingRole?.role === "patient" && existingRole.invited_by_professional_id) {
    redirect(`${prefix}/auth/pending-confirmation`);
  }
  // Any other persisted role — including "patient" with neither link field
  // set, an already-provisioned but unlinked account — must never reach the
  // RPC below. Matches api/auth/callback/route.ts and auth/confirm/page.tsx:
  // a persisted role, once set, is never attached to a new doctor here.
  if (existingRole?.role) {
    redirect(`${prefix}/dashboard`);
  }

  // Same RPC the manual invite-code form (auth/invite-required) and the
  // signup callback use — it owns the professionals lookup, the user_roles
  // write, and the invited-by-another-doctor guard server-side. No direct
  // `professionals` read here: a patient session can't read that table
  // under RLS, and the RPC is the only thing that needs to resolve the code.
  const { data: profId, error: linkError } = await supabase.rpc(
    "link_by_professional_public_code",
    { p_public_code: code },
  );

  if (linkError || !profId) {
    const msg = linkError?.message ?? "";
    const heading = !linkError ? t("notFound") : t("linkFailed");
    const desc = !linkError
      ? t("notFoundDesc")
      : msg.includes("too_many_attempts")
      ? t("tooManyAttempts")
      : msg.includes("already_invited_by_another_professional")
      ? t("alreadyInvitedByAnother")
      : t("linkFailedDesc");
    return (
      <AuthPageShell>
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-100 text-center">
          <p className="text-slate-600 font-semibold mb-2">{heading}</p>
          <p className="text-sm text-slate-400 mb-6">{desc}</p>
          <Link href={`${prefix}/`} className="text-teal-600 text-sm hover:underline">
            {t("backToHome")}
          </Link>
        </div>
      </AuthPageShell>
    );
  }

  redirect(`${prefix}/auth/pending-confirmation`);
}
