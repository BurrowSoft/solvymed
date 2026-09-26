import Link from "next/link";

// The one trial indicator (first-run spec §4, UX 2026-09-26): a small chip
// at the top of every dashboard page, for a doctor on trial only. Neutral
// normally; amber and more direct in the last 3 days, red on the last day.
export function TrialChip({ daysLeft, locale, text }: { daysLeft: number; locale: string; text: string }) {
  const tone =
    daysLeft <= 1
      ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
      : daysLeft <= 3
        ? "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50";
  return (
    <Link
      href={`/${locale === "en" ? "" : locale + "/"}subscribe`}
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold shadow-sm transition ${tone}`}
    >
      {text}
    </Link>
  );
}

// The chip's message key (subscription namespace) and its count: "See plan"
// wording above 3 days, "Subscribe" wording at 3 days or fewer.
export function trialChipMessage(daysLeft: number): { key: "chipDays" | "chipUrgentDays" | "chipLastDay"; n: number } {
  if (daysLeft <= 1) return { key: "chipLastDay", n: 1 };
  return { key: daysLeft <= 3 ? "chipUrgentDays" : "chipDays", n: daysLeft };
}
