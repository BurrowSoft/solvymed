import type { ReactNode } from "react";
import type { PageLook } from "@/lib/patientChannel/pageLook";
import { brandInitials } from "@/lib/readableAccent";

// The doctor's page look around the patient's channel (prototype v17; the real page and
// the doctor's "Testar como paciente" share it): the band on top (the 3:1 cover, or a
// shorter strip in the brand colour), the round logo overlapping its edge with all text
// below it on the normal surface (contrast), the logo watermark behind the content, and
// --pc-brand / --pc-ink for the main buttons. No look: the plain page in SolvyMed blue.
// The frame's padding is p-4 sm:p-6: the band bleeds into it.
export function PcPageFrame({ look, doctorName, practiceLine, banner, className = "", testId, children }: {
  look: PageLook | null | undefined;
  doctorName: string;
  practiceLine: string;
  banner?: ReactNode;
  className?: string;
  testId?: string;
  children: ReactNode;
}) {
  const vars = { "--pc-brand": look?.color ?? "#116e99", "--pc-ink": look?.ink ?? "#FFFFFF" } as React.CSSProperties;
  const logo = look?.logoUrl ?? null;
  return (
    <div className={`relative isolate flex flex-col gap-3 overflow-hidden p-4 sm:p-6 ${className}`} style={vars} data-testid={testId}>
      {look?.watermark && logo && (
        <div aria-hidden="true" data-testid="pc-watermark" className="pointer-events-none absolute inset-0 -z-10 bg-no-repeat opacity-[0.07]"
          style={{ backgroundImage: `url("${logo}")`, backgroundPosition: "center 62%", backgroundSize: "70%" }} />
      )}
      {look?.band && (
        look.coverUrl ? (
          <div data-testid="pc-band" className="relative -mx-4 -mt-4 aspect-[3/1] max-h-[400px] bg-[var(--pc-brand)] sm:-mx-6 sm:-mt-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={look.coverUrl} alt={look.coverAlt} data-testid="pc-cover" className="h-full w-full object-cover" />
            <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-transparent from-45% to-black/30" />
          </div>
        ) : (
          <div aria-hidden="true" data-testid="pc-band" className="-mx-4 -mt-4 h-[86px] bg-[var(--pc-brand)] sm:-mx-6 sm:-mt-6" />
        )
      )}
      {banner}
      <div className={look?.band ? "relative z-10 -mt-12 flex items-start gap-3 pb-3" : "flex items-center gap-3 border-b border-slate-100 pb-3"}>
        <span aria-hidden="true" className={`grid shrink-0 place-items-center overflow-hidden rounded-full font-bold text-[var(--pc-brand)] ${look?.band ? "h-16 w-16 border-[3px] border-white bg-white text-xl shadow-sm" : "h-10 w-10 bg-teal-50"}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logo ? <img src={logo} alt="" className="h-full w-full rounded-full object-contain" /> : brandInitials(doctorName)}
        </span>
        <div className={look?.band ? "min-w-0 pt-12" : "min-w-0"}><b className="block break-words text-slate-900">{doctorName}</b><span className="text-xs text-slate-500">{practiceLine}</span></div>
      </div>
      {children}
    </div>
  );
}

