import React from 'react';
import { fireEvent, act, render } from '@testing-library/react-native';

const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ access_token: 'test-access', refresh_token: 'test-refresh' }),
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      setSession: jest.fn().mockResolvedValue({}),
      updateUser: jest.fn().mockResolvedValue({ error: null }),
    },
  },
}));

jest.mock('../../lib/i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

import ResetPasswordScreen from '../../app/(auth)/reset-password';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { supabase } = require('../../lib/supabase');

describe('ResetPasswordScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    supabase.auth.setSession.mockResolvedValue({});
    supabase.auth.updateUser.mockResolvedValue({ error: null });
  });

  it('renders password fields', async () => {
    const { getByTestId } = await render(<ResetPasswordScreen />);
    expect(getByTestId('reset-password')).toBeTruthy();
    expect(getByTestId('reset-confirm')).toBeTruthy();
    expect(getByTestId('reset-submit')).toBeTruthy();
  });

  it('shows error when fields are empty', async () => {
    const { getByTestId, getByText } = await render(<ResetPasswordScreen />);
    await act(async () => { fireEvent.press(getByTestId('reset-submit')); });
    expect(getByText('auth.validation.allFields')).toBeTruthy();
  });

  it('shows error when passwords do not match', async () => {
    const { getByTestId, getByText } = await render(<ResetPasswordScreen />);
    await act(async () => { fireEvent.changeText(getByTestId('reset-password'), 'newpass1'); });
    await act(async () => { fireEvent.changeText(getByTestId('reset-confirm'), 'newpass2'); });
    await act(async () => { fireEvent.press(getByTestId('reset-submit')); });
    expect(getByText('auth.validation.passwordMatch')).toBeTruthy();
  });

  it('shows error when password is too short', async () => {
    const { getByTestId, getByText } = await render(<ResetPasswordScreen />);
    await act(async () => { fireEvent.changeText(getByTestId('reset-password'), '123'); });
    await act(async () => { fireEvent.changeText(getByTestId('reset-confirm'), '123'); });
    await act(async () => { fireEvent.press(getByTestId('reset-submit')); });
    expect(getByText('auth.validation.passwordLength')).toBeTruthy();
  });

  it('calls setSession then updateUser on submit', async () => {
    const { getByTestId } = await render(<ResetPasswordScreen />);
    await act(async () => { fireEvent.changeText(getByTestId('reset-password'), 'newpass1'); });
    await act(async () => { fireEvent.changeText(getByTestId('reset-confirm'), 'newpass1'); });
    await act(async () => { fireEvent.press(getByTestId('reset-submit')); });
    expect(supabase.auth.setSession).toHaveBeenCalledWith({ access_token: 'test-access', refresh_token: 'test-refresh' });
    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'newpass1' });
  });

  it('shows success state after successful reset', async () => {
    const { getByTestId, getByText } = await render(<ResetPasswordScreen />);
    await act(async () => { fireEvent.changeText(getByTestId('reset-password'), 'newpass1'); });
    await act(async () => { fireEvent.changeText(getByTestId('reset-confirm'), 'newpass1'); });
    await act(async () => { fireEvent.press(getByTestId('reset-submit')); });
    expect(getByText('auth.resetPassword.success')).toBeTruthy();
  });

  it('shows API error on failed update', async () => {
    supabase.auth.updateUser.mockResolvedValueOnce({ error: { message: 'Token expired' } });
    const { getByTestId, getByText } = await render(<ResetPasswordScreen />);
    await act(async () => { fireEvent.changeText(getByTestId('reset-password'), 'newpass1'); });
    await act(async () => { fireEvent.changeText(getByTestId('reset-confirm'), 'newpass1'); });
    await act(async () => { fireEvent.press(getByTestId('reset-submit')); });
    expect(getByText('Token expired')).toBeTruthy();
  });
});
