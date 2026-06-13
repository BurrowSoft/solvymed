"use client";

import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { ClinicListing } from "./page";

const ClinicMap = dynamic(
  () => import("./ClinicMap").then((m) => ({ default: m.ClinicMap })),
  { ssr: false, loading: () => <div className="flex h-[480px] items-center justify-center rounded-2xl bg-slate-100 text-slate-400 text-sm">Loading map…</div> },
);

type Props = { clinics: ClinicListing[] };

export function DiscoverClient({ clinics }: Props) {
  const { locale } = useParams<{ locale: string }>();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"list" | "map">("list");
  const [selected, setSelected] = useState<ClinicListing | null>(null);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    const prefix = locale === "en" ? "" : `/${locale}`;
    router.push(`${prefix}/auth/login`);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clinics;
    return clinics.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.city?.toLowerCase().includes(q) ||
        c.state?.toLowerCase().includes(q) ||
        c.professionals.some(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.specialty?.toLowerCase().includes(q),
        ),
    );
  }, [clinics, search]);

  function handleMapSelect(clinic: ClinicListing) {
    setView("list");
    setSelected(clinic.id === selected?.id ? null : clinic);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 py-6">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-600">
                <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                </svg>
              </div>
              <span className="text-lg font-extrabold text-slate-900">SolvyMed</span>
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Sign out
            </button>
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 mt-3 mb-1">Find a clinic</h1>
          <p className="text-slate-500 text-sm mb-4">Search by clinic name, city, doctor, or specialty</p>

          {/* Search */}
          <div className="relative">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search clinics, doctors, specialties…"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-3 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </div>
        </div>
      </div>

      {/* View toggle + results */}
      <div className="mx-auto max-w-3xl px-4 py-4">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-slate-500">
            {filtered.length === 0
              ? "No clinics found"
              : `${filtered.length} clinic${filtered.length === 1 ? "" : "s"} found`}
          </p>
          <div className="flex rounded-lg border border-slate-200 bg-white overflow-hidden text-sm">
            <button
              onClick={() => setView("list")}
              className={`px-3 py-1.5 flex items-center gap-1.5 transition ${view === "list" ? "bg-teal-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
              List
            </button>
            <button
              onClick={() => setView("map")}
              className={`px-3 py-1.5 flex items-center gap-1.5 transition border-l border-slate-200 ${view === "map" ? "bg-teal-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                <line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" />
              </svg>
              Map
            </button>
          </div>
        </div>

        {/* Map view */}
        {view === "map" && (
          <div className="h-[480px] mb-4 overflow-hidden rounded-2xl shadow-sm ring-1 ring-slate-100">
            <ClinicMap clinics={filtered} onSelect={handleMapSelect} />
          </div>
        )}

        {/* List view */}
        {view === "list" && (
          <div className="space-y-3">
            {filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-10 w-10 mb-3 text-slate-300">
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                </svg>
                <p className="font-medium text-slate-500">No clinics match your search</p>
                <button onClick={() => setSearch("")} className="mt-2 text-sm text-teal-600 hover:underline">Clear search</button>
              </div>
            )}

            {filtered.map((clinic) => (
              <div
                key={clinic.id}
                className={`rounded-2xl bg-white shadow-sm ring-1 transition ${selected?.id === clinic.id ? "ring-teal-400 shadow-teal-100" : "ring-slate-100"}`}
              >
                <button
                  className="w-full text-left p-5"
                  onClick={() => setSelected(selected?.id === clinic.id ? null : clinic)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="font-bold text-slate-900 text-base leading-snug">{clinic.name}</h2>
                      {(clinic.city || clinic.address) && (
                        <p className="text-sm text-slate-500 mt-0.5">
                          {[clinic.address, clinic.city, clinic.state].filter(Boolean).join(", ")}
                        </p>
                      )}
                      {clinic.phone && (
                        <p className="text-xs text-slate-400 mt-0.5">{clinic.phone}</p>
                      )}
                    </div>
                    <svg
                      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                      className={`h-4 w-4 shrink-0 mt-1 text-slate-400 transition-transform ${selected?.id === clinic.id ? "rotate-180" : ""}`}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>

                  {/* Doctors preview (always visible) */}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {clinic.professionals.slice(0, 3).map((p) => (
                      <span key={p.id} className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1 text-xs text-slate-600 border border-slate-100">
                        <span className="h-5 w-5 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-bold text-[10px] shrink-0">
                          {p.name.charAt(0)}
                        </span>
                        {p.specialty ? `${p.name.split(" ")[0]} · ${p.specialty}` : p.name.split(" ")[0]}
                      </span>
                    ))}
                    {clinic.professionals.length > 3 && (
                      <span className="inline-flex items-center rounded-full bg-slate-50 px-2.5 py-1 text-xs text-slate-400 border border-slate-100">
                        +{clinic.professionals.length - 3} more
                      </span>
                    )}
                  </div>
                </button>

                {/* Expanded: full doctor list + book CTA */}
                {selected?.id === clinic.id && (
                  <div className="border-t border-slate-100 px-5 pb-5 pt-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">Healthcare providers</p>
                    <div className="space-y-2 mb-4">
                      {clinic.professionals.map((p) => (
                        <div key={p.id} className="flex items-center gap-3">
                          {p.photoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.photoUrl} alt={p.name} className="h-9 w-9 rounded-full object-cover" />
                          ) : (
                            <div className="h-9 w-9 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-bold text-sm shrink-0">
                              {p.name.charAt(0)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-800">{p.name}</p>
                            {p.specialty && <p className="text-xs text-slate-500">{p.specialty}</p>}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Book CTA */}
                    <div className="rounded-xl bg-teal-50 p-4 text-center">
                      <p className="text-sm font-semibold text-teal-800 mb-1">Book an appointment</p>
                      <p className="text-xs text-teal-600 mb-3">Download the SolvyMed app to schedule with this clinic</p>
                      <div className="flex justify-center gap-2">
                        <a
                          href="https://apps.apple.com/app/solvymed/id000000000"
                          className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition"
                        >
                          <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 shrink-0">
                            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                          </svg>
                          App Store
                        </a>
                        <a
                          href="https://play.google.com/store/apps/details?id=com.burrowsoft.solvymed"
                          className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition"
                        >
                          <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 shrink-0">
                            <path d="M3.18 23.76c.31.17.67.19 1.01.08l11.7-6.76-2.46-2.46-10.25 9.14zM.54 1.96C.2 2.3 0 2.84 0 3.54v16.92c0 .7.2 1.24.54 1.58l.08.08 9.47-9.47v-.22L.62 1.88l-.08.08zM20.42 10.3l-2.67-1.54-2.75 2.75 2.75 2.75 2.68-1.55c.76-.44.76-1.15-.01-1.41zM4.19.16L15.89 6.92 13.43 9.38 3.18.24 4.19.16z"/>
                          </svg>
                          Google Play
                        </a>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
