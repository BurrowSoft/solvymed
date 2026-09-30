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
    expect(og.images[0]).toMatchObject({ url: "/og/solvymed-og-share-blue.png", width: 1200, height: 630 });
    expect(og.title).toBe("founders.metaTitle");
    expect(og.locale).toBe("pt_BR");
    expect(m.twitter).toMatchObject({ card: "summary_large_image", images: ["/og/solvymed-og-share-blue.png"] });
  });

  it("the rules page shares the same banner, with its own title and URL (UX)", async () => {
    const { generateMetadata } = await import("@/app/[locale]/(site)/founders/rules/page");
    const m = await generateMetadata({ params: Promise.resolve({ locale: "th" }) });
    const og = m.openGraph as { images: { url: string }[]; title: string; url: string };
    expect(og.images[0].url).toBe("/og/solvymed-og-share-blue.png");
    expect(og.title).toBe("founders.rulesTitle");
    expect(og.url).toBe("https://www.solvymed.com/th/founders/rules");
    // Its own canonical, never the home page's (3e).
    expect(m.alternates).toMatchObject({ canonical: "https://www.solvymed.com/th/founders/rules" });
    expect(m.twitter).toMatchObject({ card: "summary_large_image" });
  });

  it("the image file is in public/ and is a PNG", () => {
    const p = join(process.cwd(), "public", "og", "solvymed-og-share-blue.png");
    expect(existsSync(p)).toBe(true);
    expect(readFileSync(p).subarray(1, 4).toString()).toBe("PNG");
  });
});
