import type { ReactNode } from "react";
import { BrandLogo } from "@/components/BrandLogo";

// /subscribe's header. exitHref = the dashboard when it lets the doctor in;
// null when it wouldn't (an ended trial or a failed renewal): then no
// "← Voltar" and a plain logo, since the dashboard and even the home page
// (signed in → dashboard) bounce back here. Sign out, support and "Encerrar
// conta" are the ways out then (d7, 9a). Sign out sits top right, in every
// state, so it's visible without scrolling (UX, Vitor's screenshot).
export function SubscribeHeader({ exitHref, backLabel, signOut }: { exitHref: string | null; backLabel: string; signOut?: ReactNode }) {
  // The brand kit's logo (Vitor, build 25: the old "S" was still here).
  const logo = <BrandLogo className="mx-auto h-12" />;
  return (
    <div className="mb-8 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
      <div className="justify-self-start">
        {exitHref && <a href={exitHref} className="text-sm font-semibold text-slate-600 hover:text-slate-900">← {backLabel}</a>}
      </div>
      {exitHref
        ? <a href={exitHref} className="text-center" aria-label="SolvyMed">{logo}</a>
        : <div className="text-center">{logo}</div>}
      <div className="justify-self-end">{signOut}</div>
    </div>
  );
}
