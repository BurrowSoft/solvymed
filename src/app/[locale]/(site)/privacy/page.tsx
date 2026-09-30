import { turnstileEnabled } from "@/lib/turnstile";
import { conditionMet } from "@/lib/conditions";
import { liveFeatures } from "@/lib/liveFeatures";
import { LegalDoc, legalLangFor } from "@/components/LegalDoc";
import { PrivacyEn } from "./PrivacyEn";
import { PrivacyPtBR } from "./PrivacyPtBR";
import { legalDateLabel, PRIVACY_VERSION } from "@/lib/legalVersions";

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  // The Turnstile row shows only while it's switched on (site key set), and
  // the SolvyAI / LINE blocks only once those features are live
  // (content/help/conditions.json), so the policy matches what runs.
  const solvyai = conditionMet("solvyai-live");
  const line = conditionMet("line-live");
  // The Founders Program section only while its page is live.
  const founders = liveFeatures.founders;
  // The test-export paragraph: only once uploads are live (132 + the purge).
  const founderUploads = founders && conditionMet("founders-upload-live");
  return legalLangFor(locale) === "pt-BR" ? (
    <LegalDoc locale={locale} title="Política de Privacidade" updated={`Última atualização: ${legalDateLabel("pt-BR", PRIVACY_VERSION)}`}>
      <PrivacyPtBR turnstile={turnstileEnabled} solvyai={solvyai} line={line} founders={founders} founderUploads={founderUploads} />
    </LegalDoc>
  ) : (
    <LegalDoc locale={locale} title="Privacy Policy" updated={`Last updated: ${legalDateLabel("en", PRIVACY_VERSION)}`}>
      <PrivacyEn turnstile={turnstileEnabled} solvyai={solvyai} line={line} founders={founders} founderUploads={founderUploads} />
    </LegalDoc>
  );
}
