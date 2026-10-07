import { tint, type DocTemplate } from "@/lib/prescriptionDoc";
import type { DocBrand } from "@/lib/brand";
import { DocBrandHeader } from "@/components/DocBrandHeader";

// The printed prescription (the app's PDF layout). React escapes every
// typed text; colours and the logo come through lib/prescriptionDoc's
// guards. Only this block prints (see the page's print CSS).
export type RxDocLabels = {
  title: string; patient: string; date: string; medications: string; medication: string;
  dosage: string; frequency: string; duration: string; notes: string; footer: string; corrected: string;
};

export function PrescriptionDocument({ template, labels, patientName, patientAddress = "", date, corrected, items, notes, signerName, signerRegistration, brand = null }: {
  template: DocTemplate;
  labels: RxDocLabels;
  patientName: string;
  // One line under the name (138; empty = not printed).
  patientAddress?: string;
  date: string;
  corrected: boolean;
  items: { name: string; dosage: string; frequency: string; duration: string }[];
  notes: string | null;
  signerName: string;
  signerRegistration: string | null;
  // The doctor's brand block (1.5.0, behind the flag); null = as before.
  brand?: DocBrand | null;
}) {
  const { primaryColor, accentColor } = template;
  const label = "mb-1.5 text-[11px] uppercase tracking-[0.5px] text-[#A0ABBE]";
  return (
    <article id="print-doc" className="mx-auto max-w-[680px] bg-white p-10 text-[#1A2138]" style={{ fontFamily: "-apple-system, Helvetica, Arial, sans-serif" }}>
      {brand && <DocBrandHeader brand={brand} />}
      <header className="mb-7 flex items-center justify-between pb-[18px]" style={{ borderBottom: `3px solid ${primaryColor}` }}>
        <div>
          <h1 className="mb-1 text-[22px] font-extrabold" style={{ color: primaryColor }}>{labels.title}</h1>
          <p className="text-[13px] text-[#6B7A99]">{template.headerText ?? patientName}</p>
        </div>
        {/* With the doctor's brand the logo is in the brand block above. */}
        {!brand && template.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={template.logoUrl} alt="" className="h-12 max-w-[160px] object-contain" />
        )}
      </header>

      <section className="mb-5">
        <div className={label}>{labels.patient}</div>
        <div className="text-sm">{patientName}</div>
        {patientAddress && <div className="text-xs text-[#6B7A99]">{patientAddress}</div>}
      </section>
      <section className="mb-5">
        <div className={label}>{labels.date}</div>
        <div className="text-sm">{date}{corrected && <strong> {labels.corrected}</strong>}</div>
      </section>
      <section className="mb-5">
        <div className={label}>{labels.medications}</div>
        <table className="mt-2 w-full border-collapse">
          <thead>
            <tr>
              {[labels.medication, labels.dosage, labels.frequency, labels.duration].map((h) => (
                <th key={h} className="px-2.5 py-2 text-left text-[11px] uppercase text-white" style={{ background: primaryColor }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((m, i) => (
              <tr key={i}>
                {[m.name, m.dosage, m.frequency, m.duration].map((v, j) => (
                  <td key={j} className="border-b border-[#E5E9F0] p-2.5 text-[13px]" style={i % 2 === 1 ? { background: tint(accentColor) } : undefined}>
                    {j === 0 ? <strong>{v}</strong> : v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {notes && (
        <div className="mt-4 rounded-r-lg px-4 py-3 text-[13px] text-[#6B7A99]" style={{ background: tint(accentColor), borderLeft: `3px solid ${primaryColor}` }}>
          <strong>{labels.notes}:</strong> {notes}
        </div>
      )}

      {/* Signed by hand: a blank line, the name and registration under it. */}
      <div className="mt-16 flex justify-end">
        <div className="min-w-[220px] text-center">
          <div className="border-t border-[#A0ABBE] pt-1.5 text-[11px] text-[#6B7A99]">
            {signerName}
            {signerRegistration && <><br />{signerRegistration}</>}
          </div>
        </div>
      </div>

      <footer className="mt-6 border-t border-[#E5E9F0] pt-4 text-center text-[11px] text-[#A0ABBE]">
        {(template.locationLines ?? []).length > 0 && (
          <div data-testid="doc-location-lines" className="mb-1.5 space-y-0.5">
            {template.locationLines!.map((l) => <div key={l}>{l}</div>)}
          </div>
        )}
        {template.footerText ?? labels.footer}
      </footer>
    </article>
  );
}
