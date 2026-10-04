import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (k: string) => `founders.${k}`,
  setRequestLocale: () => {},
}));

// UX (1 Oct): /founders shares with the brand kit's blue banner (1200×630).
describe("the Founders share preview", () => {
  it("openGraph + twitter carry the banner, with the page's own title", async () => {
    const { generateMetadata } = await import("@/app/[locale]/(site)/founders/page");
    const m = await generateMetadata({ params: Promise.resolve({ locale: "pt-BR" }) });
    const og = m.openGraph as { images: { url: string; width: number; height: number }[]; title: string; locale: string };
    expect(og.images[0]).toMatchObject({ url: "/og/solvymed-og-share-blue-pt-BR.png?v=2026-10-05", width: 1200, height: 630 });
    expect(og.title).toBe("founders.metaTitle");
    expect(og.locale).toBe("pt_BR");
    expect(m.twitter).toMatchObject({ card: "summary_large_image", images: [{ url: "/og/solvymed-og-share-blue-pt-BR.png?v=2026-10-05", alt: "founders.metaTitle" }] });
    expect(m.alternates).toMatchObject({
      canonical: "https://www.solvymed.com/pt-BR/founders",
      languages: { en: "https://www.solvymed.com/founders", th: "https://www.solvymed.com/th/founders", "x-default": "https://www.solvymed.com/founders" },
    });
  });

  it("the rules page shares the same banner, with its own title and URL (UX)", async () => {
    const { generateMetadata } = await import("@/app/[locale]/(site)/founders/rules/page");
    const m = await generateMetadata({ params: Promise.resolve({ locale: "th" }) });
    const og = m.openGraph as { images: { url: string }[]; title: string; url: string };
    expect(og.images[0].url).toBe("/og/solvymed-og-share-blue-th.png?v=2026-10-05");
    expect(og.title).toBe("founders.rulesTitle");
    expect(og.url).toBe("https://www.solvymed.com/th/founders/rules");
    // Its own canonical, never the home page's (3e), and its own hreflang
    // set in every offered language (UX: shared in three markets).
    expect(m.alternates).toMatchObject({
      canonical: "https://www.solvymed.com/th/founders/rules",
      languages: {
        "pt-BR": "https://www.solvymed.com/pt-BR/founders/rules",
        en: "https://www.solvymed.com/founders/rules",
        th: "https://www.solvymed.com/th/founders/rules",
        "x-default": "https://www.solvymed.com/founders/rules",
      },
    });
    expect(m.twitter).toMatchObject({ card: "summary_large_image" });
  });

  it("the image file is in public/ and is a PNG", () => {
    const p = join(process.cwd(), "public", "og", "solvymed-og-share-blue.png");
    expect(existsSync(p)).toBe(true);
    expect(readFileSync(p).subarray(1, 4).toString()).toBe("PNG");
  });
});
