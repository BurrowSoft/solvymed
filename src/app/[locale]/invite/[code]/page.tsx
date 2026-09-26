import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AppDownloadButtons } from "@/components/AppDownloadButtons";

// The patient invite link the app shares (solvymed.com/invite/<code>). The
// steps name the app's own labels verbatim (mobile lib/i18n.ts).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "invitePage" });
  return { title: t("metaTitle") };
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ locale: string; code: string }>;
}) {
  const { locale, code } = await params;
  const t = await getTranslations({ locale, namespace: "invitePage" });
  const upperCode = code.toUpperCase();
  const bold = (chunks: React.ReactNode) => <strong>{chunks}</strong>;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-100 text-center">
        <div className="mb-4 text-4xl font-black text-teal-600">S</div>
        <h1 className="text-xl font-bold text-slate-800 mb-1">{t("heading")}</h1>
        <p className="text-sm text-slate-500 mb-6">{t("sub")}</p>

        <div className="bg-teal-50 rounded-xl px-6 py-4 mb-6">
          <p className="text-xs text-teal-600 font-semibold uppercase tracking-widest mb-1">{t("codeLabel")}</p>
          <p className="text-3xl font-mono font-bold tracking-widest text-teal-700">{upperCode}</p>
        </div>

        <ol className="text-left text-sm text-slate-600 space-y-2 mb-6">
          {(["step1", "step2", "step3"] as const).map((key, i) => (
            <li key={key} className="flex gap-2">
              <span className="font-bold text-teal-600 shrink-0">{i + 1}.</span>
              <span>{t.rich(key, { b: bold })}</span>
            </li>
          ))}
        </ol>

        <AppDownloadButtons medium="invite" tone="light" stacked showOpenApp={false} />
      </div>
    </div>
  );
}
