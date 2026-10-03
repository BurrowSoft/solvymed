"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { assetUrl } from "@/lib/brand";
import { brandAccent, brandInitials, readableAccent } from "@/lib/readableAccent";

// The doctor's brand on a public page (1.5.0; the booking page and the
// public invite link, never a patient's personal invite page): the logo,
// else the photo, else the initials in the accent; the name and specialty.
// No legacy images here: the old profile photos were never public (e7).

export type PublicBrand = {
  name: string; // title + display name, as shown
  specialty: string;
  accentColor: string | null;
  logoUrl: string | null;
  photoUrl: string | null;
};

type PublicBrandRow = {
  display_name: string | null;
  title: string | null;
  specialty: string | null;
  accent_color: string | null;
  logo_square_path: string | null;
  photo_path: string | null;
};

// The public invite link's brand, looked up by the practice's PUBLIC code,
// from the browser (the RPC's per-IP budgets must count the visitor's IP,
// not the server's). Anything but a saved brand (0 rows, too_many_attempts
// on shared clinic Wi-Fi, any error) is "no brand": the caller shows the
// default, never an error.
export function usePublicBrand(code: string | null, enabled: boolean): PublicBrand | null {
  const [brand, setBrand] = useState<PublicBrand | null>(null);
  useEffect(() => {
    if (!enabled || !code) return;
    let cancelled = false;
    const supabase = createClient();
    Promise.resolve(supabase.rpc("get_public_brand_by_code", { p_code: code }))
      .then(({ data, error }) => {
        if (cancelled || error) return;
        const row = (Array.isArray(data) ? data[0] : data) as PublicBrandRow | undefined;
        if (!row) return;
        setBrand({
          name: [row.title, row.display_name].map((s) => (s ?? "").trim()).filter(Boolean).join(" "),
          specialty: (row.specialty ?? "").trim(),
          accentColor: row.accent_color,
          logoUrl: assetUrl(supabase, row.logo_square_path),
          photoUrl: assetUrl(supabase, row.photo_path),
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [code, enabled]);
  return brand;
}

export function BrandHeader({ brand, className = "" }: { brand: PublicBrand; className?: string }) {
  // On the white card: the accent made readable against white.
  const accent = readableAccent(brandAccent(brand.accentColor), "#ffffff");
  const image = brand.logoUrl ?? brand.photoUrl;
  return (
    <div data-testid="brand-header" className={`flex items-center gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-100 ${className}`} style={{ borderTop: `4px solid ${accent}` }}>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className={`h-12 w-12 shrink-0 bg-white ${brand.logoUrl ? "rounded-lg object-contain" : "rounded-full object-cover"}`} />
      ) : (
        <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-bold text-white" style={{ backgroundColor: accent }}>
          {brandInitials(brand.name) || "•"}
        </span>
      )}
      <div className="min-w-0">
        <p className="line-clamp-2 font-bold text-slate-900 [overflow-wrap:anywhere]">{brand.name}</p>
        {brand.specialty && <p className="truncate text-sm text-slate-500">{brand.specialty}</p>}
      </div>
    </div>
  );
}
