import { supabase } from './supabase';
import { Appointment, Patient, MedicalRecord, Prescription, PrescriptionItem, Professional } from './types';

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

export async function getPatients(professionalId: string, search?: string) {
  let query = supabase
    .from('patients')
    .select('*')
    .eq('professional_id', professionalId)
    .order('full_name');
  if (search) query = query.ilike('full_name', `%${search}%`);
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
    })
    .select()
    .single();
  if (error) throw error;
  return toRecord(data);
}

// ─── Payments ────────────────────────────────────────────────────────────────

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
    })
    .select()
    .single();
  if (error) throw error;
  return toProfessional(data as Record<string, unknown>);
}

function toProfessional(row: Record<string, unknown>): Professional {
  return {
    id: row.id as string,
    fullName: (row.full_name as string) ?? '',
    email: (row.email as string) ?? '',
    clinicName: row.clinic_name as string | undefined,
    specialty: row.specialty as string | undefined,
  };
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
