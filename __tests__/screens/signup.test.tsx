import React from 'react';
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react-native';
import SignUpScreen from '../../app/(auth)/signup';

afterEach(cleanup);

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockBack = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, replace: mockReplace, push: jest.fn() }),
}));

const mockSignUp = jest.fn();
jest.mock('../../lib/auth-context', () => ({
  useAuth: () => ({ signUp: mockSignUp }),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Each changeText must be in its own act() so React 19 commits the controlled
// input state before the next event reads the closure value.
async function fillForm(email: string, password: string, confirm: string) {
  await act(async () => {
    fireEvent.changeText(screen.getByPlaceholderText('your@email.com'), email);
  });
  await act(async () => {
    fireEvent.changeText(screen.getByPlaceholderText('At least 6 characters'), password);
  });
  await act(async () => {
    fireEvent.changeText(screen.getByPlaceholderText('••••••••'), confirm);
  });
}

async function submit() {
  await act(async () => {
    fireEvent.press(screen.getByTestId('signup-submit'));
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SignUpScreen', () => {
  beforeEach(() => {
    mockSignUp.mockReset();
    mockBack.mockReset();
    mockReplace.mockReset();
  });

  it('renders all form fields and the submit button', async () => {
    await render(<SignUpScreen />);
    expect(screen.getByPlaceholderText('your@email.com')).toBeTruthy();
    expect(screen.getByPlaceholderText('At least 6 characters')).toBeTruthy();
    expect(screen.getByPlaceholderText('••••••••')).toBeTruthy();
    expect(screen.getByTestId('signup-submit')).toBeTruthy();
  });

  it('shows "fill in all fields" error when submitted empty', async () => {
    await render(<SignUpScreen />);
    await submit();
    expect(screen.getByText('Please fill in all fields.')).toBeTruthy();
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('shows "passwords do not match" when passwords differ', async () => {
    await render(<SignUpScreen />);
    await fillForm('a@b.com', 'password1', 'password2');
    await submit();
    expect(screen.getByText('Passwords do not match.')).toBeTruthy();
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('shows "at least 6 characters" when password too short', async () => {
    await render(<SignUpScreen />);
    await fillForm('a@b.com', 'abc', 'abc');
    await submit();
    expect(screen.getByText('Password must be at least 6 characters.')).toBeTruthy();
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('calls signUp with trimmed email and password on valid input', async () => {
    mockSignUp.mockResolvedValue({ error: null });
    await render(<SignUpScreen />);
    await fillForm('  user@clinic.com  ', 'secret123', 'secret123');
    await submit();
    expect(mockSignUp).toHaveBeenCalledWith('user@clinic.com', 'secret123', expect.any(String));
  });

  it('shows confirmation state after successful sign-up', async () => {
    mockSignUp.mockResolvedValue({ error: null });
    await render(<SignUpScreen />);
    await fillForm('doc@clinic.com', 'secure99', 'secure99');
    await submit();
    await waitFor(() => {
      expect(screen.getByText('Check your email')).toBeTruthy();
      expect(screen.getByText('Go to Sign In')).toBeTruthy();
    });
  });

  it('shows the server error message on signUp failure', async () => {
    mockSignUp.mockResolvedValue({ error: 'User already registered' });
    await render(<SignUpScreen />);
    await fillForm('dup@clinic.com', 'pass123', 'pass123');
    await submit();
    await waitFor(() => {
      expect(screen.getByText('User already registered')).toBeTruthy();
    });
  });

  it('"Go to Sign In" navigates to login after successful sign-up', async () => {
    mockSignUp.mockResolvedValue({ error: null });
    await render(<SignUpScreen />);
    await fillForm('doc@clinic.com', 'secure99', 'secure99');
    await submit();
    await waitFor(() => expect(screen.getByText('Go to Sign In')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByText('Go to Sign In'));
    });
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
  });

  it('"Already have an account? Sign in" navigates to login', async () => {
    await render(<SignUpScreen />);
    await act(async () => {
      fireEvent.press(screen.getByText('Sign in'));
    });
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
  });
});
