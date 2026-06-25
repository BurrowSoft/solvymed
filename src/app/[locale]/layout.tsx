import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import {
  Inter,
  Sarabun,
  Noto_Sans_JP,
  Noto_Sans_SC,
  Noto_Sans_TC,
  Noto_Sans_KR,
  Noto_Sans_Arabic,
} from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { routing } from "@/i18n/routing";
import "../globals.css";

const inter   = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });
const sarabun = Sarabun({ subsets: ["thai", "latin"], weight: ["400", "600", "700"], display: "swap", variable: "--font-sarabun" });
const notoJP  = Noto_Sans_JP({ subsets: ["latin"], weight: ["400", "700"], display: "swap", variable: "--font-noto-jp" });
const notoSC  = Noto_Sans_SC({ subsets: ["latin"], weight: ["400", "700"], display: "swap", variable: "--font-noto-sc" });
const notoTC  = Noto_Sans_TC({ subsets: ["latin"], weight: ["400", "700"], display: "swap", variable: "--font-noto-tc" });
const notoKR  = Noto_Sans_KR({ subsets: ["latin"], weight: ["400", "700"], display: "swap", variable: "--font-noto-kr" });
const notoAR  = Noto_Sans_Arabic({ subsets: ["arabic"], weight: ["400", "700"], display: "swap", variable: "--font-noto-ar" });

const LOCALE_FONT: Record<string, string> = {
  th:      sarabun.variable,
  ja:      notoJP.variable,
  zh:      notoSC.variable,
  "zh-TW": notoTC.variable,
  ko:      notoKR.variable,
  ar:      notoAR.variable,
};

const BASE = "https://www.solvymed.com";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const canonical = locale === "en" ? `${BASE}/` : `${BASE}/${locale}/`;
  const languages = Object.fromEntries(
    routing.locales.map((l) => [l, l === "en" ? `${BASE}/` : `${BASE}/${l}/`])
  );
  languages["x-default"] = `${BASE}/`;

  return {
    metadataBase: new URL(BASE),
    title: {
      default: "Solvymed — Medical Practice Management",
      template: "%s | Solvymed",
    },
    description:
      "Solvymed is the all-in-one practice management app for healthcare professionals. Smart scheduling, patient records, prescriptions, and integrated payments — all in one place.",
    keywords: [
      "medical practice management",
      "appointment scheduling",
      "patient management",
      "clinical records",
      "digital prescriptions",
      "healthcare app",
      "medical billing",
    ],
    alternates: { canonical, languages },
    openGraph: {
      type: "website",
      locale: locale.replace("-", "_"),
      url: canonical,
      siteName: "Solvymed",
      title: "Solvymed — Medical Practice Management",
      description: "The all-in-one practice management app for healthcare professionals.",
    },
    twitter: {
      card: "summary_large_image",
      title: "Solvymed — Medical Practice Management",
      description: "The all-in-one practice management app for healthcare professionals.",
    },
    robots: { index: true, follow: true },
    icons: {
      icon: "/solvymed_logo.png",
      apple: "/solvymed_logo.png",
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0d9488",
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const messages = await getMessages();
  const fontClass = `${inter.variable} ${LOCALE_FONT[locale] ?? ""}`.trim();

  return (
    <html lang={locale} dir={locale === "ar" ? "rtl" : "ltr"} className={fontClass}>
      <body className="font-[family-name:var(--font-inter,ui-sans-serif)] min-h-screen bg-white text-slate-900 antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
          <Analytics />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
