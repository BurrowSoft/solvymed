import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { staffContext } from "@/lib/patientChannel/staff";
import { resolvedReportLive } from "@/lib/patientChannel/resolvedReport";
import { ResolvedReport } from "@/components/patientChannel/ResolvedReport";

// Item 43: "Resolvidas sem mensagem" from the inbox (the inbox link), for the doctor and a
// secretary with "sees all" (272's pc_selfserve_report refuses anyone else; the card then
// stays hidden). The doctor also has it in Settings → Canal do Paciente. Dark until
// pc-resolved-items-live.
export default async function PatientChannelResolvedPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!resolvedReportLive()) notFound();
  const { prefix, profId } = await staffContext(locale);
  const t = await getTranslations({ locale, namespace: "patientChannel" });
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl" data-testid="pc-resolved-page">
      <Link href={`${prefix}/dashboard/patient-channel`} className="text-sm font-semibold text-teal-700 hover:underline">← {t("inbox.title")}</Link>
      <ResolvedReport profId={profId} className="mt-4" />
    </div>
  );
}
