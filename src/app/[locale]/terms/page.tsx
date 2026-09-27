import { LegalDoc, legalLangFor } from "@/components/LegalDoc";
import { TermsEn } from "./TermsEn";
import { TermsPtBR } from "./TermsPtBR";

export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return legalLangFor(locale) === "pt-BR" ? (
    <LegalDoc locale={locale} title="Termos de Uso" updated="Última atualização: 28 de setembro de 2026">
      <TermsPtBR />
    </LegalDoc>
  ) : (
    <LegalDoc locale={locale} title="Terms of Service" updated="Last updated: September 28, 2026">
      <TermsEn />
    </LegalDoc>
  );
}
