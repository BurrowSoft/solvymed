"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import { CloseIcon } from "./icons";

export interface FloatingAdLink {
  href: string;
  label: string;
  sub?: string;
}

export interface FloatingAdConfig {
  brand: string;
  brandColor: string;
  badge?: string;
  links: FloatingAdLink[];
}

/**
 * Central ad config. Add new countries/brands here — one place, all apps update.
 * Key = next-intl locale string (e.g. "th", "pt", "en").
 */
export const REGIONAL_ADS: Record<string, FloatingAdConfig> = {
  th: {
    brand: "lazada",
    brandColor: "#F57224",
    badge: "TH",
    links: [
      {
        href: "https://s.lazada.co.th/s.ZhTKMF?c=b&t=p-i6RvCVf-sRab381",
        label: "ช้อปสินค้าที่ Lazada",
        sub: "ดีลพิเศษวันนี้",
      },
      {
        href: "https://s.lazada.co.th/s.ZhTKLe?c=a&t=p-iHa6GOt-s2EYQBV0",
        label: "Flash Sale",
        sub: "ลดราคาสูงสุด 90%",
      },
    ],
  },
  // pt / BR: add Shopee or Mercado Livre affiliate links here once obtained
};

/**
 * Floating promotional banner, bottom-right corner.
 * Renders only when the current locale has an entry in REGIONAL_ADS.
 * Dismissible per session (state lives in the component, not localStorage).
 *
 * Usage: drop <RegionalFloatingAd /> once in layout.tsx — no props needed.
 */
export function RegionalFloatingAd() {
  const locale = useLocale();
  const [dismissed, setDismissed] = useState(false);

  const config = REGIONAL_ADS[locale];
  if (!config || dismissed) return null;

  return (
    <div
      className="fixed bottom-5 end-4 z-[9999] w-56 overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200"
      role="complementary"
      aria-label={`${config.brand} promotion`}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ backgroundColor: config.brandColor }}
      >
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-extrabold tracking-tight text-white capitalize">
            {config.brand}
          </span>
          {config.badge && (
            <span className="rounded bg-white/20 px-1 text-[10px] font-bold text-white">
              {config.badge}
            </span>
          )}
        </div>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Close"
          className="rounded p-0.5 text-white/80 hover:text-white transition-colors"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Links */}
      <div className="flex flex-col divide-y divide-slate-100">
        {config.links.map(({ href, label, sub }) => (
          <a
            key={href}
            href={href}
            target="_blank"
            rel="noopener noreferrer sponsored"
            className="flex flex-col px-3 py-2.5 hover:bg-orange-50 transition-colors"
          >
            <span className="text-sm font-semibold text-slate-800">{label}</span>
            {sub && <span className="text-xs text-orange-500">{sub}</span>}
          </a>
        ))}
      </div>

      {/* Footer */}
      <div className="border-t border-slate-100 bg-slate-50 px-3 py-1.5">
        <p className="text-center text-[10px] text-slate-300">Sponsored</p>
      </div>
    </div>
  );
}
