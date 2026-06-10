import * as FileSystem from 'expo-file-system';
import { supabase } from './supabase';
import { Appointment, AppointmentExtraItem, Patient, MedicalRecord, Prescription, PrescriptionItem, Professional, WorkingHours, Procedure, PatientFile } from './types';

// ─── Appointments ────────────────────────────────────────────────────────────

export async function getAppointmentsByDate(professionalId: string, date: string) {
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('professional_id', professionalId)
    .eq('date', date)
    .order('start_time');
  if (error) throw error;
  return (data ?? []).map(toAppointment);
}

export async function getAppointmentsByWeek(professionalId: string, from: string, to: string) {
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('professional_id', professionalId)
    .gte('date', from)
    .lte('date', to)
    .order('date')
    .order('start_time');
  if (error) throw error;
  return (data ?? []).map(toAppointment);
}

export async function getAppointmentCountsByWeek(
  professionalId: string,
  from: string,
  to: string,
): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('appointments')
    .select('date')
    .eq('professional_id', professionalId)
    .gte('date', from)
    .lte('date', to)
    .neq('status', 'blocked');
  if (error) throw error;
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    const d = row.date as string;
    counts[d] = (counts[d] ?? 0) + 1;
  }
  return counts;
}

export async function updateAppointmentStatus(id: string, status: Appointment['status']) {
  const { error } = await supabase
    .from('appointments')
    .update({ status })
    .eq('id', id);
  if (error) throw error;
}

export async function updatePaymentStatus(id: string, status: 'pending' | 'paid') {
  const { error } = await supabase
    .from('appointments')
    .update({ payment_status: status })
    .eq('id', id);
  if (error) throw error;
}

export async function createAppointment(appt: Omit<Appointment, 'id'>) {
  const { data, error } = await supabase
    .from('appointments')
    .insert(fromAppointment(appt))
    .select()
    .single();
  if (error) throw error;
  return toAppointment(data);
}

// ─── Patients ────────────────────────────────────────────────────────────────

export async function getPatients(
  professionalId: string,
  search?: string,
  opts?: { sex?: string; offset?: number; limit?: number },
) {
  const { sex, offset = 0, limit = 30 } = opts ?? {};
  let query = supabase
    .from('patients')
    .select('*')
    .eq('professional_id', professionalId)
    .order('full_name')
    .range(offset, offset + limit - 1);
  if (search) query = query.ilike('full_name', `%${search}%`);
  if (sex) query = query.eq('sex', sex);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(toPatient);
}

export async function getPatient(id: string) {
  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return toPatient(data);
}

export async function createPatient(patient: Omit<Patient, 'id' | 'createdAt'>, professionalId: string) {
  const { data, error } = await supabase
    .from('patients')
    .insert({ ...fromPatient(patient), professional_id: professionalId })
    .select()
    .single();
  if (error) throw error;
  return toPatient(data);
}

export async function updatePatient(id: string, updates: Partial<Patient>) {
  const { error } = await supabase
    .from('patients')
    .update(fromPatient(updates as Patient))
    .eq('id', id);
  if (error) throw error;
}

export async function deletePatient(id: string): Promise<void> {
  const { error } = await supabase.from('patients').delete().eq('id', id);
  if (error) throw error;
}

// ─── Medical Records ─────────────────────────────────────────────────────────

export async function getRecords(patientId: string) {
  const { data, error } = await supabase
    .from('medical_records')
    .select('*')
    .eq('patient_id', patientId)
    .order('date', { ascending: false })
    .order('time', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toRecord);
}

export async function createRecord(record: Omit<MedicalRecord, 'id' | 'createdAt'>) {
  const { data, error } = await supabase
    .from('medical_records')
    .insert({
      patient_id: record.patientId,
      professional_id: record.professionalId,
      date: record.date,
      time: record.time,
      content: record.content,
      record_type: record.recordType ?? 'Free text',
    })
    .select()
    .single();
  if (error) throw error;
  return toRecord(data);
}

export async function getPatientAppointments(patientId: string) {
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('patient_id', patientId)
    .order('date', { ascending: false })
    .order('start_time', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toAppointment);
}

export async function searchAppointments(professionalId: string, query: string) {
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('professional_id', professionalId)
    .ilike('patient_name', `%${query}%`)
    .neq('status', 'blocked')
    .order('date', { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []).map(toAppointment);
}

export async function updateAppointment(id: string, updates: Partial<Appointment>) {
  const mapped: Record<string, unknown> = {};
  if (updates.patientId !== undefined) mapped.patient_id = updates.patientId || null;
  if (updates.patientName !== undefined) mapped.patient_name = updates.patientName;
  if (updates.date !== undefined) mapped.date = updates.date;
  if (updates.startTime !== undefined) mapped.start_time = updates.startTime;
  if (updates.endTime !== undefined) mapped.end_time = updates.endTime;
  if (updates.durationMinutes !== undefined) mapped.duration_minutes = updates.durationMinutes;
  if (updates.type !== undefined) mapped.type = updates.type;
  if (updates.consultationType !== undefined) mapped.consultation_type = updates.consultationType;
  if (updates.paymentType !== undefined) mapped.payment_type = updates.paymentType;
  if (updates.paymentAmount !== undefined) mapped.payment_amount = updates.paymentAmount;
  if (updates.paymentStatus !== undefined) mapped.payment_status = updates.paymentStatus;
  if (updates.status !== undefined) mapped.status = updates.status;
  if (updates.notes !== undefined) mapped.notes = updates.notes || null;
  if (updates.extraItems !== undefined) mapped.extra_items = updates.extraItems;
  const { error } = await supabase.from('appointments').update(mapped).eq('id', id);
  if (error) throw error;
}

export async function deleteAppointment(id: string): Promise<void> {
  const { error } = await supabase.from('appointments').delete().eq('id', id);
  if (error) throw error;
}

export async function createRecurringAppointments(
  baseAppt: Omit<Appointment, 'id'>,
  recurrence: 'weekly' | 'biweekly' | 'monthly',
  occurrences: number,
): Promise<Appointment[]> {
  const results: Appointment[] = [];
  const [yr, mo, dy] = baseAppt.date.split('-').map(Number);
  for (let i = 0; i < occurrences; i++) {
    let d: Date;
    if (recurrence === 'weekly') d = new Date(yr, mo - 1, dy + i * 7);
    else if (recurrence === 'biweekly') d = new Date(yr, mo - 1, dy + i * 14);
    else d = new Date(yr, mo - 1 + i, dy);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const saved = await createAppointment({ ...baseAppt, date: dateStr });
    results.push(saved);
  }
  return results;
}

// ─── Payments ────────────────────────────────────────────────────────────────

export async function getRevenueByMonth(
  professionalId: string,
  monthsBack = 6,
): Promise<{ month: string; paid: number; pending: number; count: number }[]> {
  const from = new Date();
  from.setMonth(from.getMonth() - monthsBack + 1);
  from.setDate(1);
  const fromStr = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-01`;

  const { data, error } = await supabase
    .from('appointments')
    .select('date, payment_amount, payment_status')
    .eq('professional_id', professionalId)
    .gte('date', fromStr)
    .neq('status', 'blocked');
  if (error) throw error;

  const map: Record<string, { paid: number; pending: number; count: number }> = {};
  for (const row of data ?? []) {
    const month = (row.date as string).slice(0, 7);
    if (!map[month]) map[month] = { paid: 0, pending: 0, count: 0 };
    const amount = (row.payment_amount as number) ?? 0;
    map[month].count++;
    if (row.payment_status === 'paid') map[month].paid += amount;
    else map[month].pending += amount;
  }

  return Object.entries(map)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, vals]) => ({ month, ...vals }));
}

export async function getPendingPayments(professionalId: string, from?: string, to?: string) {
  let query = supabase
    .from('appointments')
    .select('*')
    .eq('professional_id', professionalId)
    .eq('payment_status', 'pending')
    .neq('status', 'blocked')
    .order('date');
  if (from) query = query.gte('date', from);
  if (to) query = query.lte('date', to);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(toAppointment);
}

export async function getPaidPayments(professionalId: string, from?: string, to?: string) {
  let query = supabase
    .from('appointments')
    .select('*')
    .eq('professional_id', professionalId)
    .eq('payment_status', 'paid')
    .order('date', { ascending: false });
  if (from) query = query.gte('date', from);
  if (to) query = query.lte('date', to);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(toAppointment);
}

// ─── Mappers ─────────────────────────────────────────────────────────────────

function toAppointment(row: Record<string, unknown>): Appointment {
  return {
    id: row.id as string,
    patientId: row.patient_id as string ?? '',
    patientName: row.patient_name as string ?? '',
    date: row.date as string,
    startTime: row.start_time as string,
    endTime: row.end_time as string,
    durationMinutes: row.duration_minutes as number,
    type: row.type as Appointment['type'],
    consultationType: row.consultation_type as string,
    paymentType: row.payment_type as Appointment['paymentType'],
    paymentAmount: row.payment_amount as number,
    paymentStatus: row.payment_status as Appointment['paymentStatus'],
    status: row.status as Appointment['status'],
    notes: row.notes as string,
    extraItems: Array.isArray(row.extra_items) ? (row.extra_items as AppointmentExtraItem[]) : [],
    scheduledBy: row.scheduled_by as string | undefined,
    professionalId: row.professional_id as string,
  };
}

function fromAppointment(a: Omit<Appointment, 'id'>) {
  return {
    patient_id: a.patientId || null,
    patient_name: a.patientName,
    professional_id: a.professionalId,
    date: a.date,
    start_time: a.startTime,
    end_time: a.endTime,
    duration_minutes: a.durationMinutes,
    type: a.type,
    consultation_type: a.consultationType,
    payment_type: a.paymentType,
    payment_amount: a.paymentAmount,
    payment_status: a.paymentStatus,
    status: a.status,
    notes: a.notes,
    extra_items: a.extraItems ?? [],
  };
}

function toPatient(row: Record<string, unknown>): Patient {
  return {
    id: row.id as string,
    fullName: row.full_name as string,
    cpf: row.cpf as string,
    rg: row.rg as string,
    sex: row.sex as Patient['sex'],
    birthDate: row.birth_date as string,
    profession: row.profession as string,
    email: row.email as string,
    phone: row.phone as string,
    tags: row.tags as string[],
    photoUrl: (row.photo_url as string) || undefined,
    createdAt: row.created_at as string,
  };
}

function fromPatient(p: Partial<Patient>) {
  return {
    full_name: p.fullName,
    cpf: p.cpf,
    rg: p.rg,
    sex: p.sex,
    birth_date: p.birthDate,
    profession: p.profession,
    email: p.email,
    phone: p.phone,
    tags: p.tags,
    photo_url: p.photoUrl ?? null,
  };
}

function toProcedure(row: Record<string, unknown>): Procedure {
  return {
    id: row.id as string,
    professionalId: row.professional_id as string,
    name: row.name as string,
    durationMinutes: row.duration_minutes as number,
    price: row.price != null ? Number(row.price) : undefined,
    paymentType: row.payment_type as Procedure['paymentType'],
    active: row.active as boolean,
  };
}

function toRecord(row: Record<string, unknown>): MedicalRecord {
  return {
    id: row.id as string,
    patientId: row.patient_id as string,
    professionalId: row.professional_id as string,
    date: row.date as string,
    time: row.time as string,
    content: row.content as string,
    recordType: row.record_type as string | undefined,
    createdAt: row.created_at as string,
  };
}

// ─── Prescriptions ───────────────────────────────────────────────────────────

export async function getPrescriptions(patientId: string) {
  const { data, error } = await supabase
    .from('prescriptions')
    .select('*, prescription_items(*)')
    .eq('patient_id', patientId)
    .order('date', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toPrescription);
}

export async function createPrescription(
  patientId: string,
  professionalId: string,
  medications: PrescriptionItem[],
  notes?: string,
): Promise<Prescription> {
  const date = new Date().toISOString().split('T')[0];
  const { data: prescription, error: pError } = await supabase
    .from('prescriptions')
    .insert({ patient_id: patientId, professional_id: professionalId, date, notes: notes ?? null })
    .select()
    .single();
  if (pError) throw pError;

  if (medications.length > 0) {
    const items = medications.map(m => ({
      prescription_id: prescription.id,
      name: m.name,
      dosage: m.dosage,
      frequency: m.frequency,
      duration: m.duration,
    }));
    const { error: iError } = await supabase.from('prescription_items').insert(items);
    if (iError) throw iError;
  }

  return { ...toPrescription(prescription), medications };
}

// ─── Professionals ───────────────────────────────────────────────────────────

export async function getProfessional(id: string): Promise<Professional | null> {
  const { data, error } = await supabase
    .from('professionals')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return toProfessional(data as Record<string, unknown>);
}

export async function upsertProfessional(
  id: string,
  email: string,
  updates: Partial<Professional>,
): Promise<Professional> {
  const { data, error } = await supabase
    .from('professionals')
    .upsert({
      id,
      email,
      full_name: updates.fullName ?? '',
      clinic_name: updates.clinicName ?? null,
      specialty: updates.specialty ?? null,
      ...(updates.photoUrl !== undefined ? { photo_url: updates.photoUrl } : {}),
    })
    .select()
    .single();
  if (error) throw error;
  return toProfessional(data as Record<string, unknown>);
}

export async function updateWorkingHours(professionalId: string, workingHours: WorkingHours) {
  const { error } = await supabase
    .from('professionals')
    .update({ working_hours: workingHours })
    .eq('id', professionalId);
  if (error) throw error;
}

function toProfessional(row: Record<string, unknown>): Professional {
  return {
    id: row.id as string,
    fullName: (row.full_name as string) ?? '',
    email: (row.email as string) ?? '',
    photoUrl: (row.photo_url as string) || undefined,
    clinicName: row.clinic_name as string | undefined,
    clinicCnpj: row.clinic_cnpj as string | undefined,
    clinicAddress: row.clinic_address as string | undefined,
    clinicCity: row.clinic_city as string | undefined,
    clinicState: row.clinic_state as string | undefined,
    clinicPhone: row.clinic_phone as string | undefined,
    clinicWebsite: row.clinic_website as string | undefined,
    specialty: row.specialty as string | undefined,
    workingHours: (row.working_hours as WorkingHours | undefined) ?? undefined,
  };
}

export async function updateProfessional(id: string, updates: Partial<Professional>): Promise<void> {
  const mapped: Record<string, unknown> = {};
  if (updates.fullName !== undefined) mapped.full_name = updates.fullName;
  if (updates.clinicName !== undefined) mapped.clinic_name = updates.clinicName || null;
  if (updates.clinicCnpj !== undefined) mapped.clinic_cnpj = updates.clinicCnpj || null;
  if (updates.clinicAddress !== undefined) mapped.clinic_address = updates.clinicAddress || null;
  if (updates.clinicCity !== undefined) mapped.clinic_city = updates.clinicCity || null;
  if (updates.clinicState !== undefined) mapped.clinic_state = updates.clinicState || null;
  if (updates.clinicPhone !== undefined) mapped.clinic_phone = updates.clinicPhone || null;
  if (updates.clinicWebsite !== undefined) mapped.clinic_website = updates.clinicWebsite || null;
  if (updates.specialty !== undefined) mapped.specialty = updates.specialty || null;
  if (updates.photoUrl !== undefined) mapped.photo_url = updates.photoUrl || null;
  const { error } = await supabase.from('professionals').update(mapped).eq('id', id);
  if (error) throw error;
}

// ─── Patient Files ────────────────────────────────────────────────────────────

export async function getPatientFiles(
  professionalId: string,
  patientId: string,
): Promise<PatientFile[]> {
  const folder = `${professionalId}/${patientId}`;
  const { data, error } = await supabase.storage
    .from('patient-files')
    .list(folder, { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });
  if (error) throw error;
  return (data ?? [])
    .filter(f => f.name && f.name !== '.emptyFolderPlaceholder')
    .map(f => {
      const path = `${folder}/${f.name}`;
      const { data: urlData } = supabase.storage.from('patient-files').getPublicUrl(path);
      return {
        name: f.name,
        storagePath: path,
        url: urlData.publicUrl,
        mimeType: (f.metadata?.['mimetype'] as string) ?? 'application/octet-stream',
        size: (f.metadata?.['size'] as number) ?? 0,
        createdAt: f.created_at ?? new Date().toISOString(),
      };
    });
}

export async function uploadPatientFile(
  professionalId: string,
  patientId: string,
  uri: string,
  name: string,
  mimeType = 'application/octet-stream',
): Promise<PatientFile> {
  const folder = `${professionalId}/${patientId}`;
  const path = `${folder}/${name}`;
  const response = await fetch(uri);
  const blob = await response.blob();
  const { error } = await supabase.storage
    .from('patient-files')
    .upload(path, blob, { upsert: true, contentType: mimeType });
  if (error) throw error;
  const { data } = supabase.storage.from('patient-files').getPublicUrl(path);
  return { name, storagePath: path, url: data.publicUrl, mimeType, size: 0, createdAt: new Date().toISOString() };
}

export async function deletePatientFile(storagePath: string): Promise<void> {
  const { error } = await supabase.storage.from('patient-files').remove([storagePath]);
  if (error) throw error;
}

// ─── Patient Exams ────────────────────────────────────────────────────────────
// Stored in patient-files bucket under exams/ subfolder to avoid a second bucket.

export async function getPatientExams(
  professionalId: string,
  patientId: string,
): Promise<PatientFile[]> {
  const folder = `${professionalId}/${patientId}/exams`;
  const { data, error } = await supabase.storage
    .from('patient-files')
    .list(folder, { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });
  if (error) throw error;
  return (data ?? [])
    .filter(f => f.name && f.name !== '.emptyFolderPlaceholder')
    .map(f => {
      const path = `${folder}/${f.name}`;
      const { data: urlData } = supabase.storage.from('patient-files').getPublicUrl(path);
      return {
        name: f.name,
        storagePath: path,
        url: urlData.publicUrl,
        mimeType: (f.metadata?.['mimetype'] as string) ?? 'application/octet-stream',
        size: (f.metadata?.['size'] as number) ?? 0,
        createdAt: f.created_at ?? new Date().toISOString(),
      };
    });
}

export async function uploadPatientExam(
  professionalId: string,
  patientId: string,
  uri: string,
  name: string,
  mimeType = 'application/octet-stream',
): Promise<PatientFile> {
  const folder = `${professionalId}/${patientId}/exams`;
  const path = `${folder}/${name}`;
  const response = await fetch(uri);
  const blob = await response.blob();
  const { error } = await supabase.storage
    .from('patient-files')
    .upload(path, blob, { upsert: true, contentType: mimeType });
  if (error) throw error;
  const { data } = supabase.storage.from('patient-files').getPublicUrl(path);
  return { name, storagePath: path, url: data.publicUrl, mimeType, size: 0, createdAt: new Date().toISOString() };
}

export async function deletePatientExam(storagePath: string): Promise<void> {
  const { error } = await supabase.storage.from('patient-files').remove([storagePath]);
  if (error) throw error;
}

// ─── Procedures ──────────────────────────────────────────────────────────────

export async function getProcedures(professionalId: string): Promise<Procedure[]> {
  const { data, error } = await supabase
    .from('procedures')
    .select('*')
    .eq('professional_id', professionalId)
    .order('sort_order')
    .order('name');
  if (error) throw error;
  return (data ?? []).map(toProcedure);
}

export async function createProcedure(
  data: Omit<Procedure, 'id'>,
): Promise<Procedure> {
  const { data: row, error } = await supabase
    .from('procedures')
    .insert({
      professional_id: data.professionalId,
      name: data.name,
      duration_minutes: data.durationMinutes,
      price: data.price ?? null,
      payment_type: data.paymentType,
      active: data.active,
    })
    .select()
    .single();
  if (error) throw error;
  return toProcedure(row);
}

export async function updateProcedure(
  id: string,
  updates: Partial<Omit<Procedure, 'id' | 'professionalId'>>,
): Promise<void> {
  const mapped: Record<string, unknown> = {};
  if (updates.name !== undefined) mapped.name = updates.name;
  if (updates.durationMinutes !== undefined) mapped.duration_minutes = updates.durationMinutes;
  if (updates.price !== undefined) mapped.price = updates.price ?? null;
  if (updates.paymentType !== undefined) mapped.payment_type = updates.paymentType;
  if (updates.active !== undefined) mapped.active = updates.active;
  const { error } = await supabase.from('procedures').update(mapped).eq('id', id);
  if (error) throw error;
}

export async function deleteProcedure(id: string): Promise<void> {
  const { error } = await supabase.from('procedures').delete().eq('id', id);
  if (error) throw error;
}

// ─── Patient Photo ────────────────────────────────────────────────────────────

async function uriToBytes(uri: string): Promise<Uint8Array> {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
  return bytes;
}

export async function uploadPatientPhoto(
  professionalId: string,
  patientId: string,
  uri: string,
  mimeType = 'image/jpeg',
): Promise<string> {
  const ext = mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
  const path = `${professionalId}/${patientId}.${ext}`;
  const bytes = await uriToBytes(uri);
  const { error } = await supabase.storage
    .from('patient-photos')
    .upload(path, bytes, { upsert: true, contentType: mimeType });
  if (error) throw error;
  const { data } = supabase.storage.from('patient-photos').getPublicUrl(path);
  return `${data.publicUrl}?t=${Date.now()}`;
}

export async function uploadProfilePhoto(
  professionalId: string,
  uri: string,
  mimeType = 'image/jpeg',
): Promise<string> {
  const ext = mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
  const path = `${professionalId}/avatar.${ext}`;
  const bytes = await uriToBytes(uri);
  const { error } = await supabase.storage
    .from('profile-photos')
    .upload(path, bytes, { upsert: true, contentType: mimeType });
  if (error) throw error;
  const { data } = supabase.storage.from('profile-photos').getPublicUrl(path);
  return `${data.publicUrl}?t=${Date.now()}`;
}

function toPrescription(row: Record<string, unknown>): Prescription {
  const items = (row.prescription_items as Record<string, unknown>[] | undefined) ?? [];
  return {
    id: row.id as string,
    patientId: row.patient_id as string,
    professionalId: row.professional_id as string,
    date: row.date as string,
    notes: row.notes as string | undefined,
    medications: items.map(i => ({
      name: i.name as string,
      dosage: i.dosage as string,
      frequency: i.frequency as string,
      duration: i.duration as string,
    })),
  };
}
