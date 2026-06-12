import { supabase } from './supabase';
import { Appointment, WorkingHours, WorkingHoursKey } from './types';
import {
  notifyNewTentativeBooking,
  notifyPatientAcceptedProposal,
  notifyPatientDeclinedProposal,
  notifyBookingCancelledByPatient,
} from './notifications';

const DAY_KEYS: WorkingHoursKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function fromMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export type TimeSlot = { start: string; end: string };

export async function getAvailableSlots(
  professionalId: string,
  date: string,
  durationMinutes = 30,
): Promise<TimeSlot[]> {
  if (!professionalId) return [];

  // Get working hours
  const { data: profData } = await supabase
    .from('professionals')
    .select('working_hours')
    .eq('id', professionalId)
    .maybeSingle();

  const wh = (profData?.working_hours ?? {}) as WorkingHours;
  const dayKey = DAY_KEYS[new Date(date + 'T12:00:00').getDay()];
  const dayHours = wh[dayKey];

  if (!dayHours?.enabled) return [];

  const dayStart = toMinutes(dayHours.start);
  const dayEnd = toMinutes(dayHours.end);

  // Get busy slots via SECURITY DEFINER function
  const { data: busy } = await supabase.rpc('get_busy_slots', {
    p_professional_id: professionalId,
    p_date: date,
  });

  const busyRanges: Array<{ start: number; end: number }> = (busy ?? []).map(
    (row: Record<string, unknown>) => ({
      start: toMinutes(row.slot_start as string),
      end: toMinutes(row.slot_end as string),
    }),
  );

  const slots: TimeSlot[] = [];
  let cursor = dayStart;

  while (cursor + durationMinutes <= dayEnd) {
    const slotEnd = cursor + durationMinutes;
    const taken = busyRanges.some(r => cursor < r.end && slotEnd > r.start);
    if (!taken) {
      slots.push({ start: fromMinutes(cursor), end: fromMinutes(slotEnd) });
    }
    cursor += durationMinutes;
  }

  return slots;
}

export async function createTentativeBooking(opts: {
  professionalId: string;
  patientAuthId: string;
  patientName: string;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  consultationType: string;
  paymentType?: string;
  notes?: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc('create_public_booking', {
    p_professional_id: opts.professionalId,
    p_patient_auth_id: opts.patientAuthId,
    p_patient_name: opts.patientName,
    p_date: opts.date,
    p_start_time: opts.startTime,
    p_end_time: opts.endTime,
    p_duration_minutes: opts.durationMinutes,
    p_consultation_type: opts.consultationType,
    p_payment_type: opts.paymentType ?? 'private',
    p_notes: opts.notes ?? null,
  });

  if (error) {
    if (error.message?.includes('slot_taken')) throw new Error('slot_taken');
    if (error.message?.includes('blocked from scheduling')) throw new Error('patient_blocked');
    if (error.message?.includes('Max concurrent bookings reached')) throw new Error('max_bookings_reached');
    throw error;
  }
  const appointmentId = data as string;

  // Notify the professional
  notifyNewTentativeBooking(
    opts.professionalId,
    opts.patientName,
    opts.date,
    opts.startTime,
  ).catch(() => {});

  return appointmentId;
}

export async function getMyBookings(patientAuthId: string): Promise<Appointment[]> {
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('patient_auth_id', patientAuthId)
    .order('date')
    .order('start_time');
  if (error) throw error;
  return (data ?? []).map(toAppointment);
}

export async function cancelMyBooking(appointmentId: string): Promise<void> {
  const { data: appt } = await supabase
    .from('appointments')
    .select('professional_id, patient_name')
    .eq('id', appointmentId)
    .maybeSingle();

  const { error } = await supabase
    .from('appointments')
    .update({ status: 'cancelled' })
    .eq('id', appointmentId);
  if (error) throw error;

  if (appt) {
    notifyBookingCancelledByPatient(
      (appt as Record<string, unknown>).professional_id as string,
      (appt as Record<string, unknown>).patient_name as string,
    ).catch(() => {});
  }
}

export async function acceptProposal(appointmentId: string): Promise<void> {
  const { data, error } = await supabase
    .from('appointments')
    .select('proposed_date, proposed_start_time, proposed_end_time, professional_id, patient_name')
    .eq('id', appointmentId)
    .single();
  if (error) throw error;
  const row = data as Record<string, unknown>;
  const { error: upErr } = await supabase
    .from('appointments')
    .update({
      status: 'confirmed',
      date: row.proposed_date,
      start_time: row.proposed_start_time,
      end_time: row.proposed_end_time,
      proposed_date: null,
      proposed_start_time: null,
      proposed_end_time: null,
    })
    .eq('id', appointmentId);
  if (upErr) throw upErr;

  notifyPatientAcceptedProposal(
    row.professional_id as string,
    row.patient_name as string,
    row.proposed_date as string,
    (row.proposed_start_time as string)?.slice(0, 5),
  ).catch(() => {});
}

export async function declineProposal(appointmentId: string): Promise<void> {
  const { data: appt } = await supabase
    .from('appointments')
    .select('professional_id, patient_name')
    .eq('id', appointmentId)
    .maybeSingle();

  const { error } = await supabase
    .from('appointments')
    .update({
      status: 'cancelled',
      proposed_date: null,
      proposed_start_time: null,
      proposed_end_time: null,
    })
    .eq('id', appointmentId);
  if (error) throw error;

  if (appt) {
    notifyPatientDeclinedProposal(
      (appt as Record<string, unknown>).professional_id as string,
      (appt as Record<string, unknown>).patient_name as string,
    ).catch(() => {});
  }
}

function toAppointment(row: Record<string, unknown>): Appointment {
  return {
    id: row.id as string,
    patientId: (row.patient_id as string) ?? '',
    patientName: (row.patient_name as string) ?? '',
    date: row.date as string,
    startTime: row.start_time as string,
    endTime: row.end_time as string,
    durationMinutes: row.duration_minutes as number,
    type: row.type as Appointment['type'],
    consultationType: row.consultation_type as string,
    paymentType: row.payment_type as Appointment['paymentType'],
    paymentAmount: row.payment_amount as number | undefined,
    paymentStatus: row.payment_status as Appointment['paymentStatus'],
    status: row.status as Appointment['status'],
    notes: (row.notes as string) || undefined,
    extraItems: [],
    professionalId: row.professional_id as string,
    patientAuthId: (row.patient_auth_id as string) || undefined,
    proposedDate: (row.proposed_date as string) || undefined,
    proposedStartTime: (row.proposed_start_time as string) || undefined,
    proposedEndTime: (row.proposed_end_time as string) || undefined,
  };
}
