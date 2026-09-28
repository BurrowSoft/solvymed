import { LegalDoc, legalLangFor } from "@/components/LegalDoc";
import { TermsEn } from "./TermsEn";
import { TermsPtBR } from "./TermsPtBR";
import { legalDateLabel, TERMS_VERSION } from "@/lib/legalVersions";

export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return legalLangFor(locale) === "pt-BR" ? (
    <LegalDoc locale={locale} title="Termos de Uso" updated={`Última atualização: ${legalDateLabel("pt-BR", TERMS_VERSION)}`}>
      <TermsPtBR />
    </LegalDoc>
  ) : (
    <LegalDoc locale={locale} title="Terms of Service" updated={`Last updated: ${legalDateLabel("en", TERMS_VERSION)}`}>
      <TermsEn />
    </LegalDoc>
  );
}
