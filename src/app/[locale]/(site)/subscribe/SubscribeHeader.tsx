// /subscribe's header. exitHref = the dashboard when it lets the doctor in;
// null when it wouldn't (an ended trial or a failed renewal): then no
// "← Voltar" and a plain logo, since the dashboard and even the home page
// (signed in → dashboard) bounce back here. Sign out, support and "Encerrar
// conta" are the ways out then (d7, 9a).
export function SubscribeHeader({ exitHref, backLabel }: { exitHref: string | null; backLabel: string }) {
  const logo = (
    <>
      <span className="text-5xl font-black text-teal-600">S</span>
      <p className="mt-1 text-lg font-bold text-slate-800">SolvyMed</p>
    </>
  );
  return (
    <div className="mb-8 flex items-center justify-between">
      {exitHref
        ? <a href={exitHref} className="text-sm font-semibold text-slate-600 hover:text-slate-900">← {backLabel}</a>
        : <span className="w-12" aria-hidden="true" />}
      {exitHref
        ? <a href={exitHref} className="text-center" aria-label="SolvyMed">{logo}</a>
        : <div className="text-center">{logo}</div>}
      <span className="w-12" aria-hidden="true" />
    </div>
  );
}
