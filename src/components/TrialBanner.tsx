import Link from "next/link";

interface Props {
  daysLeft: number;
  locale: string;
  labels: { prefix: string; day: string; days: string; cta: string };
}

export function TrialBanner({ daysLeft, locale, labels }: Props) {
  const urgent = daysLeft <= 3;
  const dayWord = daysLeft === 1 ? labels.day : labels.days;
  const subscribeHref = `/${locale === "en" ? "" : locale + "/"}subscribe`;

  return (
    <div
      className={`flex items-center justify-between gap-4 px-4 py-2.5 text-sm font-medium ${
        urgent
          ? "bg-red-500 text-white"
          : "bg-amber-400 text-amber-900"
      }`}
    >
      <span>
        {labels.prefix} <strong>{daysLeft} {dayWord}</strong>
      </span>
      <Link
        href={subscribeHref}
        className={`shrink-0 rounded-lg px-4 py-1.5 text-xs font-bold transition ${
          urgent
            ? "bg-white text-red-600 hover:bg-red-50"
            : "bg-amber-900 text-amber-50 hover:bg-amber-800"
        }`}
      >
        {labels.cta}
      </Link>
    </div>
  );
}
