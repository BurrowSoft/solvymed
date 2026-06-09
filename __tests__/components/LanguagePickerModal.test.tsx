import React from 'react';
import { render, fireEvent, screen, act, cleanup } from '@testing-library/react-native';
import { LanguagePickerModal } from '../../components/LanguagePickerModal';
import { LocaleProvider } from '../../lib/locale-context';

afterEach(cleanup);

async function renderModal(visible = true, onClose = jest.fn()) {
  return render(
    <LocaleProvider>
      <LanguagePickerModal visible={visible} onClose={onClose} />
    </LocaleProvider>,
  );
}

describe('LanguagePickerModal', () => {
  it('renders when visible', async () => {
    await renderModal();
    expect(screen.getByText('Português')).toBeTruthy();
    expect(screen.getByText('English')).toBeTruthy();
    expect(screen.getByText('Français')).toBeTruthy();
    expect(screen.getByText('Deutsch')).toBeTruthy();
    expect(screen.getByText('Italiano')).toBeTruthy();
    expect(screen.getByText('Español')).toBeTruthy();
  });

  it('shows all 6 language options', async () => {
    await renderModal();
    expect(screen.getAllByText(/Português|English|Français|Deutsch|Italiano|Español/).length).toBe(6);
  });

  it('calls onClose after selecting a language', async () => {
    const onClose = jest.fn();
    await renderModal(true, onClose);
    await act(async () => {
      fireEvent.press(screen.getByText('English'));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not render content when not visible', async () => {
    await renderModal(false);
    expect(screen.queryByText('English')).toBeNull();
  });
});
