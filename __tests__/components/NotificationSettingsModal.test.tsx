import React from 'react';
import { render, fireEvent, screen, act, cleanup } from '@testing-library/react-native';
import { NotificationSettingsModal } from '../../components/NotificationSettingsModal';
import { AppSettings } from '../../lib/app-settings';

afterEach(cleanup);

const defaultSettings: AppSettings = {
  defaultDurationMinutes: 30,
  scheduleSlotIntervalMinutes: 15,
  defaultApptType: 'inPerson',
  remindersEnabled: true,
  reminderLeadMinutes: 15,
  dailySummaryEnabled: false,
  dailySummaryTime: '08:00',
  theme: 'light',
  biometricLockEnabled: false,
  autoLockMinutes: 0,
  defaultPaymentType: 'private',
  invoiceFooterText: '',
};

async function renderModal(
  settings = defaultSettings,
  onSave = jest.fn(),
  onClose = jest.fn(),
) {
  return render(
    <NotificationSettingsModal
      visible
      settings={settings}
      onSave={onSave}
      onClose={onClose}
    />,
  );
}

describe('NotificationSettingsModal', () => {
  it('renders reminders toggle', async () => {
    await renderModal();
    expect(screen.getByText('Appointment Reminders')).toBeTruthy();
  });

  it('renders lead time options when reminders are enabled', async () => {
    await renderModal();
    expect(screen.getByText('15 minutes before')).toBeTruthy();
    expect(screen.getByText('1 hour before')).toBeTruthy();
    expect(screen.getByText('2 hours before')).toBeTruthy();
    expect(screen.getByText('24 hours before')).toBeTruthy();
  });

  it('hides lead time options when reminders are disabled', async () => {
    await renderModal({ ...defaultSettings, remindersEnabled: false });
    expect(screen.queryByText('15 minutes before')).toBeNull();
    expect(screen.queryByText('1 hour before')).toBeNull();
  });

  it('renders daily summary toggle', async () => {
    await renderModal();
    expect(screen.getByText('Daily Summary')).toBeTruthy();
  });

  it('calls onSave with remindersEnabled: false when toggled off', async () => {
    const onSave = jest.fn();
    await renderModal(defaultSettings, onSave);
    const switches = screen.getAllByRole('switch');
    await act(async () => {
      fireEvent(switches[0], 'valueChange', false);
    });
    fireEvent.press(screen.getByText('Save'));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ remindersEnabled: false }),
    );
  });

  it('calls onSave with selected lead time', async () => {
    const onSave = jest.fn();
    await renderModal(defaultSettings, onSave);
    await act(async () => {
      fireEvent.press(screen.getByText('1 hour before'));
    });
    fireEvent.press(screen.getByText('Save'));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ reminderLeadMinutes: 60 }),
    );
  });

  it('calls onClose after saving', async () => {
    const onClose = jest.fn();
    await renderModal(defaultSettings, jest.fn(), onClose);
    fireEvent.press(screen.getByText('Save'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not render when visible is false', async () => {
    await render(
      <NotificationSettingsModal
        visible={false}
        settings={defaultSettings}
        onSave={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    expect(screen.queryByText('Save')).toBeNull();
  });
});
