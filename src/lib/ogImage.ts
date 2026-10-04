// The share preview image (the brand kit's blue banner, 1200×630, with the
// slogan in the page's language; UX, 5 Oct). One banner per language that
// has its own; every other language gets the English one.
const BANNERS: Record<string, string> = {
  "pt-BR": "/og/solvymed-og-share-blue-pt-BR.png",
  th: "/og/solvymed-og-share-blue-th.png",
};
const DEFAULT_BANNER = "/og/solvymed-og-share-blue.png";
// Share previews are cached by URL (WhatsApp, Facebook, X): bump this
// whenever a banner file changes, so the new one is fetched (f0).
const VERSION = "2026-10-05";

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

export function ogShareImage(locale: string): string {
  return `${BANNERS[locale] ?? DEFAULT_BANNER}?v=${VERSION}`;
}

// openGraph.images / twitter.images for a page titled `alt`.
export function ogImages(locale: string, alt: string) {
  const url = ogShareImage(locale);
  return {
    openGraph: [{ url, width: OG_WIDTH, height: OG_HEIGHT, alt }],
    twitter: [{ url, alt }],
  };
}
