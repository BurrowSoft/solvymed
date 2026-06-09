import React from 'react';
import { render, fireEvent, screen, act, cleanup } from '@testing-library/react-native';
import { SchedulingSettingsModal } from '../../components/SchedulingSettingsModal';
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
    <SchedulingSettingsModal
      visible
      settings={settings}
      onSave={onSave}
      onClose={onClose}
    />,
  );
}

describe('SchedulingSettingsModal', () => {
  it('renders duration options', async () => {
    await renderModal();
    // "30 min" appears in both duration and interval rows
    expect(screen.getAllByText('30 min').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('45 min')).toBeTruthy();
    expect(screen.getByText('60 min')).toBeTruthy();
  });

  it('renders interval options', async () => {
    await renderModal();
    expect(screen.getByText('15 min')).toBeTruthy();
    // "30 min" appears in both duration and interval rows
    expect(screen.getAllByText('30 min').length).toBeGreaterThanOrEqual(2);
  });

  it('renders appointment type options', async () => {
    await renderModal();
    expect(screen.getByText('In-Person')).toBeTruthy();
    expect(screen.getByText('Online')).toBeTruthy();
  });

  it('calls onSave with selected values when Save is pressed', async () => {
    const onSave = jest.fn();
    await renderModal(defaultSettings, onSave);
    await act(async () => {
      fireEvent.press(screen.getByText('45 min'));
    });
    fireEvent.press(screen.getByText('Save'));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ defaultDurationMinutes: 45 }),
    );
  });

  it('calls onSave with appointment type change', async () => {
    const onSave = jest.fn();
    await renderModal(defaultSettings, onSave);
    await act(async () => {
      fireEvent.press(screen.getByText('Online'));
    });
    fireEvent.press(screen.getByText('Save'));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ defaultApptType: 'online' }),
    );
  });

  it('calls onClose when Save is pressed', async () => {
    const onClose = jest.fn();
    await renderModal(defaultSettings, jest.fn(), onClose);
    fireEvent.press(screen.getByText('Save'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('pre-selects the current duration from settings', async () => {
    await renderModal({ ...defaultSettings, defaultDurationMinutes: 60 });
    expect(screen.getByText('60 min')).toBeTruthy();
  });

  it('does not render when visible is false', async () => {
    await render(
      <SchedulingSettingsModal
        visible={false}
        settings={defaultSettings}
        onSave={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    expect(screen.queryByText('Save')).toBeNull();
  });
});
