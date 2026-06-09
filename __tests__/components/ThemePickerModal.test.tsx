import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';
import { ThemePickerModal } from '../../components/ThemePickerModal';
import { ThemeKey } from '../../constants/themes';

async function renderModal(
  currentTheme: ThemeKey = 'light',
  onSelect = jest.fn(),
  onClose = jest.fn(),
) {
  return render(
    <ThemePickerModal
      visible
      currentTheme={currentTheme}
      onSelect={onSelect}
      onClose={onClose}
    />,
  );
}

describe('ThemePickerModal', () => {
  it('renders all 4 theme options', async () => {
    await renderModal();
    expect(screen.getByText('Light')).toBeTruthy();
    expect(screen.getByText('Dark')).toBeTruthy();
    expect(screen.getByText('Warm')).toBeTruthy();
    expect(screen.getByText('Ocean')).toBeTruthy();
  });

  it('calls onSelect with the chosen theme key', async () => {
    const onSelect = jest.fn();
    await renderModal('light', onSelect);
    fireEvent.press(screen.getByText('Dark'));
    expect(onSelect).toHaveBeenCalledWith('dark');
  });

  it('calls onClose after selecting a theme', async () => {
    const onClose = jest.fn();
    await renderModal('light', jest.fn(), onClose);
    fireEvent.press(screen.getByText('Ocean'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onSelect with "warm" when Warm is pressed', async () => {
    const onSelect = jest.fn();
    await renderModal('dark', onSelect);
    fireEvent.press(screen.getByText('Warm'));
    expect(onSelect).toHaveBeenCalledWith('warm');
  });

  it('calls onSelect with "light" when Light is pressed', async () => {
    const onSelect = jest.fn();
    await renderModal('dark', onSelect);
    fireEvent.press(screen.getByText('Light'));
    expect(onSelect).toHaveBeenCalledWith('light');
  });

  it('does not render when not visible', async () => {
    await render(
      <ThemePickerModal
        visible={false}
        currentTheme="light"
        onSelect={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    expect(screen.queryByText('Light')).toBeNull();
  });
});
