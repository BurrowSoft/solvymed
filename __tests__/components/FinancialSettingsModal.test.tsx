import React from 'react';
import { render, fireEvent, screen, act, cleanup } from '@testing-library/react-native';
import { FinancialSettingsModal } from '../../components/FinancialSettingsModal';
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
    <FinancialSettingsModal
      visible
      settings={settings}
      onSave={onSave}
      onClose={onClose}
    />,
  );
}

describe('FinancialSettingsModal', () => {
  it('renders payment type options', async () => {
    await renderModal();
    expect(screen.getByText('Private')).toBeTruthy();
    expect(screen.getByText('Insurance')).toBeTruthy();
  });

  it('renders invoice footer input', async () => {
    await renderModal();
    expect(screen.getByPlaceholderText(/Tax ID|invoice|footer/i)).toBeTruthy();
  });

  it('pre-fills the invoice footer from settings', async () => {
    await renderModal({ ...defaultSettings, invoiceFooterText: 'CNPJ: 00.000.000/0001-00' });
    expect(screen.getByDisplayValue('CNPJ: 00.000.000/0001-00')).toBeTruthy();
  });

  it('calls onSave with insurance payment type', async () => {
    const onSave = jest.fn();
    await renderModal(defaultSettings, onSave);
    await act(async () => {
      fireEvent.press(screen.getByText('Insurance'));
    });
    fireEvent.press(screen.getByText('Save'));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPaymentType: 'insurance' }),
    );
  });

  it('calls onSave with private payment type', async () => {
    const onSave = jest.fn();
    await renderModal({ ...defaultSettings, defaultPaymentType: 'insurance' }, onSave);
    await act(async () => {
      fireEvent.press(screen.getByText('Private'));
    });
    fireEvent.press(screen.getByText('Save'));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPaymentType: 'private' }),
    );
  });

  it('calls onSave with invoice footer text', async () => {
    const onSave = jest.fn();
    await renderModal(defaultSettings, onSave);
    const input = screen.getByPlaceholderText(/Tax ID|invoice|footer/i);
    await act(async () => {
      fireEvent.changeText(input, 'My clinic footer');
    });
    fireEvent.press(screen.getByText('Save'));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ invoiceFooterText: 'My clinic footer' }),
    );
  });

  it('calls onClose after saving', async () => {
    const onClose = jest.fn();
    await renderModal(defaultSettings, jest.fn(), onClose);
    fireEvent.press(screen.getByText('Save'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not render when not visible', async () => {
    await render(
      <FinancialSettingsModal
        visible={false}
        settings={defaultSettings}
        onSave={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    expect(screen.queryByText('Save')).toBeNull();
  });
});
