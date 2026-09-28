import { getTranslations } from "next-intl/server";
import { SignupCta } from "@/components/SignupCta";
import { Link } from "@/i18n/navigation";
import { liveFeatures } from "@/lib/liveFeatures";
import { getPlanPrice } from "@/lib/subscription";

// The Thai positioning on the Thai home (Sprint TH, TH-8): shown only for
// locale th from the Thai release on. Blocks claiming a feature appear
// only once it's live (lib/liveFeatures); the price comes from the same
// table as checkout.
const BLOCKS = [
  { key: "b1", live: true },
  { key: "b2", live: liveFeatures.promptPay },
  { key: "b3", live: true },
  { key: "b4", live: true },
  { key: "b5", live: liveFeatures.lineReminders },
  { key: "b6", live: liveFeatures.pdpa },
] as const;

export async function ThaiLandingSection() {
  const t = await getTranslations("thLanding");
  const blocks = BLOCKS.filter((b) => b.live);
  return (
    <section className="border-b border-slate-100 bg-white py-20">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mb-12 text-center">
          <h2 className="mb-4 text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">{t("title")}</h2>
          <p className="mx-auto max-w-2xl text-slate-500">{t("subtitle")}</p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {blocks.map((b) => (
            <div key={b.key} className="rounded-2xl border border-slate-100 bg-white p-7 shadow-sm">
              <h3 className="mb-2 text-lg font-bold text-slate-900">{t(`${b.key}.title`)}</h3>
              <p className="text-sm leading-relaxed text-slate-500">{t(`${b.key}.text`)}</p>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-center gap-4 text-center">
          <Link href="/pricing" className="text-lg font-bold text-teal-700 hover:underline">
            {t("price", { price: getPlanPrice("TH").amount })}
          </Link>
          <SignupCta
            label={t("cta")}
            className="inline-block rounded-xl bg-teal-600 px-8 py-4 text-lg font-bold text-white shadow-lg transition hover:bg-teal-700"
          />
        </div>
      </div>
    </section>
  );
}
