/**
 * Integration: Notification scheduling respects settings
 *
 * Verifies that notification scheduling honours remindersEnabled,
 * reminderLeadMinutes, and cancelled/blocked appointment statuses.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { patchSettings } from '../../lib/app-settings';
import { scheduleAppointmentReminder, cancelAppointmentReminder } from '../../lib/notifications';
import type { Appointment } from '../../lib/types';

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

function makeAppt(offsetMinutes = 120, overrides: Partial<Appointment> = {}): Appointment {
  const now = new Date();
  const apptTime = new Date(now.getTime() + offsetMinutes * 60 * 1000);
  const date = apptTime.toISOString().split('T')[0];
  const h = String(apptTime.getHours()).padStart(2, '0');
  const m = String(apptTime.getMinutes()).padStart(2, '0');
  return {
    id: 'appt-1',
    patientId: 'patient-1',
    patientName: 'Maria Silva',
    date,
    startTime: `${h}:${m}`,
    endTime: `${h}:${m}`,
    durationMinutes: 30,
    type: 'in-person',
    consultationType: 'Consultation',
    paymentType: 'private',
    paymentStatus: 'pending',
    status: 'scheduled',
    professionalId: 'prof-1',
    ...overrides,
  } as Appointment;
}

describe('Notification scheduling honours settings', () => {
  it('does not schedule when remindersEnabled is false', async () => {
    await patchSettings({ remindersEnabled: false });
    await scheduleAppointmentReminder(makeAppt());
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('schedules a notification when remindersEnabled is true with 15-min lead', async () => {
    await patchSettings({ remindersEnabled: true, reminderLeadMinutes: 15 });
    // 120-min offset; 15-min lead → reminder is 105 min from now (valid)
    await scheduleAppointmentReminder(makeAppt());
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });

  it('does not schedule for cancelled appointments', async () => {
    await patchSettings({ remindersEnabled: true });
    await scheduleAppointmentReminder(makeAppt(120, { status: 'cancelled' }));
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('does not schedule for blocked appointments', async () => {
    await patchSettings({ remindersEnabled: true });
    await scheduleAppointmentReminder(makeAppt(120, { status: 'blocked' }));
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('respects 60-minute lead time — still valid for 2h-away appointment', async () => {
    await patchSettings({ remindersEnabled: true, reminderLeadMinutes: 60 });
    // Appointment is 2h from now; 60-min lead = trigger is 1h from now (valid)
    await scheduleAppointmentReminder(makeAppt(120));
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });

  it('respects 24-hour lead time — skips appointment only 2h away', async () => {
    await patchSettings({ remindersEnabled: true, reminderLeadMinutes: 1440 });
    // Appointment is 2h away; 24h lead would put trigger in the past → skip
    await scheduleAppointmentReminder(makeAppt(120));
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});

describe('Notification cancellation', () => {
  it('cancels the notification identified by appt-<id>', async () => {
    await cancelAppointmentReminder('appt-1');
    // cancelAppointmentReminder constructs the id as "appt-" + apptId
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('appt-appt-1');
  });

  it('does not throw if the notification does not exist', async () => {
    (Notifications.cancelScheduledNotificationAsync as jest.Mock).mockRejectedValueOnce(new Error('not found'));
    await expect(cancelAppointmentReminder('appt-missing')).resolves.not.toThrow();
  });
});
