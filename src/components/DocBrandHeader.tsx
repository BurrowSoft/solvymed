import type { DocBrand } from "@/lib/brand";

// The doctor's brand block at the top of a printed document (1.5.0; the
// same as the app's PDFs, #318): the logo, else the initials in the
// document's colour, then the name, specialty and registration line.
// React escapes every text.
export function DocBrandHeader({ brand }: { brand: DocBrand }) {
  return (
    <div data-testid="doc-brand" className="mb-5 flex items-center gap-4">
      {brand.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={brand.logoUrl} alt="" className="h-14 max-w-[200px] object-contain" />
      ) : (
        <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[15px] font-bold text-white" style={{ backgroundColor: brand.color }}>
          {brand.initials || "•"}
        </span>
      )}
      <div className="min-w-0">
        <div className="text-[16px] font-extrabold text-[#1A2138]">{brand.name}</div>
        {brand.specialty && <div className="text-[12px] text-[#6B7A99]">{brand.specialty}</div>}
        {brand.registration && <div className="text-[12px] font-semibold" style={{ color: brand.color }}>{brand.registration}</div>}
      </div>
    </div>
  );
}
