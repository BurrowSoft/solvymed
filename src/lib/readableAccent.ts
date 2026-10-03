// The doctor's accent colour, made readable (1.5.0 "My brand"; design §1 +
// §9c). The colour is stored as chosen; only the rendering adapts. One
// pinned algorithm on both platforms (the app has the same helper and the
// same test vectors, src/lib/readable-accent.vectors.json):
//  - WCAG 2.x relative luminance and contrast;
//  - the background is passed explicitly (each platform's own);
//  - a colour that already has contrast >= 4.5 is returned unchanged;
//  - otherwise HSL lightness steps 1 point from round(l * 100): darker when
//    lum(background) >= 0.18, else lighter; the first passing step is
//    returned as lowercase #rrggbb; the bound is #000000 / #ffffff.

export const DEFAULT_ACCENT = "#116e99"; // SolvyMed blue
export const MIN_CONTRAST = 4.5;

const HEX = /^#[0-9a-f]{6}$/i;
export const isAccentHex = (s: string | null | undefined): s is string => !!s && HEX.test(s);

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const toHex = (rgb: number[]) => "#" + rgb.map((c) => c.toString(16).padStart(2, "0")).join("");

function luminance(rgb: number[]): number {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [luminance(hexToRgb(a)), luminance(hexToRgb(b))].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

function rgbToHsl([r, g, b]: number[]): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb(h: number, s: number, l: number): number[] {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const hue = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue(p, q, h + 1 / 3), hue(p, q, h), hue(p, q, h - 1 / 3)].map((x) => Math.round(x * 255));
}

export function readableAccent(hex: string, background: string): string {
  if (contrastRatio(hex, background) >= MIN_CONTRAST) return hex.toLowerCase();
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  const darken = luminance(hexToRgb(background)) >= 0.18;
  for (let L = Math.round(l * 100); darken ? L >= 0 : L <= 100; L += darken ? -1 : 1) {
    const rgb = hslToRgb(h, s, L / 100);
    if (contrastRatio(toHex(rgb), background) >= MIN_CONTRAST) return toHex(rgb);
  }
  return darken ? "#000000" : "#ffffff";
}

// The stored accent, or the default when unset or malformed.
export function brandAccent(stored: string | null | undefined): string {
  return isAccentHex(stored) ? stored.toLowerCase() : DEFAULT_ACCENT;
}

// Initials of a display name, without a leading title ("Dra. Ana Souza" →
// "AS", "นพ.สมชาย ใจดี" → "สใ"), for the no-logo mark.
const TITLE = /^(?:(?:dott\.ssa|dott|dra|dr|profa|prof|pr)(?:\.?ª\.?|\.)?\s+|(?:ทพญ|ทพ|นพ|พญ|ภก|ภญ|ดร)\.\s*)/i;
export function brandInitials(name: string | null | undefined): string {
  const words = (name ?? "").trim().replace(TITLE, "").split(/\s+/).filter(Boolean);
  const pick = words.length > 1 ? [words[0], words[words.length - 1]] : words;
  return pick.map((w) => Array.from(w)[0]).join("").toUpperCase();
}
