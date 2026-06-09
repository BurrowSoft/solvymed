import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { Appointment } from './types';
import { getAppointmentsByDate } from './services';

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

function reminderDate(appt: Appointment): Date | null {
  const [yr, mo, dy] = appt.date.split('-').map(Number);
  const [h, m] = appt.startTime.split(':').map(Number);
  const apptTime = new Date(yr, mo - 1, dy, h, m, 0);
  const reminder = new Date(apptTime.getTime() - 15 * 60 * 1000);
  return reminder > new Date() ? reminder : null;
}

export async function scheduleAppointmentReminder(appt: Appointment): Promise<void> {
  if (appt.status === 'blocked' || appt.status === 'cancelled') return;
  const trigger = reminderDate(appt);
  if (!trigger) return;

  const granted = await requestNotificationPermissions();
  if (!granted) return;

  const id = `appt-${appt.id}`;
  const existing = await Notifications.getAllScheduledNotificationsAsync();
  if (existing.some(n => n.identifier === id)) return;

  await Notifications.scheduleNotificationAsync({
    identifier: id,
    content: {
      title: 'Appointment in 15 minutes',
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
