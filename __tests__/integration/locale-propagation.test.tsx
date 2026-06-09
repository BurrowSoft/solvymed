/**
 * Integration: Locale change propagates to UI
 *
 * Verifies that switching locale (via setAppLocale) changes what t() returns,
 * and that the LocaleProvider + LanguagePickerModal flow updates the stored locale.
 */
import React from 'react';
import { render, fireEvent, screen, act, cleanup } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setAppLocale, getLocale, t } from '../../lib/i18n';
import { LanguagePickerModal } from '../../components/LanguagePickerModal';
import { LocaleProvider } from '../../lib/locale-context';

beforeEach(async () => {
  await AsyncStorage.clear();
  setAppLocale('en');
});

afterEach(cleanup);

describe('t() responds to locale changes', () => {
  it('t("common.save") returns correct string per locale', () => {
    setAppLocale('en');
    expect(t('common.save')).toBe('Save');
    setAppLocale('pt-BR');
    expect(t('common.save')).toBe('Salvar');
    setAppLocale('fr-FR');
    expect(t('common.save')).toBe('Enregistrer');
    setAppLocale('de-DE');
    expect(t('common.save')).toBe('Speichern');
    setAppLocale('it-IT');
    expect(t('common.save')).toBe('Salva');
    setAppLocale('es-ES');
    expect(t('common.save')).toBe('Guardar');
  });

  it('t("newAppt.inPerson") returns locale-specific text', () => {
    setAppLocale('en');
    expect(t('newAppt.inPerson')).toBe('In-Person');
    setAppLocale('pt-BR');
    expect(t('newAppt.inPerson')).toBe('Presencial');
  });

  it('falls back to english for unknown locale', () => {
    setAppLocale('xx-XX' as any);
    expect(t('common.save')).toBe('Save');
  });
});

describe('LanguagePickerModal locale flow', () => {
  it('shows 6 language options when visible', async () => {
    await render(
      <LocaleProvider>
        <LanguagePickerModal visible onClose={jest.fn()} />
      </LocaleProvider>,
    );
    expect(screen.getAllByText(/Português|English|Français|Deutsch|Italiano|Español/).length).toBe(6);
  });

  it('selecting a language calls onClose', async () => {
    const onClose = jest.fn();
    await render(
      <LocaleProvider>
        <LanguagePickerModal visible onClose={onClose} />
      </LocaleProvider>,
    );
    await act(async () => {
      fireEvent.press(screen.getByText('Français'));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('locale is persisted to AsyncStorage after selection', async () => {
    const onClose = jest.fn();
    await render(
      <LocaleProvider>
        <LanguagePickerModal visible onClose={onClose} />
      </LocaleProvider>,
    );
    await act(async () => {
      fireEvent.press(screen.getByText('Deutsch'));
    });
    const stored = await AsyncStorage.getItem('@solvymed/locale');
    expect(stored).toBe('de-DE');
  });
});
