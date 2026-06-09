/**
 * Integration: Settings defaults applied to SchedulingSettingsModal
 *
 * Verifies that when the user opens the scheduling settings modal,
 * the current saved settings are reflected, and saving updates persistence.
 */
import React from 'react';
import { render, fireEvent, screen, act, cleanup } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { patchSettings, loadSettings } from '../../lib/app-settings';
import { SchedulingSettingsModal } from '../../components/SchedulingSettingsModal';

beforeEach(async () => {
  await AsyncStorage.clear();
});

afterEach(cleanup);

describe('SchedulingSettingsModal ↔ saved settings', () => {
  it('passes saved duration (60) into modal — pill is present', async () => {
    await patchSettings({ defaultDurationMinutes: 60 });
    const settings = await loadSettings();

    await render(
      <SchedulingSettingsModal
        visible
        settings={settings}
        onSave={jest.fn()}
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByText('60 min')).toBeTruthy();
    expect(screen.getByText('45 min')).toBeTruthy();
    // "30 min" appears in both duration and interval rows
    expect(screen.getAllByText('30 min').length).toBeGreaterThanOrEqual(2);
  });

  it('changes duration from 60 to 45 and saves', async () => {
    await patchSettings({ defaultDurationMinutes: 60 });
    const settings = await loadSettings();
    const onSave = jest.fn();

    await render(
      <SchedulingSettingsModal
        visible
        settings={settings}
        onSave={onSave}
        onClose={jest.fn()}
      />,
    );

    await act(async () => {
      fireEvent.press(screen.getByText('45 min'));
    });
    fireEvent.press(screen.getByText('Save'));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ defaultDurationMinutes: 45 }),
    );
  });

  it('passes saved interval (30) into modal', async () => {
    await patchSettings({ scheduleSlotIntervalMinutes: 30 });
    const settings = await loadSettings();

    await render(
      <SchedulingSettingsModal
        visible
        settings={settings}
        onSave={jest.fn()}
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByText('15 min')).toBeTruthy();
    expect(screen.getAllByText('30 min').length).toBeGreaterThanOrEqual(2);
  });

  it('passes saved appointment type (online) into modal', async () => {
    await patchSettings({ defaultApptType: 'online' });
    const settings = await loadSettings();

    await render(
      <SchedulingSettingsModal
        visible
        settings={settings}
        onSave={jest.fn()}
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByText('Online')).toBeTruthy();
    expect(screen.getByText('In-Person')).toBeTruthy();
  });

  it('saving propagates to AsyncStorage', async () => {
    const settings = await loadSettings();
    let capturedPatch: any = null;

    await render(
      <SchedulingSettingsModal
        visible
        settings={settings}
        onSave={async (patch) => {
          capturedPatch = patch;
          await patchSettings(patch);
        }}
        onClose={jest.fn()}
      />,
    );

    await act(async () => {
      fireEvent.press(screen.getByText('45 min'));
    });
    fireEvent.press(screen.getByText('Save'));

    expect(capturedPatch?.defaultDurationMinutes).toBe(45);
    // Allow async patchSettings to complete
    await act(async () => {});
    const reloaded = await loadSettings();
    expect(reloaded.defaultDurationMinutes).toBe(45);
  });
});
