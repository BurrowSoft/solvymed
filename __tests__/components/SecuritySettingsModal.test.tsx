import React from 'react';
import { render, fireEvent, screen, act, waitFor, cleanup } from '@testing-library/react-native';
import { SecuritySettingsModal } from '../../components/SecuritySettingsModal';
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
    <SecuritySettingsModal
      visible
      settings={settings}
      onSave={onSave}
      onClose={onClose}
    />,
  );
}

describe('SecuritySettingsModal', () => {
  it('renders biometric lock toggle', async () => {
    await renderModal();
    await waitFor(() => {
      expect(screen.getByText('Biometric / PIN Lock')).toBeTruthy();
    });
  });

  it('renders all auto-lock options', async () => {
    await renderModal();
    await waitFor(() => {
      expect(screen.getByText('Never')).toBeTruthy();
      expect(screen.getByText('5 minutes')).toBeTruthy();
      expect(screen.getByText('15 minutes')).toBeTruthy();
      expect(screen.getByText('30 minutes')).toBeTruthy();
    });
  });

  it('calls onSave with selected auto-lock time', async () => {
    const onSave = jest.fn();
    await renderModal(defaultSettings, onSave);
    await waitFor(() => screen.getByText('15 minutes'));
    await act(async () => {
      fireEvent.press(screen.getByText('15 minutes'));
    });
    fireEvent.press(screen.getByText('Save'));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ autoLockMinutes: 15 }),
    );
  });

  it('calls onSave with autoLockMinutes: 0 when Never is selected', async () => {
    const onSave = jest.fn();
    await renderModal({ ...defaultSettings, autoLockMinutes: 30 }, onSave);
    await waitFor(() => screen.getByText('Never'));
    await act(async () => {
      fireEvent.press(screen.getByText('Never'));
    });
    fireEvent.press(screen.getByText('Save'));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ autoLockMinutes: 0 }),
    );
  });

  it('calls onClose after saving', async () => {
    const onClose = jest.fn();
    await renderModal(defaultSettings, jest.fn(), onClose);
    await waitFor(() => screen.getByText('Save'));
    fireEvent.press(screen.getByText('Save'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not render when not visible', async () => {
    await render(
      <SecuritySettingsModal
        visible={false}
        settings={defaultSettings}
        onSave={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    expect(screen.queryByText('Save')).toBeNull();
  });
});
