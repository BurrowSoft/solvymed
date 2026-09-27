import { turnstileEnabled } from "@/lib/turnstile";
import { LegalDoc, legalLangFor } from "@/components/LegalDoc";
import { PrivacyEn } from "./PrivacyEn";
import { PrivacyPtBR } from "./PrivacyPtBR";

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  // The Turnstile row shows only while it's switched on (site key set), so
  // the policy matches what runs.
  return legalLangFor(locale) === "pt-BR" ? (
    <LegalDoc locale={locale} title="Política de Privacidade" updated="Última atualização: 28 de setembro de 2026">
      <PrivacyPtBR turnstile={turnstileEnabled} />
    </LegalDoc>
  ) : (
    <LegalDoc locale={locale} title="Privacy Policy" updated="Last updated: September 28, 2026">
      <PrivacyEn turnstile={turnstileEnabled} />
    </LegalDoc>
  );
}
