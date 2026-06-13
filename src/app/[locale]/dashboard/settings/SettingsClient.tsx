"use client";

import { useTransition, useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { updateProfile, updateClinic, updateWorkingHours, createProcedure, toggleProcedure, deleteProcedure, updateSchedulingRules } from "./actions";

/* ─── shared UI primitives ─────────────────────────────────────── */
function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-semibold text-slate-600 mb-1">{children}</label>;
}

function Input({ name, defaultValue = "", placeholder, type = "text", required }: {
  name: string; defaultValue?: string; placeholder?: string; type?: string; required?: boolean;
}) {
  return (
    <input
      name={name}
      type={type}
      defaultValue={defaultValue}
      placeholder={placeholder}
      required={required}
      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-100 transition"
    />
  );
}

function SaveRow({ pending, saved }: { pending: boolean; saved: boolean }) {
  const t = useTranslations("settings");
  return (
    <div className="mt-6 flex items-center gap-3">
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-60 transition"
      >
        {pending ? t("saving") : t("save")}
      </button>
      {saved && <span className="text-sm font-semibold text-green-600">{t("saved")}</span>}
    </div>
  );
}

function Card({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        {description && <p className="text-sm text-slate-500 mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  );
}

/* ─── Profile form ──────────────────────────────────────────────── */
export function ProfileForm({ fullName, specialty }: { fullName: string; specialty?: string }) {
  const t = useTranslations("settings");
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      await updateProfile(fd);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    });
  }

  return (
    <Card title={t("profileTitle")} description={t("profileSub")}>
      <form onSubmit={handleSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>{t("fullName")}</Label>
            <Input name="full_name" defaultValue={fullName} placeholder={t("fullNamePlaceholder")} required />
          </div>
          <div>
            <Label>{t("specialty")}</Label>
            <Input name="specialty" defaultValue={specialty ?? ""} placeholder={t("specialtyPlaceholder")} />
          </div>
        </div>
        <SaveRow pending={pending} saved={saved} />
      </form>
    </Card>
  );
}

/* ─── Clinic form ───────────────────────────────────────────────── */
type ClinicData = {
  clinic_name?: string; clinic_cnpj?: string; clinic_phone?: string;
  clinic_website?: string; clinic_address?: string; clinic_city?: string; clinic_state?: string;
};

export function ClinicForm({ data }: { data: ClinicData }) {
  const t = useTranslations("settings");
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      await updateClinic(fd);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    });
  }

  return (
    <Card title={t("clinicTitle")} description={t("clinicSub")}>
      <form onSubmit={handleSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>{t("clinicName")}</Label>
            <Input name="clinic_name" defaultValue={data.clinic_name ?? ""} placeholder={t("clinicNamePlaceholder")} />
          </div>
          <div>
            <Label>{t("cnpj")}</Label>
            <Input name="clinic_cnpj" defaultValue={data.clinic_cnpj ?? ""} placeholder="00.000.000/0001-00" />
          </div>
          <div>
            <Label>{t("phone")}</Label>
            <Input name="clinic_phone" defaultValue={data.clinic_phone ?? ""} placeholder="(11) 3000-0000" />
          </div>
          <div>
            <Label>{t("website")}</Label>
            <Input name="clinic_website" defaultValue={data.clinic_website ?? ""} placeholder="www.example.com.br" />
          </div>
          <div className="sm:col-span-2">
            <Label>{t("address")}</Label>
            <Input name="clinic_address" defaultValue={data.clinic_address ?? ""} placeholder={t("addressPlaceholder")} />
          </div>
          <div>
            <Label>{t("city")}</Label>
            <Input name="clinic_city" defaultValue={data.clinic_city ?? ""} placeholder="São Paulo" />
          </div>
          <div>
            <Label>{t("state")}</Label>
            <Input name="clinic_state" defaultValue={data.clinic_state ?? ""} placeholder="SP" />
          </div>
        </div>
        <SaveRow pending={pending} saved={saved} />
      </form>
    </Card>
  );
}

/* ─── Working hours form ────────────────────────────────────────── */
type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
type WorkingHours = Record<DayKey, { enabled: boolean; start: string; end: string }>;

const DAY_KEYS: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function defaultHours(): WorkingHours {
  const days = {} as WorkingHours;
  for (const key of DAY_KEYS) {
    days[key] = { enabled: key !== "sat" && key !== "sun", start: "08:00", end: "18:00" };
  }
  return days;
}

export function WorkingHoursForm({ workingHours }: { workingHours: WorkingHours | null }) {
  const t = useTranslations("settings");
  const DAYS: { key: DayKey; label: string }[] = [
    { key: "mon", label: t("mon") },
    { key: "tue", label: t("tue") },
    { key: "wed", label: t("wed") },
    { key: "thu", label: t("thu") },
    { key: "fri", label: t("fri") },
    { key: "sat", label: t("sat") },
    { key: "sun", label: t("sun") },
  ];

  const hours: WorkingHours = workingHours ?? defaultHours();
  const [enabled, setEnabled] = useState<Record<DayKey, boolean>>(
    Object.fromEntries(DAY_KEYS.map(k => [k, hours[k]?.enabled ?? false])) as Record<DayKey, boolean>
  );
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      await updateWorkingHours(fd);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    });
  }

  return (
    <Card title={t("hoursTitle")} description={t("hoursSub")}>
      <form onSubmit={handleSubmit}>
        <div className="divide-y divide-slate-100">
          {DAYS.map(d => {
            const h = hours[d.key] ?? { enabled: false, start: "08:00", end: "18:00" };
            return (
              <div key={d.key} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
                <label className="flex items-center gap-2.5 w-32 shrink-0 cursor-pointer">
                  <input
                    type="checkbox"
                    name={`${d.key}_enabled`}
                    checked={enabled[d.key]}
                    onChange={ev => setEnabled(prev => ({ ...prev, [d.key]: ev.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                  />
                  <span className={`text-sm font-semibold ${enabled[d.key] ? "text-slate-900" : "text-slate-400"}`}>{d.label}</span>
                </label>
                <div className={`flex items-center gap-2 transition ${enabled[d.key] ? "opacity-100" : "opacity-30 pointer-events-none"}`}>
                  <input
                    type="time"
                    name={`${d.key}_start`}
                    defaultValue={h.start}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm text-slate-900 focus:border-teal-500 focus:outline-none"
                  />
                  <span className="text-sm text-slate-400">{t("to")}</span>
                  <input
                    type="time"
                    name={`${d.key}_end`}
                    defaultValue={h.end}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm text-slate-900 focus:border-teal-500 focus:outline-none"
                  />
                </div>
              </div>
            );
          })}
        </div>
        <SaveRow pending={pending} saved={saved} />
      </form>
    </Card>
  );
}

/* ─── Scheduling rules form ────────────────────────────────────── */
export function SchedulingRulesForm({ maxConcurrent }: { maxConcurrent: number | null }) {
  const t = useTranslations("settings");
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      await updateSchedulingRules(fd);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    });
  }

  return (
    <Card title={t("rulesTitle")} description={t("rulesSub")}>
      <form onSubmit={handleSubmit}>
        <div>
          <Label>{t("maxLabel")}</Label>
          <div className="flex items-center gap-4">
            <input
              name="max_concurrent_bookings"
              type="number"
              min="1"
              max="20"
              defaultValue={maxConcurrent ?? ""}
              placeholder={t("unlimited")}
              className="w-28 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-100 transition"
            />
            <p className="text-xs text-slate-400">{t("maxHint1")}</p>
          </div>
          <p className="mt-2 text-xs text-slate-400">{t("maxHint2")}</p>
        </div>
        <SaveRow pending={pending} saved={saved} />
      </form>
    </Card>
  );
}

/* ─── Procedures panel ──────────────────────────────────────────── */
type Procedure = {
  id: string; name: string; duration_minutes: number; price?: number; payment_type: string; active: boolean;
};

function formatBRL(n?: number) {
  if (!n) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

export function ProceduresPanel({ procedures }: { procedures: Procedure[] }) {
  const t = useTranslations("settings");
  const [showForm, setShowForm] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await createProcedure(fd);
      if (res?.error) { setError(res.error); return; }
      setShowForm(false);
      setError("");
      formRef.current?.reset();
    });
  }

  return (
    <Card title={t("proceduresTitle")} description={t("proceduresSub")}>
      <div className="space-y-2 mb-4">
        {procedures.length === 0 && !showForm && (
          <p className="text-sm text-slate-400 py-4 text-center">{t("noProcedures")}</p>
        )}
        {procedures.map(proc => (
          <ProcedureRow key={proc.id} proc={proc} />
        ))}
      </div>

      {showForm ? (
        <form ref={formRef} onSubmit={handleCreate} className="rounded-xl border border-teal-100 bg-teal-50/40 p-4">
          <p className="text-sm font-bold text-slate-900 mb-4">{t("newProcedure")}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>{t("procedureName")}</Label>
              <Input name="name" placeholder={t("procedureNamePlaceholder")} required />
            </div>
            <div>
              <Label>{t("durationLabel")}</Label>
              <Input name="duration_minutes" type="number" defaultValue="60" placeholder="60" />
            </div>
            <div>
              <Label>{t("priceLabel")}</Label>
              <Input name="price" type="number" placeholder="0.00" />
            </div>
            <div className="sm:col-span-2">
              <Label>{t("paymentTypeLabel")}</Label>
              <select
                name="payment_type"
                defaultValue="private"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-500 focus:outline-none"
              >
                <option value="private">{t("private")}</option>
                <option value="insurance">{t("insurance")}</option>
              </select>
            </div>
          </div>
          {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
          <div className="mt-4 flex gap-2">
            <button type="submit" disabled={pending}
              className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-60 transition">
              {pending ? t("adding") : t("addProcedure")}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setError(""); }}
              className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-500 hover:text-slate-700 transition">
              {t("cancel")}
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 rounded-xl border border-dashed border-teal-300 px-4 py-2.5 text-sm font-semibold text-teal-600 hover:bg-teal-50 transition"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-4 w-4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          {t("addProcedure")}
        </button>
      )}
    </Card>
  );
}

function ProcedureRow({ proc }: { proc: Procedure }) {
  const t = useTranslations("settings");
  const [pending, start] = useTransition();

  return (
    <div className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 transition ${proc.active ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-50 opacity-60"}`}>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900">{proc.name}</p>
        <p className="text-xs text-slate-500 mt-0.5">
          {proc.duration_minutes} min · {formatBRL(proc.price)} · {proc.payment_type}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => start(async () => { await toggleProcedure(proc.id, !proc.active); })}
          disabled={pending}
          title={proc.active ? t("disable") : t("enable")}
          className={`rounded-lg px-3 py-1 text-xs font-semibold transition disabled:opacity-60 ${proc.active ? "bg-slate-100 text-slate-600 hover:bg-slate-200" : "bg-teal-50 text-teal-700 hover:bg-teal-100"}`}
        >
          {pending ? "…" : proc.active ? t("disable") : t("enable")}
        </button>
        <button
          onClick={() => { if (confirm(t("deleteConfirm", { name: proc.name }))) start(async () => { await deleteProcedure(proc.id); }); }}
          disabled={pending}
          title="Delete"
          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition disabled:opacity-60"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
        </button>
      </div>
    </div>
  );
}
