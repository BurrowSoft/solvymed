import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { Appointment } from './types';
import { getAppointmentsByDate } from './services';
import { loadSettings } from './app-settings';
import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

function reminderDate(appt: Appointment, leadMinutes: number): Date | null {
  const [yr, mo, dy] = appt.date.split('-').map(Number);
  const [h, m] = appt.startTime.split(':').map(Number);
  const apptTime = new Date(yr, mo - 1, dy, h, m, 0);
  const reminder = new Date(apptTime.getTime() - leadMinutes * 60 * 1000);
  return reminder > new Date() ? reminder : null;
}

export async function scheduleAppointmentReminder(appt: Appointment): Promise<void> {
  if (appt.status === 'blocked' || appt.status === 'cancelled') return;

  const settings = await loadSettings();
  if (!settings.remindersEnabled) return;

  const trigger = reminderDate(appt, settings.reminderLeadMinutes);
  if (!trigger) return;

  const granted = await requestNotificationPermissions();
  if (!granted) return;

  const id = `appt-${appt.id}`;
  const existing = await Notifications.getAllScheduledNotificationsAsync();
  if (existing.some(n => n.identifier === id)) return;

  const leadLabel = settings.reminderLeadMinutes < 60
    ? `${settings.reminderLeadMinutes} min`
    : `${settings.reminderLeadMinutes / 60}h`;

  await Notifications.scheduleNotificationAsync({
    identifier: id,
    content: {
      title: `Appointment in ${leadLabel}`,
      body: `${appt.patientName} — ${appt.consultationType}`,
      data: { appointmentId: appt.id },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: trigger },
  });
}

export async function cancelAppointmentReminder(apptId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(`appt-${apptId}`).catch(() => {});
}

export async function scheduleRemindersForToday(professionalId: string): Promise<void> {
  const granted = await requestNotificationPermissions();
  if (!granted) return;

  const today = new Date().toISOString().split('T')[0];
  const appointments = await getAppointmentsByDate(professionalId, today);

  for (const appt of appointments) {
    await scheduleAppointmentReminder(appt).catch(() => {});
  }
}

// ─── Booking state-change push notifications ─────────────────────────────────
// Used by professional-side actions to notify patients, and vice-versa.

async function getPushTokens(userIds: string[]): Promise<string[]> {
  if (!userIds.length) return [];
  const { data } = await supabase
    .from('push_tokens')
    .select('token')
    .in('user_id', userIds);
  return (data ?? []).map(r => r.token as string);
}

async function sendPush(tokens: string[], title: string, body: string) {
  if (!tokens.length) return;
  const messages = tokens.map(to => ({ to, title, body, sound: 'default' }));
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  }).catch(() => {});
}

async function getProfessionalTokens(professionalId: string): Promise<string[]> {
  return getPushTokens([professionalId]);
}

async function getPatientTokens(patientAuthId: string): Promise<string[]> {
  return getPushTokens([patientAuthId]);
}

export async function notifyNewTentativeBooking(professionalId: string, patientName: string, date: string, time: string) {
  const tokens = await getProfessionalTokens(professionalId);
  await sendPush(tokens, 'New Booking Request', `${patientName} requested an appointment on ${date} at ${time}.`);
}

export async function notifyBookingConfirmed(patientAuthId: string, date: string, time: string) {
  const tokens = await getPatientTokens(patientAuthId);
  await sendPush(tokens, 'Appointment Confirmed', `Your appointment on ${date} at ${time} has been confirmed.`);
}

export async function notifyBookingRejected(patientAuthId: string) {
  const tokens = await getPatientTokens(patientAuthId);
  await sendPush(tokens, 'Booking Not Available', 'The doctor could not accept your booking request.');
}

export async function notifyNewTimeProposed(patientAuthId: string, date: string, time: string) {
  const tokens = await getPatientTokens(patientAuthId);
  await sendPush(tokens, 'New Time Proposed', `The doctor suggested a new time: ${date} at ${time}.`);
}

export async function notifyPatientAcceptedProposal(professionalId: string, patientName: string, date: string, time: string) {
  const tokens = await getProfessionalTokens(professionalId);
  await sendPush(tokens, 'Proposal Accepted', `${patientName} accepted the new time: ${date} at ${time}.`);
}

export async function notifyPatientDeclinedProposal(professionalId: string, patientName: string) {
  const tokens = await getProfessionalTokens(professionalId);
  await sendPush(tokens, 'Proposal Declined', `${patientName} declined the proposed time. The booking was cancelled.`);
}

export async function notifyBookingChangedByPatient(professionalId: string, patientName: string, date: string, time: string) {
  const tokens = await getProfessionalTokens(professionalId);
  await sendPush(tokens, 'Booking Changed', `${patientName} changed their appointment to ${date} at ${time}.`);
}

export async function notifyBookingCancelledByPatient(professionalId: string, patientName: string) {
  const tokens = await getProfessionalTokens(professionalId);
  await sendPush(tokens, 'Booking Cancelled', `${patientName} cancelled their appointment.`);
}
