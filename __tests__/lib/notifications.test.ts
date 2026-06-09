import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  scheduleAppointmentReminder,
  cancelAppointmentReminder,
  requestNotificationPermissions,
} from '../../lib/notifications';
import { Appointment } from '../../lib/types';

const SETTINGS_KEY = '@solvymed/settings';

function makeFutureAppointment(offsetMinutes = 60): Appointment {
  const now = new Date();
  const apptTime = new Date(now.getTime() + offsetMinutes * 60 * 1000);
  const date = [
    apptTime.getFullYear(),
    String(apptTime.getMonth() + 1).padStart(2, '0'),
    String(apptTime.getDate()).padStart(2, '0'),
  ].join('-');
  const h = String(apptTime.getHours()).padStart(2, '0');
  const m = String(apptTime.getMinutes()).padStart(2, '0');
  return {
    id: 'appt-1',
    patientId: 'patient-1',
    patientName: 'Maria Silva',
    date,
    startTime: `${h}:${m}`,
    endTime: `${h}:${String(apptTime.getMinutes() + 30).padStart(2, '0')}`,
    durationMinutes: 30,
    type: 'in-person',
    consultationType: 'Consultation',
    paymentType: 'private',
    paymentStatus: 'pending',
    status: 'scheduled',
    professionalId: 'prof-1',
  };
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

// ─── requestNotificationPermissions ──────────────────────────────────────────

describe('requestNotificationPermissions()', () => {
  it('returns true when permissions are already granted', async () => {
    const result = await requestNotificationPermissions();
    expect(result).toBe(true);
  });

  it('requests permissions when not yet granted', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'undetermined' });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'granted' });
    const result = await requestNotificationPermissions();
    expect(result).toBe(true);
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('returns false when permissions are denied', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'undetermined' });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'denied' });
    const result = await requestNotificationPermissions();
    expect(result).toBe(false);
  });
});

// ─── scheduleAppointmentReminder ─────────────────────────────────────────────

describe('scheduleAppointmentReminder()', () => {
  it('schedules a notification for a future appointment', async () => {
    const appt = makeFutureAppointment(60);
    await scheduleAppointmentReminder(appt);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const call = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(call.identifier).toBe('appt-appt-1');
    expect(call.content.body).toContain('Maria Silva');
  });

  it('uses the reminderLeadMinutes from settings', async () => {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ reminderLeadMinutes: 60, remindersEnabled: true }));
    const appt = makeFutureAppointment(120);
    await scheduleAppointmentReminder(appt);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const call = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(call.content.title).toContain('1h');
  });

  it('shows "15 min" label when lead time is 15 minutes', async () => {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ reminderLeadMinutes: 15, remindersEnabled: true }));
    const appt = makeFutureAppointment(60);
    await scheduleAppointmentReminder(appt);
    const call = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(call.content.title).toContain('15 min');
  });

  it('does NOT schedule when remindersEnabled is false', async () => {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ remindersEnabled: false }));
    const appt = makeFutureAppointment(60);
    await scheduleAppointmentReminder(appt);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('does NOT schedule for a cancelled appointment', async () => {
    const appt = { ...makeFutureAppointment(60), status: 'cancelled' as const };
    await scheduleAppointmentReminder(appt);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('does NOT schedule for a blocked time slot', async () => {
    const appt = { ...makeFutureAppointment(60), status: 'blocked' as const };
    await scheduleAppointmentReminder(appt);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('does NOT schedule when reminder time is already in the past', async () => {
    // Appointment is only 5 minutes away but lead time is 15 min
    const appt = makeFutureAppointment(5);
    await scheduleAppointmentReminder(appt);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('does NOT schedule a duplicate if already scheduled', async () => {
    const appt = makeFutureAppointment(60);
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValueOnce([
      { identifier: 'appt-appt-1' },
    ]);
    await scheduleAppointmentReminder(appt);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('does NOT schedule when permissions are denied', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'undetermined' });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'denied' });
    const appt = makeFutureAppointment(60);
    await scheduleAppointmentReminder(appt);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});

// ─── cancelAppointmentReminder ────────────────────────────────────────────────

describe('cancelAppointmentReminder()', () => {
  it('cancels the notification for the given appointment id', async () => {
    await cancelAppointmentReminder('appt-123');
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('appt-appt-123');
  });

  it('does not throw if the notification does not exist', async () => {
    (Notifications.cancelScheduledNotificationAsync as jest.Mock).mockRejectedValueOnce(
      new Error('Not found'),
    );
    await expect(cancelAppointmentReminder('ghost-id')).resolves.not.toThrow();
  });
});
