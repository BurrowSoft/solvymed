import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/local", () => ({ default: () => ({ variable: "font" }) }));
vi.mock("next-intl/server", () => ({
  getTranslations: async ({ locale }: { locale: string }) => (k: string) => `${locale}.${k}`,
  getMessages: async () => ({}),
  setRequestLocale: () => {},
}));

// UX (5 Oct): the site's share preview is the brand kit's blue banner with
// the slogan in the page's language: pt-BR and th their own, every other the English.
describe("the site's share image", () => {
  it.each([
    ["en", "/og/solvymed-og-share-blue.png?v=2026-10-05"],
    ["th", "/og/solvymed-og-share-blue-th.png?v=2026-10-05"],
    ["pt-BR", "/og/solvymed-og-share-blue-pt-BR.png?v=2026-10-05"],
  ])("%s → %s, 1200×630, alt = the title, on openGraph and twitter", async (locale, url) => {
    const { generateMetadata } = await import("@/app/[locale]/layout");
    const m = await generateMetadata({ params: Promise.resolve({ locale }) });
    const og = m.openGraph as { images: { url: string; width: number; height: number; alt: string }[] };
    expect(og.images).toEqual([{ url, width: 1200, height: 630, alt: `${locale}.title` }]);
    expect(m.twitter).toMatchObject({ card: "summary_large_image", images: [{ url, alt: `${locale}.title` }] });
  });

  it.each(["solvymed-og-share-blue.png", "solvymed-og-share-blue-pt-BR.png", "solvymed-og-share-blue-th.png"])("public/og/%s is a 1200×630 PNG", (f) => {
    const p = join(process.cwd(), "public", "og", f);
    expect(existsSync(p)).toBe(true);
    const b = readFileSync(p);
    expect(b.subarray(1, 4).toString()).toBe("PNG");
    expect([b.readUInt32BE(16), b.readUInt32BE(20)]).toEqual([1200, 630]);
  });
});
