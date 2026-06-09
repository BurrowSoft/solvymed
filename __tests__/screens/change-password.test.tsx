import React from 'react';
import { fireEvent, act } from '@testing-library/react-native';
import { render } from '@testing-library/react-native';
import ChangePasswordModal from '../../components/ChangePasswordModal';

const mockChangePassword = jest.fn();

jest.mock('../../lib/auth-context', () => ({
  useAuth: () => ({ changePassword: mockChangePassword, session: { user: { email: 'a@b.com' } } }),
}));

jest.mock('../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (k: string) => k,
  }),
}));

const mockOnClose = jest.fn();

function renderModal(visible = true) {
  return render(<ChangePasswordModal visible={visible} onClose={mockOnClose} />);
}

describe('ChangePasswordModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders when visible', async () => {
    const { getByTestId } = await renderModal();
    expect(getByTestId('current-password')).toBeTruthy();
    expect(getByTestId('new-password')).toBeTruthy();
    expect(getByTestId('confirm-password')).toBeTruthy();
  });

  it('shows error when fields are empty', async () => {
    const { getByTestId, getByText } = await renderModal();
    await act(async () => { fireEvent.press(getByTestId('change-password-submit')); });
    expect(getByText('auth.validation.allFields')).toBeTruthy();
  });

  it('shows error when passwords do not match', async () => {
    const { getByTestId, getByText } = await renderModal();
    await act(async () => { fireEvent.changeText(getByTestId('current-password'), 'oldpass'); });
    await act(async () => { fireEvent.changeText(getByTestId('new-password'), 'newpass1'); });
    await act(async () => { fireEvent.changeText(getByTestId('confirm-password'), 'newpass2'); });
    await act(async () => { fireEvent.press(getByTestId('change-password-submit')); });
    expect(getByText('auth.validation.passwordMatch')).toBeTruthy();
  });

  it('shows error when new password is too short', async () => {
    const { getByTestId, getByText } = await renderModal();
    await act(async () => { fireEvent.changeText(getByTestId('current-password'), 'oldpass'); });
    await act(async () => { fireEvent.changeText(getByTestId('new-password'), '123'); });
    await act(async () => { fireEvent.changeText(getByTestId('confirm-password'), '123'); });
    await act(async () => { fireEvent.press(getByTestId('change-password-submit')); });
    expect(getByText('auth.validation.passwordLength')).toBeTruthy();
  });

  it('shows error when new password equals current password', async () => {
    const { getByTestId, getByText } = await renderModal();
    await act(async () => { fireEvent.changeText(getByTestId('current-password'), 'samepass1'); });
    await act(async () => { fireEvent.changeText(getByTestId('new-password'), 'samepass1'); });
    await act(async () => { fireEvent.changeText(getByTestId('confirm-password'), 'samepass1'); });
    await act(async () => { fireEvent.press(getByTestId('change-password-submit')); });
    expect(getByText('auth.changePassword.sameError')).toBeTruthy();
  });

  it('calls changePassword with correct args', async () => {
    mockChangePassword.mockResolvedValueOnce({ error: null });
    const { getByTestId } = await renderModal();
    await act(async () => { fireEvent.changeText(getByTestId('current-password'), 'oldpass1'); });
    await act(async () => { fireEvent.changeText(getByTestId('new-password'), 'newpass1'); });
    await act(async () => { fireEvent.changeText(getByTestId('confirm-password'), 'newpass1'); });
    await act(async () => { fireEvent.press(getByTestId('change-password-submit')); });
    expect(mockChangePassword).toHaveBeenCalledWith('oldpass1', 'newpass1');
  });

  it('shows success state on successful change', async () => {
    mockChangePassword.mockResolvedValueOnce({ error: null });
    const { getByTestId, getByText } = await renderModal();
    await act(async () => { fireEvent.changeText(getByTestId('current-password'), 'oldpass1'); });
    await act(async () => { fireEvent.changeText(getByTestId('new-password'), 'newpass1'); });
    await act(async () => { fireEvent.changeText(getByTestId('confirm-password'), 'newpass1'); });
    await act(async () => { fireEvent.press(getByTestId('change-password-submit')); });
    expect(getByText('auth.changePassword.success')).toBeTruthy();
  });

  it('shows API error on failed change', async () => {
    mockChangePassword.mockResolvedValueOnce({ error: 'Invalid password' });
    const { getByTestId, getByText } = await renderModal();
    await act(async () => { fireEvent.changeText(getByTestId('current-password'), 'wrongpass'); });
    await act(async () => { fireEvent.changeText(getByTestId('new-password'), 'newpass1'); });
    await act(async () => { fireEvent.changeText(getByTestId('confirm-password'), 'newpass1'); });
    await act(async () => { fireEvent.press(getByTestId('change-password-submit')); });
    expect(getByText('Invalid password')).toBeTruthy();
  });
});
