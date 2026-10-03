"use client";

import { useState, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { MyDoctor } from "@/lib/myDoctors";
import { shortDoctorName } from "@/lib/doctorName";
import { brandAccent, brandInitials, readableAccent } from "@/lib/readableAccent";
import { connectDoctor, disconnectDoctor } from "./doctor-actions";

// Minhas consultas → "Seu médico" / "Meus médicos" (1.5.0, migration 164;
// behind liveFeatures.multiDoctor). Each doctor the patient connected to is
// a branded card with "Marcar consulta com {doctor}" and "Desconectar";
// "+ Adicionar médico" (a code) only while the server allows a second
// doctor. Never a directory: only the patient's own doctors are listed.

export function MyDoctors({ doctors, canAdd }: { doctors: MyDoctor[]; canAdd: boolean }) {
  const t = useTranslations("patientDoctors");
  const many = doctors.length > 1;
  const [adding, setAdding] = useState(false);
  const [note, setNote] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  return (
    <section id="my-doctors" data-testid="my-doctors" className="space-y-3">
      <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{many ? t("homeSection") : t("homeCard")}</p>
      {doctors.map((d) => <DoctorCard key={d.id} doctor={d} onNote={setNote} />)}
      {note && (
        <p role={note.kind === "error" ? "alert" : "status"} className={`text-sm ${note.kind === "error" ? "text-red-600" : "text-teal-700"}`}>{note.text}</p>
      )}
      {canAdd && (adding
        ? <AddDoctor onDone={(n) => { setNote(n); if (n?.kind === "ok") setAdding(false); }} onCancel={() => setAdding(false)} />
        : (
          <button type="button" onClick={() => { setNote(null); setAdding(true); }}
            className="w-full rounded-2xl border-2 border-dashed border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-teal-700 hover:border-teal-300">
            {t("add")}
          </button>
        ))}
    </section>
  );
}

function DoctorCard({ doctor, onNote }: { doctor: MyDoctor; onNote: (n: { kind: "ok" | "error"; text: string } | null) => void }) {
  const t = useTranslations("patientDoctors");
  const tMy = useTranslations("myAppointments");
  const tAuth = useTranslations("auth");
  // "Cancelar" / "Cancel" / "ยกเลิก" (an existing key).
  const tCommon = useTranslations("brand");
  const { locale } = useParams<{ locale: string }>();
  const router = useRouter();
  const prefix = locale === "en" ? "" : `/${locale}`;
  const [confirming, setConfirming] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [pending, start] = useTransition();
  const accent = readableAccent(brandAccent(doctor.accentColor), "#ffffff");
  const image = doctor.logoUrl ?? doctor.photoUrl;

  const disconnect = () => start(async () => {
    const r = await disconnectDoctor(doctor.id);
    setConfirming(false);
    if (r.ok) { onNote({ kind: "ok", text: t("disconnected", { doctor: doctor.name }) }); router.refresh(); return; }
    if (r.code === "has_future_visits") { setBlocked(true); return; }
    onNote({ kind: "error", text: tAuth("errors.generic") });
  });

  return (
    <div data-testid="doctor-card" className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100" style={{ borderLeft: `4px solid ${accent}` }}>
      <div className="flex items-center gap-3">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className={`h-11 w-11 shrink-0 bg-white ${doctor.logoUrl ? "rounded-lg object-contain" : "rounded-full object-cover"}`} />
        ) : (
          <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ backgroundColor: accent }}>
            {brandInitials(doctor.name) || "•"}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 font-bold text-slate-900 [overflow-wrap:anywhere]">{doctor.name}</p>
          {doctor.specialty && <p className="truncate text-sm text-slate-500">{doctor.specialty}</p>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {doctor.acceptsBookings && (
          <a href={`${prefix}/book/${doctor.id}`} className="max-w-full line-clamp-2 [overflow-wrap:anywhere] rounded-xl px-4 py-2 text-center text-sm font-bold text-white" style={{ backgroundColor: accent }}>
            {tMy("bookWith", { doctor: shortDoctorName(doctor.name) })}
          </a>
        )}
        {!confirming && (
          <button type="button" onClick={() => { setBlocked(false); setConfirming(true); }} className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50">
            {t("disconnect")}
          </button>
        )}
      </div>
      {confirming && (
        <div role="alertdialog" aria-labelledby={`disc-${doctor.id}`} data-testid="disconnect-confirm" className="mt-3 rounded-xl border border-red-100 bg-red-50 p-3">
          <p id={`disc-${doctor.id}`} className="text-sm font-semibold text-slate-900">{t("disconnectTitle", { doctor: doctor.name })}</p>
          <p className="mt-0.5 text-xs text-slate-600">{t("disconnectBody", { doctor: doctor.name })}</p>
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={pending} onClick={disconnect} className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">{t("disconnect")}</button>
            <button type="button" onClick={() => setConfirming(false)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700">{tCommon("cancel")}</button>
          </div>
        </div>
      )}
      {blocked && <p role="alert" data-testid="disconnect-blocked" className="mt-2 text-sm text-amber-700">{t("disconnectBlocked", { doctor: doctor.name })}</p>}
    </div>
  );
}

function AddDoctor({ onDone, onCancel }: { onDone: (n: { kind: "ok" | "error"; text: string } | null) => void; onCancel: () => void }) {
  const t = useTranslations("patientDoctors");
  const tInvite = useTranslations("auth.inviteRequired");
  const tCommon = useTranslations("brand");
  const [code, setCode] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await connectDoctor(code);
      if (r.outcome === "connected") { onDone({ kind: "ok", text: t("connected", { doctor: r.doctor }) }); router.refresh(); return; }
      if (r.outcome === "already_connected") { onDone({ kind: "ok", text: t("alreadyConnected", { doctor: r.doctor }) }); return; }
      onDone({ kind: "error", text: r.outcome === "too_many_attempts" ? tInvite("tooManyAttempts") : tInvite("codeUnavailable") });
    });
  };
  return (
    <form method="post" onSubmit={submit} data-testid="add-doctor" className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
      <p className="font-bold text-slate-900">{t("addTitle")}</p>
      <p className="mt-0.5 text-sm text-slate-500">{t("addHint")}</p>
      <label htmlFor="add-doctor-code" className="mt-3 block text-xs font-semibold text-slate-600">{t("code")}</label>
      <div className="mt-1 flex gap-2">
        <input id="add-doctor-code" value={code} maxLength={6} autoComplete="off"
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
          className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 font-mono text-base uppercase tracking-widest" />
        <button type="submit" disabled={pending || !code} className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-60">{t("connect")}</button>
      </div>
      <button type="button" onClick={onCancel} className="mt-2 text-xs font-semibold text-slate-500 hover:underline">{tCommon("cancel")}</button>
    </form>
  );
}
