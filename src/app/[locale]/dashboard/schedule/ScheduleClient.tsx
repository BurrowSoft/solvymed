"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useTransition, useRef } from "react";
import { createAppointment, updateAppointmentStatus, deleteAppointment, blockTime } from "./actions";

type Patient = { id: string; full_name: string };
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

export function ScheduleNav({ currentDate }: { currentDate: string }) {
  const router = useRouter();
  const pathname = usePathname();

  function navigate(offset: number) {
    const d = new Date(currentDate + "T12:00:00");
    d.setDate(d.getDate() + offset);
    router.push(`${pathname}?date=${d.toISOString().split("T")[0]}`);
  }

  function goToday() {
    router.push(`${pathname}?date=${new Date().toISOString().split("T")[0]}`);
  }

  const formatted = new Date(currentDate + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const isToday = currentDate === new Date().toISOString().split("T")[0];

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
          Today
        </button>
      )}
    </div>
  );
}

export function AppointmentStatusSelect({ id, current }: { id: string; current: string }) {
  const [status, setStatus] = useState(current);
  const [pending, startTransition] = useTransition();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newStatus = e.target.value;
    setStatus(newStatus);
    startTransition(async () => { await updateAppointmentStatus(id, newStatus); });
  }

  return (
    <select
      value={status}
      onChange={handleChange}
      disabled={pending}
      className={`rounded-full px-3 py-1 text-xs font-semibold border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500/20 ${statusBadge(status)}`}
    >
      {STATUS_OPTIONS.map(s => (
        <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
      ))}
    </select>
  );
}

export function DeleteAppointmentButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm("Delete this appointment?")) return;
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

export function NewAppointmentButton({ patients, defaultDate }: { patients: Patient[]; defaultDate: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const formData = new FormData(formRef.current!);
    setError("");
    startTransition(async () => {
      const result = await createAppointment(formData);
      if (result?.error) { setError(result.error); return; }
      setOpen(false);
      formRef.current?.reset();
    });
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-700 transition shadow-sm">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-4 w-4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        New Appointment
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} title="New Appointment">
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          <div>
            <FieldLabel>Patient Name *</FieldLabel>
            <Input name="patient_name" required list="patient-list" placeholder="Start typing a name…" />
            <datalist id="patient-list">
              {patients.map(p => <option key={p.id} value={p.full_name} />)}
            </datalist>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Date *</FieldLabel>
              <Input name="date" type="date" required defaultValue={defaultDate} />
            </div>
            <div>
              <FieldLabel>Start Time *</FieldLabel>
              <Input name="start_time" type="time" required defaultValue="09:00" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Duration (min)</FieldLabel>
              <Select name="duration_minutes" defaultValue="30">
                <option value="15">15 min</option>
                <option value="30">30 min</option>
                <option value="45">45 min</option>
                <option value="60">60 min</option>
                <option value="90">90 min</option>
                <option value="120">120 min</option>
              </Select>
            </div>
            <div>
              <FieldLabel>Type</FieldLabel>
              <Select name="type">
                <option value="in-person">In-Person</option>
                <option value="online">Online</option>
              </Select>
            </div>
          </div>
          <div>
            <FieldLabel>Consultation Type</FieldLabel>
            <Select name="consultation_type">
              <option value="Consultation">Consultation</option>
              <option value="Follow-up">Follow-up</option>
              <option value="Exam Review">Exam Review</option>
              <option value="Procedure">Procedure</option>
              <option value="Emergency">Emergency</option>
            </Select>
          </div>
          <div>
            <FieldLabel>Payment</FieldLabel>
            <Select name="payment_type">
              <option value="private">Private</option>
              <option value="insurance">Insurance</option>
            </Select>
          </div>
          <div>
            <FieldLabel>Notes</FieldLabel>
            <textarea name="notes" rows={2} placeholder="Optional notes…" className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 resize-none" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setOpen(false)} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">Cancel</button>
            <button type="submit" disabled={pending} className="flex-1 rounded-xl bg-teal-600 py-2.5 text-sm font-bold text-white hover:bg-teal-700 transition disabled:opacity-60">
              {pending ? "Saving…" : "Save Appointment"}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

export function BlockTimeButton({ defaultDate }: { defaultDate: string }) {
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
      if (result?.error) { setError(result.error); return; }
      setOpen(false);
      formRef.current?.reset();
    });
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
        Block Time
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} title="Block Time">
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Date *</FieldLabel>
              <Input name="date" type="date" required defaultValue={defaultDate} />
            </div>
            <div>
              <FieldLabel>Start Time *</FieldLabel>
              <Input name="start_time" type="time" required defaultValue="12:00" />
            </div>
          </div>
          <div>
            <FieldLabel>Duration</FieldLabel>
            <Select name="duration_minutes">
              <option value="30">30 min</option>
              <option value="60">1 hour</option>
              <option value="90">1.5 hours</option>
              <option value="120">2 hours</option>
              <option value="240">4 hours</option>
            </Select>
          </div>
          <div>
            <FieldLabel>Reason (optional)</FieldLabel>
            <Input name="reason" placeholder="e.g. Lunch break, Meeting…" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setOpen(false)} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">Cancel</button>
            <button type="submit" disabled={pending} className="flex-1 rounded-xl bg-slate-700 py-2.5 text-sm font-bold text-white hover:bg-slate-800 transition disabled:opacity-60">
              {pending ? "Saving…" : "Block Time"}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
