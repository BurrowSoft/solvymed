"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useTransition, useRef } from "react";
import { useTranslations } from "next-intl";
import { createAppointment, updateAppointmentStatus, deleteAppointment, blockTime } from "./actions";
import { generatePixString, pixQrUrl } from "@/lib/pix";
import { toLocalDateString } from "@/lib/slots";

type Patient = { id: string; full_name: string };
type Procedure = { id: string; name: string; duration_minutes: number; price?: number; payment_type: string };
type Appointment = {
  id: string;
  patient_name: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  status: string;
  type: string;
  consultation_type: string;
  payment_status: string;
  payment_amount?: number;
  notes?: string;
};

function statusBadge(status: string) {
  switch (status) {
    case "confirmed": return "bg-teal-100 text-teal-700";
    case "scheduled": return "bg-amber-100 text-amber-700";
    case "completed": return "bg-green-100 text-green-700";
    case "cancelled": return "bg-red-100 text-red-700";
    case "blocked": return "bg-slate-100 text-slate-500";
    case "late": return "bg-orange-100 text-orange-700";
    case "absent": return "bg-red-100 text-red-600";
    default: return "bg-slate-100 text-slate-600";
  }
}

const STATUS_OPTIONS = ["scheduled", "confirmed", "completed", "cancelled", "late", "absent"];

function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 transition">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">{children}</label>;
}

function Input({ className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 ${className}`} {...props} />;
}

function Select({ className = "", children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }) {
  return (
    <select className={`w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 bg-white ${className}`} {...props}>
      {children}
    </select>
  );
}

export function ViewToggle({ currentView, currentDate }: { currentView: string; currentDate: string }) {
  const t = useTranslations("schedule");
  const router = useRouter();
  const pathname = usePathname();
  const views = [
    { id: "list", label: t("list") },
    { id: "day",  label: t("day") },
    { id: "week", label: t("week") },
    { id: "month", label: t("month") },
  ];
  return (
    <div className="flex rounded-xl border border-slate-200 bg-white overflow-hidden text-xs font-semibold shadow-sm">
      {views.map((v, i) => (
        <button
          key={v.id}
          onClick={() => router.push(`${pathname}?date=${currentDate}&view=${v.id}`)}
          className={`px-3.5 py-2 transition ${i > 0 ? "border-l border-slate-200" : ""} ${currentView === v.id ? "bg-teal-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}

export function ScheduleNav({ currentDate, currentView = "list" }: { currentDate: string; currentView?: string }) {
  const t = useTranslations("schedule");
  const router = useRouter();
  const pathname = usePathname();

  function navigate(offset: number) {
    const d = new Date(currentDate + "T12:00:00");
    d.setDate(d.getDate() + offset);
    router.push(`${pathname}?date=${toLocalDateString(d)}&view=${currentView}`);
  }

  function goToday() {
    router.push(`${pathname}?date=${toLocalDateString(new Date())}&view=${currentView}`);
  }

  const formatted = new Date(currentDate + "T12:00:00").toLocaleDateString(undefined, {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const isToday = currentDate === toLocalDateString(new Date());

  return (
    <div className="flex items-center gap-2">
      <button onClick={() => navigate(-1)} className="rounded-xl border border-slate-200 p-2 hover:bg-slate-50 transition">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-slate-600"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <div className="text-center min-w-[220px]">
        <p className="font-bold text-slate-900 text-sm">{formatted}</p>
      </div>
      <button onClick={() => navigate(1)} className="rounded-xl border border-slate-200 p-2 hover:bg-slate-50 transition">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-slate-600"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
      {!isToday && (
        <button onClick={goToday} className="ml-2 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-700 hover:bg-teal-100 transition">
          {t("today")}
        </button>
      )}
    </div>
  );
}

const STATUS_KEY: Record<string, string> = {
  tentative: "statusTentative", proposal: "statusProposal", scheduled: "statusScheduled",
  confirmed: "statusConfirmed", completed: "statusCompleted", cancelled: "statusCancelled",
  late: "statusLate", absent: "statusAbsent", blocked: "statusBlocked",
};

const ACTION_ERROR_KEY: Record<string, string> = {
  use_booking_card: "useBookingCard",
  missing_fields: "missingFieldsError",
  past_midnight: "pastMidnightError",
  patient_archived: "patientArchivedError",
  generic: "genericError",
};

function actionErrorMessage(t: (key: string) => string, code: string | undefined): string {
  return t(ACTION_ERROR_KEY[code ?? ""] ?? "genericError");
}

export function AppointmentStatusSelect({ id, current }: { id: string; current: string }) {
  const t = useTranslations("schedule");
  const [status, setStatus] = useState(current);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  // A tentative/proposal request must go through the booking request card
  // (confirm/reject/propose), which links the patient and notifies them —
  // this plain status control can't do either. Show it as a static badge
  // instead of an interactive control the server would reject anyway.
  if (current === "tentative" || current === "proposal") {
    return (
      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusBadge(current)}`}>
        {t(STATUS_KEY[current] ?? current)}
      </span>
    );
  }

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newStatus = e.target.value;
    const previous = status;
    setStatus(newStatus);
    setError("");
    startTransition(async () => {
      const result = await updateAppointmentStatus(id, newStatus);
      if (result?.error) {
        setStatus(previous);
        setError(actionErrorMessage(t, result.code));
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <select
        value={status}
        onChange={handleChange}
        disabled={pending}
        className={`rounded-full px-3 py-1 text-xs font-semibold border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500/20 ${statusBadge(status)}`}
      >
        {STATUS_OPTIONS.map(s => (
          <option key={s} value={s}>{t(STATUS_KEY[s] ?? s)}</option>
        ))}
      </select>
      {error && <p className="text-xs text-red-600 text-right max-w-[160px]">{error}</p>}
    </div>
  );
}

export function DeleteAppointmentButton({ id }: { id: string }) {
  const t = useTranslations("schedule");
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm(t("deleteConfirm"))) return;
    startTransition(async () => { await deleteAppointment(id); });
  }

  return (
    <button onClick={handleDelete} disabled={pending} className="rounded-lg p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 transition">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4">
        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
      </svg>
    </button>
  );
}

export function NewAppointmentButton({ patients, defaultDate, procedures }: {
  patients: Patient[];
  defaultDate: string;
  procedures: Procedure[];
}) {
  const t = useTranslations("schedule");
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [selectedProcName, setSelectedProcName] = useState("");
  const [duration, setDuration] = useState("30");
  const [paymentType, setPaymentType] = useState("private");
  const formRef = useRef<HTMLFormElement>(null);

  function handleOpen() {
    const first = procedures[0] ?? null;
    setSelectedProcName(first?.name ?? "");
    setDuration(String(first?.duration_minutes ?? 30));
    setPaymentType(first?.payment_type ?? "private");
    setError("");
    setOpen(true);
  }

  function handleProcChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const name = e.target.value;
    setSelectedProcName(name);
    const proc = procedures.find(p => p.name === name);
    if (proc) {
      setDuration(String(proc.duration_minutes));
      setPaymentType(proc.payment_type);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const formData = new FormData(formRef.current!);
    setError("");
    startTransition(async () => {
      const result = await createAppointment(formData);
      if (result?.error) { setError(actionErrorMessage(t, result.code)); return; }
      setOpen(false);
    });
  }

  return (
    <>
      <button onClick={handleOpen} className="flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-700 transition shadow-sm">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-4 w-4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        {t("newAppt")}
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} title={t("newAppt")}>
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          <div>
            <FieldLabel>{t("patientName")} *</FieldLabel>
            <Input name="patient_name" required list="patient-list" placeholder={t("patientNamePlaceholder")} />
            <datalist id="patient-list">
              {patients.map(p => <option key={p.id} value={p.full_name} />)}
            </datalist>
          </div>

          <div>
            <FieldLabel>{t("procedure")} *</FieldLabel>
            {procedures.length === 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs text-amber-700">
                {t("noProcedures")}{" "}
                <a href="/dashboard/settings" className="font-semibold underline underline-offset-2">
                  {t("addProcSettings")}
                </a>{" "}
                {t("beforeScheduling")}
              </div>
            ) : (
              <Select name="consultation_type" value={selectedProcName} onChange={handleProcChange} required>
                {procedures.map(p => (
                  <option key={p.id} value={p.name}>
                    {p.name}{p.price ? ` · R$ ${p.price.toFixed(2)}` : ""}
                  </option>
                ))}
              </Select>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>{t("date")} *</FieldLabel>
              <Input name="date" type="date" required defaultValue={defaultDate} />
            </div>
            <div>
              <FieldLabel>{t("startTime")} *</FieldLabel>
              <Input name="start_time" type="time" required defaultValue="09:00" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>{t("duration")}</FieldLabel>
              <Input
                name="duration_minutes"
                type="number"
                min="5"
                max="480"
                value={duration}
                onChange={e => setDuration(e.target.value)}
              />
            </div>
            <div>
              <FieldLabel>{t("type")}</FieldLabel>
              <Select name="type">
                <option value="in-person">{t("inPerson")}</option>
                <option value="online">{t("online")}</option>
              </Select>
            </div>
          </div>

          <div>
            <FieldLabel>{t("payment")}</FieldLabel>
            <Select name="payment_type" value={paymentType} onChange={e => setPaymentType(e.target.value)}>
              <option value="private">{t("private")}</option>
              <option value="insurance">{t("insurance")}</option>
            </Select>
          </div>

          <div>
            <FieldLabel>{t("notes")}</FieldLabel>
            <textarea name="notes" rows={2} placeholder={t("notesPlaceholder")} className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 resize-none" />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setOpen(false)} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">{t("cancel")}</button>
            <button type="submit" disabled={pending || procedures.length === 0} className="flex-1 rounded-xl bg-teal-600 py-2.5 text-sm font-bold text-white hover:bg-teal-700 transition disabled:opacity-60">
              {pending ? t("saving") : t("saveAppt")}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

export function BlockTimeButton({ defaultDate }: { defaultDate: string }) {
  const t = useTranslations("schedule");
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const formData = new FormData(formRef.current!);
    setError("");
    startTransition(async () => {
      const result = await blockTime(formData);
      if (result?.error) { setError(actionErrorMessage(t, result.code)); return; }
      setOpen(false);
      formRef.current?.reset();
    });
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
        {t("blockTime")}
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} title={t("blockTime")}>
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>{t("date")} *</FieldLabel>
              <Input name="date" type="date" required defaultValue={defaultDate} />
            </div>
            <div>
              <FieldLabel>{t("startTime")} *</FieldLabel>
              <Input name="start_time" type="time" required defaultValue="12:00" />
            </div>
          </div>
          <div>
            <FieldLabel>{t("duration")}</FieldLabel>
            <Select name="duration_minutes">
              <option value="30">{t("dur30")}</option>
              <option value="60">{t("dur60")}</option>
              <option value="90">{t("dur90")}</option>
              <option value="120">{t("dur120")}</option>
              <option value="240">{t("dur240")}</option>
            </Select>
          </div>
          <div>
            <FieldLabel>{t("reason")}</FieldLabel>
            <Input name="reason" placeholder={t("reasonPlaceholder")} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setOpen(false)} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">{t("cancel")}</button>
            <button type="submit" disabled={pending} className="flex-1 rounded-xl bg-slate-700 py-2.5 text-sm font-bold text-white hover:bg-slate-800 transition disabled:opacity-60">
              {pending ? t("saving") : t("blockTime")}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

export function PixQrButton({
  pixKey,
  clinicName,
  clinicCity,
  amount,
}: {
  pixKey: string;
  clinicName: string;
  clinicCity: string;
  amount?: number;
}) {
  const [open, setOpen] = useState(false);
  const pixStr = generatePixString(pixKey, clinicName, clinicCity, amount);
  const qrUrl = pixQrUrl(pixStr);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Pix QR Code"
        className="rounded-lg p-1.5 text-teal-500 hover:bg-teal-50 transition"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4">
          <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
          <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="3" height="3" rx="0.5"/>
          <rect x="19" y="14" width="2" height="2" rx="0.5"/><rect x="14" y="19" width="2" height="2" rx="0.5"/>
          <rect x="18" y="18" width="3" height="3" rx="0.5"/>
        </svg>
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} title="Pix QR Code">
        <div className="flex flex-col items-center gap-4">
          <img src={qrUrl} alt="Pix QR Code" width={200} height={200} className="rounded-xl border border-slate-100" />
          <div className="w-full">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Copia e Cola</p>
            <div className="relative">
              <textarea
                readOnly
                value={pixStr}
                rows={3}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs text-slate-600 font-mono resize-none focus:outline-none"
              />
              <button
                onClick={() => navigator.clipboard.writeText(pixStr)}
                className="absolute top-2 right-2 rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200 transition"
              >
                Copiar
              </button>
            </div>
          </div>
        </div>
      </Dialog>
    </>
  );
}
