import { profileOfKind } from "@/lib/country";

// Landing hero media (Phase 1): the silent product clip in the phone frame
// and the "Watch the 2-minute tour" link, per landing locale. The Thai home
// shows the Thai cut; every other locale the Brazilian one (en included: the
// clip is visual). The tour (a voiced promo) only where its language is the
// page's: pt-BR → the BR promo, th → the TH one; none elsewhere (01). The
// clip is self-hosted in /public/hero (no third-party player, no cookies);
// the promo is linked out (CountryProfile.promoTourUrl).
export type HeroCut = "br" | "th";

export type HeroMedia = {
  cut: HeroCut;
  poster: string;
  mp4: string;
  webm: string;
  tourUrl: string | null; // null hides the button
};

const CUT_COUNTRY: Record<HeroCut, "BR" | "TH"> = { br: "BR", th: "TH" };
const LOCALE_CUT: Partial<Record<string, HeroCut>> = { "pt-BR": "br", th: "th", en: "br" };
const DEFAULT_CUT: HeroCut = "br";
const TOUR_LOCALES: ReadonlySet<string> = new Set(["pt-BR", "th"]);

export function heroCut(locale: string): HeroCut {
  return LOCALE_CUT[locale] ?? DEFAULT_CUT;
}

export function heroMedia(locale: string): HeroMedia {
  const cut = heroCut(locale);
  return {
    cut,
    poster: `/hero/hero-${cut}-poster.jpg`,
    mp4: `/hero/hero-${cut}.mp4`,
    webm: `/hero/hero-${cut}.webm`,
    tourUrl: TOUR_LOCALES.has(locale) ? profileOfKind(CUT_COUNTRY[cut]).promoTourUrl : null,
  };
}
