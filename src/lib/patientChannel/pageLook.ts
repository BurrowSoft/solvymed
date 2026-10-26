import { DEFAULT_ACCENT, isAccentHex } from "@/lib/readableAccent";
import type { PageBg } from "./channel";

// How the patient's channel page looks (prototype v17, specs/prototypes/patient-
// channel-v17.html; 01, 10-27): the doctor's "Fundo da página" choice.
// - "cover" / "both": a band on top: the 3:1 cover image when there is one
//   (with a soft shade at its bottom), else a shorter strip in the brand colour;
//   the round logo overlaps its bottom edge and all text starts below it.
// - "watermark" / "both": the logo faintly behind the content, only when a logo exists.
// - "plain": neither.
// The brand colour (fallback SolvyMed blue) also fills the main buttons, with dark
// or white text by luminance.

export type PageLook = {
  band: boolean;
  watermark: boolean;
  color: string;
  ink: string;
  logoUrl: string | null;
  coverUrl: string | null;
  // The banner's text alternative: the practice name.
  coverAlt: string;
};

// A light colour needs dark text (the prototype's inkFor).
export function inkFor(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const L = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return L > 0.6 ? "#13232E" : "#FFFFFF";
}

export function pageLook(bg: string | null | undefined, opts: { color?: string | null; logoUrl?: string | null; coverUrl?: string | null; coverAlt?: string }): PageLook {
  const value: PageBg = bg === "cover" || bg === "watermark" || bg === "plain" ? bg : "both";
  const color = isAccentHex(opts.color) ? opts.color : DEFAULT_ACCENT;
  const band = value === "cover" || value === "both";
  return {
    band,
    watermark: (value === "watermark" || value === "both") && !!opts.logoUrl,
    color,
    ink: inkFor(color),
    logoUrl: opts.logoUrl ?? null,
    coverUrl: band ? opts.coverUrl ?? null : null,
    coverAlt: opts.coverAlt ?? "",
  };
}
