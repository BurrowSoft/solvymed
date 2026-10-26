"use client";

import { useState, useTransition } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { safeCall, NETWORK_FAILURE } from "@/lib/netError";
import { disconnectDoctor } from "./doctor-actions";

// "Desconectar" on the one-doctor card (01, 10-26; low priority): a discreet link at the
// card's bottom, the same in-page confirm and strings as MyDoctors, the same
// disconnect_doctor. Refused while a visit with that doctor is ahead (it says so);
// otherwise the pending requests are cancelled and the clinic told (the server), and the
// patient lands on the connect page, which offers "Ver mensagens anteriores com {doctor}"
// when they have Patient Channel messages there (?left=, their own rows only).
export function OneDoctorDisconnect({ doctorId, doctorName }: { doctorId: string; doctorName: string }) {
  const t = useTranslations("patientDoctors");
  const tAuth = useTranslations("auth");
  // "Cancelar" / "Cancel" / "ยกเลิก" (an existing key, as MyDoctors).
  const tCommon = useTranslations("brand");
  const { locale } = useParams<{ locale: string }>();
  const prefix = locale === "en" ? "" : `/${locale}`;
  const [confirming, setConfirming] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();

  const disconnect = () => start(async () => {
    const r = await safeCall(() => disconnectDoctor(doctorId), NETWORK_FAILURE);
    if (r.ok) {
      window.location.assign(`${prefix}/auth/invite-required?left=${encodeURIComponent(doctorId)}`);
      return;
    }
    setConfirming(false);
    if (r.code === "has_future_visits") setBlocked(true);
    else setFailed(true);
  });

  return (
    <div className="mt-4 border-t border-slate-100 pt-3">
      {!confirming && (
        <button type="button" data-testid="one-doctor-disconnect" onClick={() => { setBlocked(false); setFailed(false); setConfirming(true); }}
          className="text-xs font-semibold text-slate-400 underline hover:text-slate-600">
          {t("disconnect")}
        </button>
      )}
      {confirming && (
        <div role="alertdialog" aria-labelledby="disc-one" data-testid="disconnect-confirm" className="rounded-xl border border-red-100 bg-red-50 p-3">
          <p id="disc-one" className="text-sm font-semibold text-slate-900">{t("disconnectTitle", { doctor: doctorName })}</p>
          <p className="mt-0.5 text-xs text-slate-600">{t("disconnectBody", { doctor: doctorName })}</p>
          <div className="mt-2 flex gap-2">
            <button data-server type="button" disabled={pending} onClick={disconnect} className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">{t("disconnect")}</button>
            <button type="button" onClick={() => setConfirming(false)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700">{tCommon("cancel")}</button>
          </div>
        </div>
      )}
      {blocked && <p role="alert" data-testid="disconnect-blocked" className="mt-2 text-sm text-amber-700">{t("disconnectBlocked", { doctor: doctorName })}</p>}
      {failed && <p role="alert" className="mt-2 text-sm text-red-600">{tAuth("errors.generic")}</p>}
    </div>
  );
}
