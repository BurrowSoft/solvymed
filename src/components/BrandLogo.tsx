// SolvyMed's logo, from the brand kit (apps-brand-kits/solvymed-brand-kit;
// Vitor, 1.4.0: logos only, the colours change after it).
// - BrandLogo: the horizontal logo (mark + SolvyMed) for headers and the
//   sidebar; the blue one on light, the white one in the dashboard's dark
//   theme (globals.css .brand-logo-*).
// - BrandMarkTile: the mark alone, white on today's teal tile, where space is
//   small (auth cards, the phone header, the footer). `decorative` when a
//   visible title already names the page (alt="", 9a).
// The PNGs are the kit's, with the export padding trimmed (e7, 10-01).
export function BrandLogo({ className = "h-8" }: { className?: string }) {
  return (
    <>
      {/* 409×176 */}
      <img src="/brand/logo-light.png" alt="SolvyMed" width={409} height={176} className={`brand-logo-light w-auto ${className}`} />
      <img src="/brand/logo-dark.png" alt="SolvyMed" width={409} height={176} className={`brand-logo-dark w-auto ${className}`} />
    </>
  );
}

export function BrandMarkTile({ size = "md", decorative = false }: { size?: "xs" | "sm" | "md" | "lg"; decorative?: boolean }) {
  const box = { xs: "h-6 w-6 rounded-md", sm: "h-8 w-8 rounded-lg", md: "h-10 w-10 rounded-xl", lg: "h-14 w-14 rounded-2xl shadow-lg shadow-teal-600/20" }[size];
  const mark = { xs: "h-4", sm: "h-5", md: "h-6", lg: "h-9" }[size];
  return (
    <span className={`inline-flex shrink-0 items-center justify-center bg-teal-600 ${box}`}>
      {/* 214×272 */}
      <img src="/brand/mark-white.png" alt={decorative ? "" : "SolvyMed"} width={214} height={272} className={`w-auto ${mark}`} />
    </span>
  );
}
