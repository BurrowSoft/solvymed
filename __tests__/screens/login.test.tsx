import React from 'react';
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react-native';
import LoginScreen from '../../app/(auth)/login';

afterEach(cleanup);

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: mockReplace, push: mockPush }),
}));

const mockSignIn = jest.fn();
const mockResendConfirmation = jest.fn();
jest.mock('../../lib/auth-context', () => ({
  useAuth: () => ({ signIn: mockSignIn, resendConfirmation: mockResendConfirmation, forgotPassword: jest.fn() }),
}));

jest.mock('../../lib/locale-context', () => ({
  useLocale: () => ({ locale: 'en', setLocale: jest.fn() }),
  LocaleProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fillAndSubmit(email: string, password: string) {
  await act(async () => {
    fireEvent.changeText(screen.getByPlaceholderText('your@email.com'), email);
  });
  await act(async () => {
    fireEvent.changeText(screen.getByPlaceholderText('••••••••'), password);
  });
  await act(async () => {
    fireEvent.press(screen.getByTestId('signin-submit'));
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('LoginScreen', () => {
  beforeEach(() => {
    mockSignIn.mockReset();
    mockResendConfirmation.mockReset();
    mockReplace.mockReset();
    mockPush.mockReset();
  });

  it('renders email and password fields', async () => {
    await render(<LoginScreen />);
    expect(screen.getByPlaceholderText('your@email.com')).toBeTruthy();
    expect(screen.getByPlaceholderText('••••••••')).toBeTruthy();
    expect(screen.getByTestId('signin-submit')).toBeTruthy();
  });

  it('shows "fill in email and password" error when fields are empty', async () => {
    await render(<LoginScreen />);
    await act(async () => { fireEvent.press(screen.getByTestId('signin-submit')); });
    expect(screen.getByText('Please enter your email and password.')).toBeTruthy();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('shows generic server error on sign-in failure', async () => {
    mockSignIn.mockResolvedValue({ error: 'Invalid login credentials' });
    await render(<LoginScreen />);
    await fillAndSubmit('user@clinic.com', 'wrongpass');
    await waitFor(() => {
      expect(screen.getByText('Invalid login credentials')).toBeTruthy();
    });
  });

  it('shows warning notice with resend option for unconfirmed email', async () => {
    mockSignIn.mockResolvedValue({ error: 'Email not confirmed' });
    await render(<LoginScreen />);
    await fillAndSubmit('unconfirmed@clinic.com', 'pass123');
    await waitFor(() => {
      expect(screen.getByText('Email not confirmed')).toBeTruthy();
      expect(screen.getByTestId('resend-btn')).toBeTruthy();
    });
  });

  it('shows the email address in the unconfirmed warning', async () => {
    mockSignIn.mockResolvedValue({ error: 'Email not confirmed' });
    await render(<LoginScreen />);
    await fillAndSubmit('doc@clinic.com', 'pass123');
    await waitFor(() => {
      expect(screen.getByText(/doc@clinic\.com/)).toBeTruthy();
    });
  });

  it('calls resendConfirmation with the email when Resend is tapped', async () => {
    mockSignIn.mockResolvedValue({ error: 'Email not confirmed' });
    mockResendConfirmation.mockResolvedValue({ error: null });
    await render(<LoginScreen />);
    await fillAndSubmit('doc@clinic.com', 'pass123');
    await waitFor(() => expect(screen.getByTestId('resend-btn')).toBeTruthy());
    await act(async () => { fireEvent.press(screen.getByTestId('resend-btn')); });
    expect(mockResendConfirmation).toHaveBeenCalledWith('doc@clinic.com');
  });

  it('shows success message after successful resend', async () => {
    mockSignIn.mockResolvedValue({ error: 'Email not confirmed' });
    mockResendConfirmation.mockResolvedValue({ error: null });
    await render(<LoginScreen />);
    await fillAndSubmit('doc@clinic.com', 'pass123');
    await waitFor(() => expect(screen.getByTestId('resend-btn')).toBeTruthy());
    await act(async () => { fireEvent.press(screen.getByTestId('resend-btn')); });
    await waitFor(() => {
      expect(screen.getByText('Confirmation email sent! Check your inbox.')).toBeTruthy();
    });
  });

  it('shows error box if resend fails', async () => {
    mockSignIn.mockResolvedValue({ error: 'Email not confirmed' });
    mockResendConfirmation.mockResolvedValue({ error: 'Too many requests' });
    await render(<LoginScreen />);
    await fillAndSubmit('doc@clinic.com', 'pass123');
    await waitFor(() => expect(screen.getByTestId('resend-btn')).toBeTruthy());
    await act(async () => { fireEvent.press(screen.getByTestId('resend-btn')); });
    await waitFor(() => {
      expect(screen.getByText('Too many requests')).toBeTruthy();
    });
  });

  it('"Sign up" link navigates to signup screen', async () => {
    await render(<LoginScreen />);
    await act(async () => { fireEvent.press(screen.getByText('Sign up')); });
    expect(mockPush).toHaveBeenCalledWith('/(auth)/signup');
  });
});
