import { tint, type DocTemplate } from "@/lib/prescriptionDoc";
import type { DocBrand } from "@/lib/brand";
import { DocBrandHeader } from "@/components/DocBrandHeader";

// The printed patient history (Help P8), laid out like the app's PDF
// (lib/pdf-utils buildMedicalHistoryHtml): the patient's details, every
// record (date, time, text), every prescription (its medications table and
// notes), entries a later correction replaced marked "(corrigido)", who
// exported it and when, then the blank signature line. React escapes all
// typed text.
export type HistoryLabels = {
  title: string; medicalRecords: string; prescriptions: string; noRecords: string; noPrescriptions: string;
  medication: string; dosage: string; frequency: string; duration: string; corrected: string; footer: string; exportedBy: string;
};

export type HistoryRecord = { id: string; date: string; time: string; content: string; corrected: boolean };
export type HistoryRx = { id: string; date: string; notes: string | null; corrected: boolean; items: { name: string; dosage: string; frequency: string; duration: string }[] };

export function HistoryDocument({ template, labels, patientName, detailLines, records, prescriptions, signerName, signerRegistration, brand = null }: {
  template: DocTemplate;
  labels: HistoryLabels;
  patientName: string;
  // Birth date + age, IDs, phone, sex: already formatted.
  detailLines: string[];
  records: HistoryRecord[];
  prescriptions: HistoryRx[];
  signerName: string;
  signerRegistration: string | null;
  // The doctor's brand block (1.5.0, behind the flag); null = as before.
  brand?: DocBrand | null;
}) {
  const { primaryColor, accentColor } = template;
  const sectionTitle = "mb-3 border-b-2 pb-1.5 text-sm font-extrabold";
  const empty = "text-[13px] italic text-[#A0ABBE]";
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

      <div className="mb-6 rounded-[10px] bg-[#F5F7FA] p-4">
        <div className="mb-2 text-[17px] font-extrabold">{patientName}</div>
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          {detailLines.map((l) => <span key={l} className="text-xs text-[#6B7A99]">{l}</span>)}
        </div>
      </div>

      <h2 className={sectionTitle} style={{ borderColor: primaryColor }}>
        {labels.medicalRecords} <span className="font-normal text-[#A0ABBE]">({records.length})</span>
      </h2>
      {records.length === 0 ? <p className={empty}>{labels.noRecords}</p> : records.map((r) => (
        <div key={r.id} className="mb-3.5 break-inside-avoid rounded-r-lg px-3.5 py-3" style={{ borderLeft: `3px solid ${primaryColor}`, background: tint(accentColor) }}>
          <div className="mb-1.5 text-[11px] text-[#A0ABBE]">{r.date} {r.time}{r.corrected && <strong> {labels.corrected}</strong>}</div>
          <div className="whitespace-pre-wrap text-[13px] leading-normal">{r.content}</div>
        </div>
      ))}

      <h2 className={`${sectionTitle} mt-6`} style={{ borderColor: primaryColor }}>
        {labels.prescriptions} <span className="font-normal text-[#A0ABBE]">({prescriptions.length})</span>
      </h2>
      {prescriptions.length === 0 ? <p className={empty}>{labels.noPrescriptions}</p> : prescriptions.map((rx) => (
        <div key={rx.id} className="mb-4 break-inside-avoid">
          <div className="mb-1.5 text-xs font-semibold text-[#6B7A99]">{rx.date}{rx.corrected && <strong> {labels.corrected}</strong>}</div>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {[labels.medication, labels.dosage, labels.frequency, labels.duration].map((h) => (
                  <th key={h} className="px-2.5 py-2 text-left text-[11px] uppercase text-white" style={{ background: primaryColor }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rx.items.map((m, i) => (
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
          {rx.notes && (
            <div className="mt-2 rounded-r-lg px-4 py-3 text-[13px] text-[#6B7A99]" style={{ background: tint(accentColor), borderLeft: `3px solid ${primaryColor}` }}>{rx.notes}</div>
          )}
        </div>
      ))}

      <p className="mt-8 text-[11px] text-[#A0ABBE]">{labels.exportedBy}</p>

      {/* Signed by hand, like the printed prescription (UX 36). */}
      <div className="mt-14 flex justify-end">
        <div className="min-w-[220px] border-t border-[#A0ABBE] pt-1.5 text-center text-[11px] text-[#6B7A99]">
          {signerName}
          {signerRegistration && <><br />{signerRegistration}</>}
        </div>
      </div>

      <footer className="mt-6 border-t border-[#E5E9F0] pt-4 text-center text-[11px] text-[#A0ABBE]">
        {template.footerText ?? labels.footer}
      </footer>
    </article>
  );
}
