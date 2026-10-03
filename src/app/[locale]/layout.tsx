import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import { ConsentBanner } from "@/components/ConsentBanner";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { isPublicLocale, publicLocales } from "@/lib/publicLocales";
import { pickMessages } from "@/lib/pickMessages";
import "../globals.css";

// Self-hosted (src/app/fonts: the official Google Fonts files, OFL licences
// beside them): the build no longer fetches fonts.google.com, which failed
// twice on 2 Oct and would block a deploy (e7, 9a). Same families, weights,
// CSS variables and display: swap as the next/font/google setup before.
// Inter: the Latin variable font (100–900).
const inter = localFont({
  src: "../fonts/inter-latin-var.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-inter",
});
// Sarabun: the Thai glyphs (400/600/700). Latin is Inter's, first in the
// stack, so Sarabun's own Latin files were never used.
const sarabun = localFont({
  src: [
    { path: "../fonts/sarabun-thai-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/sarabun-thai-600.woff2", weight: "600", style: "normal" },
    { path: "../fonts/sarabun-thai-700.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-sarabun",
});

// Inter has Latin glyphs only; the locale's font follows it in the stack,
// so its script (Thai) renders in that font, per glyph. Since country-first
// (1 Oct) the CJK and Arabic languages are retired: every path under them
// redirects (308) before rendering, so their fonts are no longer loaded.
const LOCALE_FONT: Record<string, typeof inter> = {
  th: sarabun,
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

  // In the page's language (e7, 3 Oct): a descriptive title for search, and
  // the slogan ("Your practice, your brand.") first in the share previews.
  const t = await getTranslations({ locale, namespace: "siteMeta" });
  return {
    metadataBase: new URL(BASE),
    title: {
      default: t("title"),
      template: "%s | SolvyMed",
    },
    description: t("description"),
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
      siteName: "SolvyMed",
      title: t("title"),
      description: t("socialDescription"),
    },
    twitter: {
      card: "summary_large_image",
      title: t("title"),
      description: t("socialDescription"),
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
  // size-adjusted local fonts covering much of Unicode (Arial), so the
  // locale font must come before them: Inter, <locale font>, Inter
  // Fallback, <locale fallback>, generics (else Thai rendered in Arial).
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
