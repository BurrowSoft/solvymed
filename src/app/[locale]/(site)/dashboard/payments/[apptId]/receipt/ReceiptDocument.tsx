import { tint, type DocTemplate } from "@/lib/prescriptionDoc";

// The printed recibo (Help G5), laid out like the app's (lib/pdf-utils
// buildInvoiceHtml): the patient and their ID, the recibo number and date,
// the doctor / clinic header, the services with extras and the total, and
// how it was paid. React escapes all typed text.
export type ReceiptLabels = {
  title: string; patient: string; services: string; description: string; amount: string; total: string;
  payment: string; online: string; inPerson: string; privatePay: string; insurance: string; paid: string; pending: string; footer: string;
};

export function ReceiptDocument({ template, labels, patientName, idLines, number, date, provider, clinic, address, service, serviceDetail, amount, extras, total, privatePay, paid }: {
  template: DocTemplate;
  labels: ReceiptLabels;
  patientName: string;
  idLines: string[];
  number: string;
  date: string;
  provider: string;
  clinic: string;
  address: string;
  service: string;
  serviceDetail: string;
  amount: string;
  extras: { name: string; amount: string }[];
  total: string;
  privatePay: boolean;
  paid: boolean;
}) {
  const { primaryColor, accentColor } = template;
  const label = "mb-1.5 text-[11px] uppercase tracking-[0.5px] text-[#A0ABBE]";
  return (
    <article id="print-doc" className="mx-auto max-w-[680px] bg-white p-10 text-[#1A2138]" style={{ fontFamily: "-apple-system, Helvetica, Arial, sans-serif" }}>
      <header className="mb-7 flex items-center justify-between pb-[18px]" style={{ borderBottom: `3px solid ${primaryColor}` }}>
        <div>
          <h1 className="mb-1 text-[22px] font-extrabold" style={{ color: primaryColor }}>{labels.title}</h1>
          <p className="text-[13px] text-[#6B7A99]">{template.headerText ?? provider}</p>
        </div>
        {template.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={template.logoUrl} alt="" className="h-12 max-w-[160px] object-contain" />
        )}
      </header>

      <div className="mb-5 flex flex-wrap justify-between gap-6">
        <div>
          <div className={label}>{labels.patient}</div>
          <div className="text-[15px] font-bold">{patientName}</div>
          {idLines.map((l) => <div key={l} className="text-xs text-[#6B7A99]">{l}</div>)}
        </div>
        <div className="text-right">
          <div className={label}>{labels.title}</div>
          <div className="text-sm font-bold">#{number}</div>
          <div className="text-xs text-[#6B7A99]">{date}</div>
        </div>
      </div>

      {(provider || clinic) && (
        <div className="mb-5 rounded-lg bg-[#F5F7FA] px-4 py-3">
          {provider && <div className="text-[13px] font-semibold">{provider}</div>}
          {clinic && <div className="mt-0.5 text-xs text-[#6B7A99]">{clinic}</div>}
          {address && <div className="text-xs text-[#6B7A99]">{address}</div>}
        </div>
      )}

      <section className="mb-5">
        <div className={label}>{labels.services}</div>
        <table className="mt-2 w-full border-collapse">
          <thead>
            <tr>
              <th className="px-2.5 py-2 text-left text-[11px] uppercase text-white" style={{ background: primaryColor }}>{labels.description}</th>
              <th className="px-2.5 py-2 text-right text-[11px] uppercase text-white" style={{ background: primaryColor }}>{labels.amount}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border-b border-[#E5E9F0] p-2.5 text-[13px]"><strong>{service}</strong><br /><span className="text-[11px] text-[#6B7A99]">{serviceDetail}</span></td>
              <td className="border-b border-[#E5E9F0] p-2.5 text-right text-[13px]">{amount}</td>
            </tr>
            {extras.map((x, i) => (
              <tr key={i}>
                <td className="border-b border-[#E5E9F0] p-2.5 text-[13px]" style={i % 2 === 0 ? { background: tint(accentColor) } : undefined}>{x.name}</td>
                <td className="border-b border-[#E5E9F0] p-2.5 text-right text-[13px]" style={i % 2 === 0 ? { background: tint(accentColor) } : undefined}>{x.amount}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[#E5E9F0]">
              <td className="p-2.5 text-sm font-bold">{labels.total}</td>
              <td className="p-2.5 text-right text-lg font-extrabold" style={{ color: primaryColor }}>{total}</td>
            </tr>
          </tfoot>
        </table>
      </section>

      <section className="mt-4">
        <div className={label}>{labels.payment}</div>
        <div className="text-sm">
          {privatePay ? labels.privatePay : labels.insurance} · <span className="font-semibold" style={{ color: paid ? "#16A34A" : "#D97706" }}>{paid ? labels.paid : labels.pending}</span>
        </div>
      </section>

      <footer className="mt-8 border-t border-[#E5E9F0] pt-4 text-center text-[11px] text-[#A0ABBE]">
        {template.footerText ?? labels.footer}
      </footer>
    </article>
  );
}
