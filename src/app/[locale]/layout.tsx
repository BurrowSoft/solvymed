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
import { ConsentBanner } from "@/components/ConsentBanner";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { isPublicLocale, publicLocales } from "@/lib/publicLocales";
import { pickMessages } from "@/lib/pickMessages";
import "../globals.css";

const inter   = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });
const sarabun = Sarabun({ subsets: ["thai", "latin"], weight: ["400", "600", "700"], display: "swap", variable: "--font-sarabun" });
const notoJP  = Noto_Sans_JP({ subsets: ["latin"], weight: ["400", "700"], display: "swap", variable: "--font-noto-jp" });
const notoSC  = Noto_Sans_SC({ subsets: ["latin"], weight: ["400", "700"], display: "swap", variable: "--font-noto-sc" });
const notoTC  = Noto_Sans_TC({ subsets: ["latin"], weight: ["400", "700"], display: "swap", variable: "--font-noto-tc" });
const notoKR  = Noto_Sans_KR({ subsets: ["latin"], weight: ["400", "700"], display: "swap", variable: "--font-noto-kr" });
const notoAR  = Noto_Sans_Arabic({ subsets: ["arabic"], weight: ["400", "700"], display: "swap", variable: "--font-noto-ar" });

// Inter has Latin glyphs only; the locale's font follows it in the stack,
// so its script (Thai, CJK, Arabic) renders in that font, per glyph.
const LOCALE_FONT: Record<string, typeof inter> = {
  th:      sarabun,
  ja:      notoJP,
  zh:      notoSC,
  "zh-TW": notoTC,
  ko:      notoKR,
  ar:      notoAR,
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
  // Only offered languages (Thai stays out until the Thai release).
  const languages = Object.fromEntries(
    publicLocales().map((l) => [l, l === "en" ? `${BASE}/` : `${BASE}/${l}/`])
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
    // A hidden language (Thai before its release) is reachable but not indexed.
    robots: isPublicLocale(locale) ? { index: true, follow: true } : { index: false, follow: false },
    icons: {
      // The brand kit's favicon/ (Vitor, 1.4.0).
      icon: [{ url: "/favicon.ico" }, { url: "/favicon-32.png", type: "image/png", sizes: "32x32" }],
      apple: "/apple-touch-icon.png",
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
  const localeFont = LOCALE_FONT[locale];
  const fontClass = `${inter.variable} ${localeFont?.variable ?? ""}`.trim();
  // Each next/font family is "'Name', 'Name Fallback'". The fallbacks are
  // size-adjusted local fonts covering all of Unicode ("Inter Fallback" is
  // Arial, which has Arabic), so the locale font must come before them:
  // Inter, <locale font>, Inter Fallback, <locale fallback>, generics.
  // Otherwise Arabic rendered in Arial instead of Noto Sans Arabic.
  const [interFont, interFallback] = inter.style.fontFamily.split(",").map((s) => s.trim());
  const [localeName, localeFallback] = localeFont ? localeFont.style.fontFamily.split(",").map((s) => s.trim()) : [];
  const fontFamily = [interFont, localeName, interFallback, localeFallback, "ui-sans-serif", "system-ui", "sans-serif"]
    .filter(Boolean)
    .join(", ");

  return (
    <html lang={locale} dir={locale === "ar" ? "rtl" : "ltr"} className={fontClass}>
      <body style={{ fontFamily }} className="min-h-screen bg-white text-slate-900 antialiased">
        {/* Each route group gives its client components the messages they
            need: (site) all of them, /help only a few (the page source
            must not carry strings like the subscription copy, store
            rules). The cookie banner gets just its own. */}
        {children}
        <NextIntlClientProvider locale={locale} messages={pickMessages(messages, ["consent"])}>
          <ConsentBanner />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
