import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (k: string) => k,
  setRequestLocale: () => {},
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
// The layout's Google fonts: stubs.
vi.mock("next/font/google", () => {
  const font = () => ({ variable: "", className: "", style: { fontFamily: "" } });
  return { Inter: font, Sarabun: font, Noto_Sans_JP: font, Noto_Sans_SC: font, Noto_Sans_TC: font, Noto_Sans_KR: font, Noto_Sans_Arabic: font };
});
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));

import { localeAlternates, localizedUrl } from "@/lib/seo";

// 3e: pages without their own alternates inherited the layout's, i.e. the
// HOME page's canonical + hreflang (/pt-BR/privacy → canonical /pt-BR/).
// Every localized public page now has its own; the layout has none.
const PAGES: [string, string, () => Promise<{ generateMetadata: (a: never) => Promise<{ alternates?: unknown }> }>][] = [
  ["home", "", () => import("@/app/[locale]/(site)/page") as never],
  ["pricing", "/pricing", () => import("@/app/[locale]/(site)/pricing/page") as never],
  ["privacy", "/privacy", () => import("@/app/[locale]/(site)/privacy/page") as never],
  ["terms", "/terms", () => import("@/app/[locale]/(site)/terms/page") as never],
  ["help", "/help", () => import("@/app/[locale]/help/page") as never],
];

describe("each page's canonical is its own URL", () => {
  for (const [name, path, load] of PAGES) {
    it(name, async () => {
      const { generateMetadata } = await load();
      for (const locale of ["en", "pt-BR", "th"]) {
        const m = await generateMetadata({ params: Promise.resolve({ locale }) } as never);
        const alt = m.alternates as { canonical: string; languages: Record<string, string> };
        expect(alt.canonical).toBe(localizedUrl(locale, path));
        expect(alt.languages["x-default"]).toBe(localizedUrl("en", path));
        expect(alt.languages["pt-BR"]).toBe(localizedUrl("pt-BR", path));
        if (path) expect(alt.canonical).not.toBe(localizedUrl(locale, ""));
      }
    });
  }

  it("a help article: its own slug", async () => {
    const { HELP, articleSlug } = await import("@/lib/help");
    const a = HELP[0].articles[0];
    const { generateMetadata } = await import("@/app/[locale]/help/[slug]/page");
    const m = await generateMetadata({ params: Promise.resolve({ locale: "pt-BR", slug: articleSlug(a) }), searchParams: Promise.resolve({}) });
    expect((m.alternates as { canonical: string }).canonical).toBe(`https://www.solvymed.com/pt-BR/help/${articleSlug(a)}`);
  });

  it("the layout sets no canonical, hreflang or og:url for its pages", async () => {
    const { generateMetadata } = await import("@/app/[locale]/layout");
    const m = await generateMetadata({ params: Promise.resolve({ locale: "pt-BR" }) });
    expect(m.alternates).toBeUndefined();
    expect((m.openGraph as { url?: string }).url).toBeUndefined();
  });

  it("URLs: English unprefixed, the home page with its slash", () => {
    expect(localizedUrl("en", "")).toBe("https://www.solvymed.com/");
    expect(localizedUrl("pt-BR", "")).toBe("https://www.solvymed.com/pt-BR/");
    expect(localizedUrl("en", "/privacy")).toBe("https://www.solvymed.com/privacy");
    expect(localizedUrl("th", "/terms")).toBe("https://www.solvymed.com/th/terms");
    expect(localeAlternates("en", "/terms").languages).toHaveProperty("x-default", "https://www.solvymed.com/terms");
  });
});
