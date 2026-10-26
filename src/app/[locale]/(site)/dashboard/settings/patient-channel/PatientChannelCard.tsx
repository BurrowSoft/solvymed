import Link from "next/link";
import { useTranslations } from "next-intl";

// Settings → the Patient Channel's entry (doctors; only while the patient_channel
// flag is on for them, settings/page.tsx).
export function PatientChannelCard({ href }: { href: string }) {
  const t = useTranslations("patientChannel");
  return (
    <section data-testid="pc-settings-card" className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div className="min-w-0">
        <h2 className="text-base font-bold text-slate-900">{t("title")}</h2>
        <p className="mt-0.5 text-sm text-slate-500">{t("entryText")}</p>
      </div>
      <Link href={href} className="shrink-0 rounded-xl border border-teal-600 px-4 py-2 text-center text-sm font-bold text-teal-700 hover:bg-teal-50">
        {t("entryOpen")}
      </Link>
    </section>
  );
}
