/**
 * Regression: Critical UI components render without crashing
 *
 * Verifies that every modal can be mounted and unmounted cleanly
 * on every release. Does not test behavior, only mount/unmount health.
 */
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react-native';
import { SchedulingSettingsModal } from '../../components/SchedulingSettingsModal';
import { NotificationSettingsModal } from '../../components/NotificationSettingsModal';
import { ThemePickerModal } from '../../components/ThemePickerModal';
import { SecuritySettingsModal } from '../../components/SecuritySettingsModal';
import { FinancialSettingsModal } from '../../components/FinancialSettingsModal';
import { LanguagePickerModal } from '../../components/LanguagePickerModal';
import { LocaleProvider } from '../../lib/locale-context';
import { AppSettings } from '../../lib/app-settings';

afterEach(cleanup);

const settings: AppSettings = {
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

describe('[regression] Modal mount health', () => {
  it('SchedulingSettingsModal mounts without crashing', async () => {
    await render(
      <SchedulingSettingsModal visible settings={settings} onSave={jest.fn()} onClose={jest.fn()} />,
    );
    expect(screen.getByText('Save')).toBeTruthy();
  });

  it('NotificationSettingsModal mounts without crashing', async () => {
    await render(
      <NotificationSettingsModal visible settings={settings} onSave={jest.fn()} onClose={jest.fn()} />,
    );
    expect(screen.getByText('Save')).toBeTruthy();
  });

  it('ThemePickerModal mounts without crashing', async () => {
    await render(
      <ThemePickerModal visible currentTheme="light" onSelect={jest.fn()} onClose={jest.fn()} />,
    );
    expect(screen.getByText('Light')).toBeTruthy();
    expect(screen.getByText('Dark')).toBeTruthy();
    expect(screen.getByText('Warm')).toBeTruthy();
    expect(screen.getByText('Ocean')).toBeTruthy();
  });

  it('SecuritySettingsModal mounts without crashing', async () => {
    await render(
      <SecuritySettingsModal visible settings={settings} onSave={jest.fn()} onClose={jest.fn()} />,
    );
    expect(screen.getByText('Save')).toBeTruthy();
  });

  it('FinancialSettingsModal mounts without crashing', async () => {
    await render(
      <FinancialSettingsModal visible settings={settings} onSave={jest.fn()} onClose={jest.fn()} />,
    );
    expect(screen.getByText('Save')).toBeTruthy();
  });

  it('LanguagePickerModal mounts without crashing', async () => {
    await render(
      <LocaleProvider>
        <LanguagePickerModal visible onClose={jest.fn()} />
      </LocaleProvider>,
    );
    expect(screen.getByText('English')).toBeTruthy();
  });

  it('all modals render nothing when visible=false', async () => {
    for (const modal of [
      <SchedulingSettingsModal visible={false} settings={settings} onSave={jest.fn()} onClose={jest.fn()} />,
      <NotificationSettingsModal visible={false} settings={settings} onSave={jest.fn()} onClose={jest.fn()} />,
      <ThemePickerModal visible={false} currentTheme="light" onSelect={jest.fn()} onClose={jest.fn()} />,
      <SecuritySettingsModal visible={false} settings={settings} onSave={jest.fn()} onClose={jest.fn()} />,
      <FinancialSettingsModal visible={false} settings={settings} onSave={jest.fn()} onClose={jest.fn()} />,
    ]) {
      await render(modal);
      expect(screen.queryByText('Save')).toBeNull();
      cleanup();
    }
  });
});
