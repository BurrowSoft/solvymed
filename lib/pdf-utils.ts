import { Appointment, DocumentTemplate, MedicalRecord, Patient, Prescription, Professional } from './types';

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

export function buildInvoiceHtml(
  patient: Patient,
  appt: Appointment,
  professional: Professional,
  template: DocumentTemplate,
): string {
  const extraRows = (appt.extraItems ?? [])
    .map(item => `<tr>
      <td>${item.name}</td>
      <td style="text-align:right">${item.price != null ? `R$ ${item.price.toFixed(2)}` : '—'}</td>
    </tr>`)
    .join('');

  const subtotal = appt.paymentAmount ?? 0;
  const extrasTotal = (appt.extraItems ?? []).reduce((s, i) => s + (i.price ?? 0), 0);
  const total = subtotal + extrasTotal;

  const invoiceNum = `${appt.date.replace(/-/g, '')}-${appt.id.slice(0, 6).toUpperCase()}`;
  const providerLine = [professional.fullName, professional.specialty].filter(Boolean).join(' — ');
  const clinicLine = [professional.clinicName, professional.clinicCnpj ? `CNPJ ${professional.clinicCnpj}` : ''].filter(Boolean).join(' · ');
  const addressLine = [professional.clinicAddress, professional.clinicCity, professional.clinicState].filter(Boolean).join(', ');

  const bodyHtml = `
    <div style="display:flex;justify-content:space-between;gap:24px;margin-bottom:20px;flex-wrap:wrap;">
      <div>
        <div class="label">Patient</div>
        <div class="value" style="font-size:15px;font-weight:700;">${patient.fullName}</div>
        ${patient.cpf ? `<div style="font-size:12px;color:#6B7A99;">CPF: ${patient.cpf}</div>` : ''}
      </div>
      <div style="text-align:right">
        <div class="label">Invoice</div>
        <div class="value" style="font-weight:700;">#${invoiceNum}</div>
        <div style="font-size:12px;color:#6B7A99;">${appt.date}</div>
      </div>
    </div>

    ${providerLine || clinicLine ? `
    <div class="section" style="background:#F5F7FA;padding:12px 16px;border-radius:8px;margin-bottom:20px;">
      ${providerLine ? `<div style="font-size:13px;font-weight:600;color:#1A2138;">${providerLine}</div>` : ''}
      ${clinicLine ? `<div style="font-size:12px;color:#6B7A99;margin-top:2px;">${clinicLine}</div>` : ''}
      ${addressLine ? `<div style="font-size:12px;color:#6B7A99;">${addressLine}</div>` : ''}
    </div>` : ''}

    <div class="section">
      <div class="label">Services</div>
      <table>
        <thead><tr><th>Description</th><th style="text-align:right">Amount</th></tr></thead>
        <tbody>
          <tr>
            <td><strong>${appt.consultationType}</strong><br><span style="font-size:11px;color:#6B7A99;">${appt.type === 'online' ? 'Online' : 'In-Person'} · ${appt.startTime}</span></td>
            <td style="text-align:right">${subtotal > 0 ? `R$ ${subtotal.toFixed(2)}` : '—'}</td>
          </tr>
          ${extraRows}
        </tbody>
        <tfoot>
          <tr style="border-top:2px solid #E5E9F0;">
            <td style="font-weight:700;font-size:14px;">Total</td>
            <td style="text-align:right;font-weight:800;font-size:18px;color:${template.primaryColor}">R$ ${total.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <div class="section" style="margin-top:16px;">
      <div class="label">Payment</div>
      <div class="value">${appt.paymentType === 'private' ? 'Private Pay' : 'Insurance'} &nbsp;·&nbsp; <span style="color:${appt.paymentStatus === 'paid' ? '#22C55E' : '#F59E0B'};font-weight:600;">${appt.paymentStatus === 'paid' ? 'Paid' : 'Pending'}</span></div>
    </div>
  `;

  return buildDocumentHtml({
    title: 'Invoice',
    subtitle: template.headerText ?? providerLine,
    bodyHtml,
    template,
  });
}

export function buildMedicalHistoryHtml(
  patient: Patient,
  records: MedicalRecord[],
  prescriptions: Prescription[],
  professional: Professional,
  template: DocumentTemplate,
): string {
  const ageStr = (() => {
    if (!patient.birthDate) return '';
    const birth = new Date(patient.birthDate);
    const now = new Date();
    let y = now.getFullYear() - birth.getFullYear();
    const m = now.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) y--;
    return `${y} years old`;
  })();

  const recordsHtml = records.length === 0
    ? '<p style="color:#A0ABBE;font-size:13px;font-style:italic;">No records found.</p>'
    : records.map(r => `
        <div style="margin-bottom:14px;padding:12px 14px;border-left:3px solid ${template.primaryColor};background:${template.accentColor};border-radius:0 8px 8px 0;">
          <div style="font-size:11px;color:#A0ABBE;margin-bottom:6px;">${r.date} ${r.time}</div>
          <div style="font-size:13px;color:#1A2138;white-space:pre-wrap;line-height:1.5;">${r.content}</div>
        </div>`).join('');

  const rxHtml = prescriptions.length === 0
    ? '<p style="color:#A0ABBE;font-size:13px;font-style:italic;">No prescriptions found.</p>'
    : prescriptions.map(rx => {
        const meds = rx.medications.map(m => `<tr>
          <td><strong>${m.name}</strong></td><td>${m.dosage}</td>
          <td>${m.frequency}</td><td>${m.duration}</td>
        </tr>`).join('');
        return `
          <div style="margin-bottom:16px;">
            <div style="font-size:12px;color:#6B7A99;margin-bottom:6px;font-weight:600;">${rx.date}</div>
            <table>
              <thead><tr><th>Medication</th><th>Dosage</th><th>Frequency</th><th>Duration</th></tr></thead>
              <tbody>${meds}</tbody>
            </table>
            ${rx.notes ? `<div class="notes-box" style="margin-top:8px;">${rx.notes}</div>` : ''}
          </div>`;
      }).join('');

  const bodyHtml = `
    <div style="background:#F5F7FA;padding:16px;border-radius:10px;margin-bottom:24px;">
      <div style="font-size:17px;font-weight:800;color:#1A2138;margin-bottom:8px;">${patient.fullName}</div>
      <div style="display:flex;gap:20px;flex-wrap:wrap;">
        ${patient.birthDate ? `<span style="font-size:12px;color:#6B7A99;">DOB: ${patient.birthDate}${ageStr ? ` (${ageStr})` : ''}</span>` : ''}
        ${patient.cpf ? `<span style="font-size:12px;color:#6B7A99;">CPF: ${patient.cpf}</span>` : ''}
        ${patient.phone ? `<span style="font-size:12px;color:#6B7A99;">Phone: ${patient.phone}</span>` : ''}
        ${patient.sex ? `<span style="font-size:12px;color:#6B7A99;">${patient.sex.charAt(0).toUpperCase() + patient.sex.slice(1)}</span>` : ''}
      </div>
    </div>

    <div style="font-size:14px;font-weight:800;color:#1A2138;margin-bottom:12px;padding-bottom:6px;border-bottom:2px solid ${template.primaryColor};">
      Medical Records <span style="font-weight:400;color:#A0ABBE;">(${records.length})</span>
    </div>
    ${recordsHtml}

    <div style="font-size:14px;font-weight:800;color:#1A2138;margin:24px 0 12px;padding-bottom:6px;border-bottom:2px solid ${template.primaryColor};">
      Prescriptions <span style="font-weight:400;color:#A0ABBE;">(${prescriptions.length})</span>
    </div>
    ${rxHtml}

    <div style="margin-top:32px;font-size:11px;color:#A0ABBE;">
      Exported by ${professional.fullName}${professional.clinicName ? ` · ${professional.clinicName}` : ''} on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
    </div>
  `;

  return buildDocumentHtml({
    title: 'Medical History',
    subtitle: template.headerText ?? patient.fullName,
    bodyHtml,
    template,
  });
}
