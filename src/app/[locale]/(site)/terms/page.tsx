import { LegalDoc, legalLangFor } from "@/components/LegalDoc";
import { TermsEn } from "./TermsEn";
import { TermsPtBR } from "./TermsPtBR";
import { legalDateLabel, TERMS_VERSION } from "@/lib/legalVersions";
import type { Metadata } from "next";
import { localeAlternates } from "@/lib/seo";

// Its own canonical + hreflang (lib/seo; the layout sets none, 3e).
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { alternates: localeAlternates(locale, "/terms") };
}

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
