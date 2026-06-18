"use client";

export function ReloadButton({ label }: { label: string }) {
  return (
    <button
      onClick={() => window.location.reload()}
      className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-8 py-3.5 text-sm font-bold text-white shadow hover:bg-teal-700 transition"
    >
      {label}
    </button>
  );
}
