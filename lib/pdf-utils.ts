import { DocumentTemplate, Patient, Prescription } from './types';

export function buildDocumentHtml(opts: {
  title: string;
  subtitle: string;
  bodyHtml: string;
  template: DocumentTemplate;
}): string {
  const { title, subtitle, bodyHtml, template } = opts;
  const logo = template.logoUrl
    ? `<img src="${template.logoUrl}" style="height:48px;max-width:160px;object-fit:contain;" />`
    : '';
  const footer = template.footerText || 'SolvyMed — Clinic Management';

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, Helvetica, sans-serif; padding: 40px; color: #1A2138; max-width: 680px; margin: 0 auto; }
    .doc-header { display: flex; align-items: center; justify-content: space-between; padding-bottom: 18px; border-bottom: 3px solid ${template.primaryColor}; margin-bottom: 28px; }
    .doc-header h1 { font-size: 22px; font-weight: 800; color: ${template.primaryColor}; margin-bottom: 4px; }
    .doc-header p { font-size: 13px; color: #6B7A99; }
    .section { margin-bottom: 20px; }
    .label { font-size: 11px; text-transform: uppercase; color: #A0ABBE; letter-spacing: 0.5px; margin-bottom: 6px; }
    .value { font-size: 14px; color: #1A2138; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th { text-align: left; padding: 8px 10px; font-size: 11px; text-transform: uppercase; color: #fff; background: ${template.primaryColor}; }
    td { padding: 10px; font-size: 13px; border-bottom: 1px solid #E5E9F0; }
    tr:nth-child(even) td { background: ${template.accentColor}; }
    .notes-box { background: ${template.accentColor}; border-left: 3px solid ${template.primaryColor}; border-radius: 0 8px 8px 0; padding: 12px 16px; font-size: 13px; color: #6B7A99; margin-top: 16px; }
    .doc-footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #E5E9F0; font-size: 11px; color: #A0ABBE; text-align: center; }
  </style></head><body>
  <div class="doc-header">
    <div>
      <h1>${title}</h1>
      <p>${subtitle}</p>
    </div>
    ${logo}
  </div>
  ${bodyHtml}
  <div class="doc-footer">${footer}</div>
  </body></html>`;
}

export function buildPrescriptionHtml(
  patient: Patient,
  rx: Prescription,
  template: DocumentTemplate,
): string {
  const meds = rx.medications
    .map(
      m => `
    <tr>
      <td><strong>${m.name}</strong></td>
      <td>${m.dosage}</td>
      <td>${m.frequency}</td>
      <td>${m.duration}</td>
    </tr>`,
    )
    .join('');

  const bodyHtml = `
    <div class="section">
      <div class="label">Patient</div>
      <div class="value">${patient.fullName}</div>
    </div>
    <div class="section">
      <div class="label">Date</div>
      <div class="value">${rx.date}</div>
    </div>
    <div class="section">
      <div class="label">Medications</div>
      <table>
        <thead><tr><th>Medication</th><th>Dosage</th><th>Frequency</th><th>Duration</th></tr></thead>
        <tbody>${meds}</tbody>
      </table>
    </div>
    ${rx.notes ? `<div class="notes-box"><strong>Notes:</strong> ${rx.notes}</div>` : ''}
  `;

  return buildDocumentHtml({
    title: 'Prescription',
    subtitle: template.headerText ?? patient.fullName,
    bodyHtml,
    template,
  });
}
