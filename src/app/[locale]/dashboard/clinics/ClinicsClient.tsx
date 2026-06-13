"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { addClinic, deleteClinic } from "./actions";

type Clinic = {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  phone?: string | null;
  lat?: number | null;
  lng?: number | null;
};

export function ClinicsClient({ clinics: initial }: { clinics: Clinic[] }) {
  const router = useRouter();
  const [clinics, setClinics] = useState(initial);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleAdd(formData: FormData) {
    setError("");
    startTransition(async () => {
      const result = await addClinic(formData);
      if (result.error) {
        setError(result.error);
      } else {
        formRef.current?.reset();
        setShowForm(false);
        router.refresh();
      }
    });
  }

  function handleDelete(id: string) {
    setDeletingId(id);
    startTransition(async () => {
      const result = await deleteClinic(id);
      if (!result.error) {
        setClinics((prev) => prev.filter((c) => c.id !== id));
      }
      setDeletingId(null);
    });
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">My Clinics</h1>
          <p className="text-sm text-slate-500 mt-0.5">Clinics you manage are visible to patients in the app</p>
        </div>
        <button
          onClick={() => { setShowForm((v) => !v); setError(""); }}
          className="flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm shadow-teal-600/20 hover:bg-teal-700 transition active:scale-95"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add Clinic
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="rounded-2xl border border-teal-100 bg-teal-50/40 p-5">
          <h2 className="text-base font-bold text-slate-900 mb-4">New clinic</h2>
          {error && (
            <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}
          <form ref={formRef} action={handleAdd} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-1">Clinic name <span className="text-red-400">*</span></label>
              <input name="name" required placeholder="e.g. Central Health Clinic" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-1">Address</label>
              <input name="address" placeholder="Street address" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">City</label>
              <input name="city" placeholder="City" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">State / Province</label>
              <input name="state" placeholder="State" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Country</label>
              <input name="country" placeholder="Country" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Phone</label>
              <input name="phone" type="tel" placeholder="+1 555 000 0000" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20" />
            </div>
            <p className="sm:col-span-2 text-xs text-slate-400">
              📍 Location on the map is detected automatically from the address you provide.
            </p>
            <div className="sm:col-span-2 flex items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={isPending}
                className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-teal-700 transition disabled:opacity-60"
              >
                {isPending ? "Saving…" : "Save clinic"}
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); setError(""); }}
                className="text-sm text-slate-500 hover:text-slate-700 transition"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Empty state */}
      {clinics.length === 0 && !showForm && (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7 text-slate-400">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
            </svg>
          </div>
          <p className="font-semibold text-slate-700">No clinics yet</p>
          <p className="text-sm text-slate-400 mt-1 mb-5">Add your clinic so patients can find you</p>
          <button
            onClick={() => setShowForm(true)}
            className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-teal-700 transition"
          >
            Add your first clinic
          </button>
        </div>
      )}

      {/* Clinic cards */}
      <div className="space-y-3">
        {clinics.map((clinic) => (
          <div key={clinic.id} className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-100 p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="font-bold text-slate-900">{clinic.name}</h3>
                <p className="text-sm text-slate-500 mt-0.5">
                  {[clinic.address, clinic.city, clinic.state, clinic.country].filter(Boolean).join(", ") || "No address"}
                </p>
                {clinic.phone && (
                  <p className="text-xs text-slate-400 mt-0.5">{clinic.phone}</p>
                )}
                <div className="mt-2 flex items-center gap-1.5">
                  {clinic.lat && clinic.lng ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-xs text-teal-600 font-medium">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                      </svg>
                      On map
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-xs text-slate-400">
                      No map pin — add an address to appear on the map
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleDelete(clinic.id)}
                disabled={deletingId === clinic.id || isPending}
                title="Delete clinic"
                className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-500 transition disabled:opacity-40"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
