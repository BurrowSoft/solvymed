import { countryProfile } from "./country";

// "Video tutorials" (specs/video-tutorials.md): the YouTube playlist of the
// practice's country (signed in), else of the site language's country
// (visitors). Linked out only (no embed: no YouTube cookies, no consent).

// A visitor's country from the site language: Portuguese → Brazil, Thai →
// Thailand; English (and any other) → none until an English playlist exists.
const LOCALE_COUNTRY: Readonly<Record<string, string>> = { "pt-BR": "BR", th: "TH" };

export function videoTutorialsUrl(opts: { country?: string | null; locale?: string | null }): string | null {
  const country = opts.country?.trim() || (opts.locale ? LOCALE_COUNTRY[opts.locale] : undefined);
  return country ? countryProfile(country).videoTutorialsUrl : null;
}
