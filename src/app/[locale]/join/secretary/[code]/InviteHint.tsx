"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { isWellFormedSecretaryCode } from "@/lib/secretary";

type Hint = { masked_email: string | null; clinic_name: string | null };

// Who the invitation is for, without putting the email in the URL: a masked
// email ("an***@gmail.com") and the clinic, from get_secretary_invite_hint.
// BROWSER ONLY (see migration 093's header): the RPC is rate-limited per
// client IP, and server-side calls would all come from Vercel's IPs and
// share one budget. Running after mount also keeps link-preview bots from
// spending it.
export function InviteHint({ code }: { code: string }) {
  const t = useTranslations("secretary");
  const [hint, setHint] = useState<Hint | null>(null);

  useEffect(() => {
    // Malformed codes would still count against the budgets.
    if (!isWellFormedSecretaryCode(code)) return;
    let cancelled = false;
    createClient()
      .rpc("get_secretary_invite_hint", { p_code: code })
      .then(({ data, error }) => {
        // Nothing to show on any error (rate limit included) or for a bad
        // code: the page's generic invitation still works, and the server
        // checks the email when the invite is accepted.
        if (cancelled || error || !Array.isArray(data) || data.length === 0) return;
        setHint(data[0] as Hint);
      });
    return () => { cancelled = true; };
  }, [code]);

  if (!hint?.masked_email) return null;
  return (
    <div className="mb-6 rounded-xl bg-teal-50 px-4 py-3 text-sm text-teal-800">
      {hint.clinic_name && <p className="font-semibold">{t("inviteFrom", { clinic: hint.clinic_name })}</p>}
      <p>{t("inviteFor", { email: hint.masked_email })}</p>
    </div>
  );
}
