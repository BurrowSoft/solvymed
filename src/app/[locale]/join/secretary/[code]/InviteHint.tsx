"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";

type Hint = { masked_email: string | null; clinic_name: string | null };
type State = { kind: "loading" } | { kind: "open"; hint: Hint } | { kind: "closed" } | { kind: "unknown" };

// The signed-out invitation: who it's for, without putting the email in the
// URL (a masked email and the clinic, from get_secretary_invite_hint), and
// the signup/login actions.
// - One row: the invite is open, so show the hint and offer signup.
// - Zero rows: expired, revoked, already used, resent or unknown (the RPC
//   doesn't say which, so it can't be used to probe codes). Say the link no
//   longer works instead of letting someone sign up for nothing.
// - An error (rate limit, network): offer signup without the hint. The
//   server still checks the email when the invite is accepted.
// BROWSER ONLY (see migration 093's header): the RPC is rate-limited per
// client IP, and server-side calls would all come from Vercel's IPs and
// share one budget. Running after mount also keeps link-preview bots from
// spending it. The caller only renders this for a well-formed code.
export function InviteHint({ code, signupHref, loginHref, homeHref }: {
  code: string;
  signupHref: string;
  loginHref: string;
  homeHref: string;
}) {
  const t = useTranslations("secretary");
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    createClient()
      .rpc("get_secretary_invite_hint", { p_code: code })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !Array.isArray(data)) setState({ kind: "unknown" });
        else if (data.length === 0) setState({ kind: "closed" });
        else setState({ kind: "open", hint: data[0] as Hint });
      });
    return () => { cancelled = true; };
  }, [code]);

  if (state.kind === "loading") {
    return <p className="mb-6 text-sm text-slate-400" aria-live="polite">…</p>;
  }

  if (state.kind === "closed") {
    return (
      <div role="status">
        <h2 className="mb-2 text-lg font-bold text-slate-900">{t("inviteInvalidTitle")}</h2>
        <p className="mb-8 text-slate-500">{t("inviteInvalid")}</p>
        <Link href={homeHref} className="text-sm text-teal-600 hover:underline">{t("backToHome")}</Link>
      </div>
    );
  }

  const hint = state.kind === "open" ? state.hint : null;
  return (
    <>
      {(hint?.clinic_name || hint?.masked_email) && (
        <div className="mb-6 rounded-xl bg-teal-50 px-4 py-3 text-sm text-teal-800">
          {hint.clinic_name && <p className="font-semibold">{t("inviteFrom", { clinic: hint.clinic_name })}</p>}
          {hint.masked_email && <p>{t("inviteFor", { email: hint.masked_email })}</p>}
        </div>
      )}
      <Link
        href={signupHref}
        className="mb-4 block w-full rounded-xl bg-teal-600 px-6 py-3.5 text-base font-bold text-white shadow-md transition hover:bg-teal-700"
      >
        {t("createAccount")}
      </Link>
      <Link href={loginHref} className="text-sm text-teal-600 hover:underline">{t("haveAccountLogIn")}</Link>
    </>
  );
}
