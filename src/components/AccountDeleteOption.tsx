"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { clearAuthCookies } from "@/lib/signOut";
import { track } from "@/lib/track";

// "Connect to a doctor" (/auth/invite-required): a patient with no doctor can delete the
// account themselves (01, B; migration 243). 243's delete_unlinked_patient_account_status
// (read only, as the caller) decides what shows, on load:
//   can_delete, or try_later → "Excluir minha conta" (the delete then answers try_later,
//     the "try again in an hour" line: an invite-code guess in the last hour);
//   removed_by_practice / has_data → "Pedir exclusão da conta" (/account/delete): a patient a
//     practice removed can't erase that removal by deleting and rejoining (Help C5; cf);
//   anything else, or a failed read → nothing.
// The delete RPC refuses with the same codes (the backstop: the generic error). After
// "deleted": a local sign-out with the auth cookies cleared (the user no longer exists), then
// the landing with "Conta excluída.". The error line sits below the buttons (never moves them).
type Status = { can_delete?: boolean; reason?: string | null };

export function AccountDeleteOption() {
  const t = useTranslations("auth.inviteRequired");
  const tAuth = useTranslations("auth");
  const tc = useTranslations("auth.completeAccount");
  const { locale } = useParams<{ locale: string }>();
  const prefix = locale === "en" ? "" : `/${locale}`;
  const [mode, setMode] = useState<"delete" | "request" | null>(null);
  const [asking, setAsking] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    void (async () => {
      const { data, error: e } = await createClient().rpc("delete_unlinked_patient_account_status");
      if (!live || e) return;
      const s = (data ?? {}) as Status;
      if (s.can_delete === true || s.reason === "try_later") setMode("delete");
      else if (s.reason === "removed_by_practice" || s.reason === "has_data") setMode("request");
    })().catch(() => undefined);
    return () => { live = false; };
  }, []);

  async function remove() {
    if (working) return;
    setWorking(true);
    setError("");
    const supabase = createClient();
    const { data, error: e } = await supabase.rpc("delete_unlinked_patient_account");
    if (!e && (data as { status?: string } | null)?.status === "deleted") {
      track("unlinked_patient_deleted");
      await supabase.auth.signOut({ scope: "local" }).catch(() => null);
      clearAuthCookies();
      window.location.assign(`${prefix}/?account_deleted=1`);
      return;
    }
    setWorking(false);
    setError((e?.message ?? "").includes("try_later") ? tc("cancelTryLater") : tAuth("errors.generic"));
  }

  if (mode === "request") {
    return (
      <a href={`${prefix}/account/delete`} data-testid="request-deletion"
        className="mt-4 block text-center text-xs font-semibold text-slate-400 underline hover:text-slate-600">
        {t("requestDeletion")}
      </a>
    );
  }
  if (mode !== "delete") return null;
  return (
    <div className="mt-4 text-center">
      {!asking ? (
        <button type="button" data-testid="delete-account" onClick={() => { setAsking(true); setError(""); }}
          className="text-xs font-semibold text-slate-400 underline hover:text-slate-600">
          {t("deleteAccount")}
        </button>
      ) : (
        <div role="alertdialog" aria-labelledby="delete-account-text" data-testid="delete-account-confirm" className="rounded-xl bg-slate-50 p-3 text-left text-sm">
          <p id="delete-account-text" className="text-slate-700">{t("deleteConfirm")}</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button type="button" data-testid="delete-account-yes" onClick={remove} disabled={working}
              className="rounded-xl border border-red-300 bg-white px-4 py-2 font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60">
              {t("deleteAccount")}
            </button>
            <button type="button" data-testid="delete-account-back" onClick={() => { setAsking(false); setError(""); }} disabled={working}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60">
              {tc("cancelBack")}
            </button>
          </div>
          {/* Below the buttons, never above (01: an error line must never move them). */}
          {error && <p role="alert" data-testid="delete-account-error" className="mt-2 text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
