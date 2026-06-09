import React from 'react';
import { fireEvent, act } from '@testing-library/react-native';
import { render } from '@testing-library/react-native';
import ForgotPasswordModal from '../../components/ForgotPasswordModal';

const mockForgotPassword = jest.fn();

jest.mock('../../lib/auth-context', () => ({
  useAuth: () => ({ forgotPassword: mockForgotPassword }),
}));

jest.mock('../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (k: string) => k,
  }),
}));

jest.mock('../../lib/locale-context', () => ({
  useLocale: () => ({ locale: 'en' }),
}));

const mockOnClose = jest.fn();

function renderModal(visible = true) {
  return render(<ForgotPasswordModal visible={visible} onClose={mockOnClose} />);
}

describe('ForgotPasswordModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders email input when visible', async () => {
    const { getByTestId } = await renderModal();
    expect(getByTestId('forgot-email')).toBeTruthy();
    expect(getByTestId('forgot-send')).toBeTruthy();
  });

  it('shows error when email is empty', async () => {
    const { getByTestId, getByText } = await renderModal();
    await act(async () => { fireEvent.press(getByTestId('forgot-send')); });
    expect(getByText('auth.validation.emailRequired')).toBeTruthy();
  });

  it('calls forgotPassword with email and locale', async () => {
    mockForgotPassword.mockResolvedValueOnce({ error: null });
    const { getByTestId } = await renderModal();
    await act(async () => { fireEvent.changeText(getByTestId('forgot-email'), 'user@clinic.com'); });
    await act(async () => { fireEvent.press(getByTestId('forgot-send')); });
    expect(mockForgotPassword).toHaveBeenCalledWith('user@clinic.com', 'en');
  });

  it('shows sent state after successful send', async () => {
    mockForgotPassword.mockResolvedValueOnce({ error: null });
    const { getByTestId, getByText } = await renderModal();
    await act(async () => { fireEvent.changeText(getByTestId('forgot-email'), 'user@clinic.com'); });
    await act(async () => { fireEvent.press(getByTestId('forgot-send')); });
    expect(getByText('auth.forgotPassword.sent')).toBeTruthy();
    expect(getByTestId('back-to-login')).toBeTruthy();
  });

  it('shows error on failed send', async () => {
    mockForgotPassword.mockResolvedValueOnce({ error: 'User not found' });
    const { getByTestId, getByText } = await renderModal();
    await act(async () => { fireEvent.changeText(getByTestId('forgot-email'), 'nope@clinic.com'); });
    await act(async () => { fireEvent.press(getByTestId('forgot-send')); });
    expect(getByText('User not found')).toBeTruthy();
  });

  it('calls onClose when back button pressed after send', async () => {
    mockForgotPassword.mockResolvedValueOnce({ error: null });
    const { getByTestId } = await renderModal();
    await act(async () => { fireEvent.changeText(getByTestId('forgot-email'), 'user@clinic.com'); });
    await act(async () => { fireEvent.press(getByTestId('forgot-send')); });
    await act(async () => { fireEvent.press(getByTestId('back-to-login')); });
    expect(mockOnClose).toHaveBeenCalled();
  });
});
