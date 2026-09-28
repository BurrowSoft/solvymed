import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { AuthPageShell } from "@/components/AuthPageShell";
import { AuthCard } from "@/components/AuthCard";
import { isWellFormedSecretaryCode, normalizeSecretaryCode } from "@/lib/secretary";
import { InviteDecision } from "./InviteDecision";
import { InviteHint } from "./InviteHint";

type InvitePreview = { professional_name: string | null; clinic_name: string | null };

// A doctor's secretary invite link: /join/secretary/<S-code>. Signed out:
// the invitation, with a masked hint of who it's for (InviteHint, fetched
// in the browser), leading to secretary signup. Signed in: the invite
// preview with Accept/Decline, or a clear message when this account can't
// accept it. Older links still carry ?email=<invitee>: it's ignored, since
// emails don't belong in URLs (history, logs, referrers) and the server
// checks the email on accept anyway.
export default async function SecretaryInvitePage({
  params,
}: {
  params: Promise<{ locale: string; code: string }>;
}) {
  const { locale, code: rawCode } = await params;
  const prefix = locale === "en" ? "" : `/${locale}`;
  // rawCode is untrusted URL input: malformed %-encoding makes
  // decodeURIComponent throw, which must show "invalid invite", not a 500.
  let decoded = "";
  try {
    decoded = decodeURIComponent(rawCode);
  } catch {
    decoded = "";
  }
  const code = normalizeSecretaryCode(decoded);
  const t = await getTranslations({ locale, namespace: "secretary" });

  const message = (title: string, body: string) => (
    <AuthPageShell>
      <AuthCard centered>
        <h1 className="auth-heading">{title}</h1>
        <p className="mb-8 text-slate-500">{body}</p>
        <Link href={`${prefix}/`} className="text-sm text-teal-600 hover:underline">{t("backToHome")}</Link>
      </AuthCard>
    </AuthPageShell>
  );

  // A code without the invite shape can't be real: say so, rather than
  // offering a signup that would end in an unlinked account.
  if (!code || !isWellFormedSecretaryCode(code)) return message(t("inviteInvalidTitle"), t("inviteInvalid"));

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const signupHref = `${prefix}/auth/signup?secretary=${encodeURIComponent(code)}`;
    const loginHref = `${prefix}/auth/login?next=${encodeURIComponent(`${prefix}/join/secretary/${code}`)}`;
    return (
      <AuthPageShell>
        <AuthCard centered>
          <h1 className="auth-heading">{t("invitedTitle")}</h1>
          <p className="mb-6 text-slate-500">{t("invitedBody")}</p>
          <InviteHint code={code} signupHref={signupHref} loginHref={loginHref} homeHref={`${prefix}/`} />
        </AuthCard>
      </AuthPageShell>
    );
  }

  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role, invited_by_professional_id")
    .eq("user_id", user.id)
    .maybeSingle();

  // Clear messages up front for accounts the RPC would refuse anyway.
  if (roleRow?.role === "patient") return message(t("cannotAcceptTitle"), t("accountIsPatient"));
  if (roleRow?.role === "professional") return message(t("cannotAcceptTitle"), t("accountIsProfessional"));
  if (roleRow?.role === "secretary" && roleRow.invited_by_professional_id) {
    const { data: clinicRows } = await supabase.rpc("get_my_clinic");
    const name = (Array.isArray(clinicRows) ? clinicRows[0]?.professional_name : null) as string | null;
    return message(
      t("cannotAcceptTitle"),
      name ? t("alreadyInClinicNamed", { name }) : t("alreadyInClinic"),
    );
  }

  // Empty means invalid, expired, used, or for a different email.
  const { data, error } = await supabase.rpc("get_secretary_invite", { p_code: code });
  const invite = (!error && Array.isArray(data) ? data[0] : null) as InvitePreview | null;
  if (!invite) return message(t("inviteInvalidTitle"), t("inviteInvalid"));

  return (
    <AuthPageShell>
      <AuthCard centered>
        <h1 className="auth-heading">{t("inviteTitle")}</h1>
        <p className="mb-8 text-slate-500">
          {invite.clinic_name
            ? t("inviteBody", { name: invite.professional_name ?? "", clinic: invite.clinic_name })
            : t("inviteBodyNoClinic", { name: invite.professional_name ?? "" })}
        </p>
        <InviteDecision code={code} locale={locale} />
      </AuthCard>
    </AuthPageShell>
  );
}
