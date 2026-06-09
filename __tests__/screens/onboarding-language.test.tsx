import React from 'react';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import OnboardingScreen from '../../app/onboarding';

afterEach(cleanup);
beforeEach(async () => { await AsyncStorage.clear(); });

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, back: jest.fn(), push: jest.fn() }),
}));

const mockSetLocale = jest.fn();
jest.mock('../../lib/locale-context', () => ({
  useLocale: () => ({ locale: 'en', setLocale: mockSetLocale }),
}));

jest.mock('../../lib/i18n', () => {
  const actual = jest.requireActual('../../lib/i18n');
  return { ...actual, detectLocale: jest.fn().mockReturnValue('en') };
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function renderOnboarding() {
  return render(<OnboardingScreen />);
}

async function advanceToSlides() {
  await renderOnboarding();
  await act(async () => { fireEvent.press(screen.getByText('Continue')); });
}

// ─── Language picker phase ────────────────────────────────────────────────────

describe('[onboarding] language picker', () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockSetLocale.mockReset().mockResolvedValue(undefined);
  });

  it('shows the language picker on first render', async () => {
    await renderOnboarding();
    expect(screen.getByText('Choose your language')).toBeTruthy();
    expect(screen.getByText('Continue')).toBeTruthy();
  });

  it('lists all 6 supported languages', async () => {
    await renderOnboarding();
    // English has both nativeName="English" and englishName="English" so two
    // elements with that text — use getAllByText
    expect(screen.getAllByText('English').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Português')).toBeTruthy();
    expect(screen.getByText('Español')).toBeTruthy();
    expect(screen.getByText('Français')).toBeTruthy();
    expect(screen.getByText('Deutsch')).toBeTruthy();
    expect(screen.getByText('Italiano')).toBeTruthy();
  });

  it('pressing Continue does NOT call setLocale immediately', async () => {
    await renderOnboarding();
    await act(async () => { fireEvent.press(screen.getByText('Continue')); });
    expect(mockSetLocale).not.toHaveBeenCalled();
  });

  it('pressing Continue transitions to the onboarding slides', async () => {
    await renderOnboarding();
    await act(async () => { fireEvent.press(screen.getByText('Continue')); });
    expect(screen.queryByText('Choose your language')).toBeNull();
    expect(screen.getByText('Welcome to SolvyMed')).toBeTruthy();
  });

  it('tapping a different language applies it on finish', async () => {
    await renderOnboarding();
    await act(async () => { fireEvent.press(screen.getByText('Português')); });
    await act(async () => { fireEvent.press(screen.getByText('Continue')); });
    await act(async () => { fireEvent.press(screen.getByText('Skip')); });
    expect(mockSetLocale).toHaveBeenCalledWith('pt-BR');
  });
});

// ─── Slides phase + finish ────────────────────────────────────────────────────

describe('[onboarding] slides and finish', () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockSetLocale.mockReset().mockResolvedValue(undefined);
  });

  it('Skip persists onboarding_done BEFORE calling setLocale', async () => {
    let onboardingDoneAtCallTime: string | null = null;
    mockSetLocale.mockImplementation(async () => {
      // Capture what AsyncStorage has at the moment setLocale is called
      onboardingDoneAtCallTime = await AsyncStorage.getItem('onboarding_done');
    });
    await advanceToSlides();
    await act(async () => { fireEvent.press(screen.getByText('Skip')); });
    expect(onboardingDoneAtCallTime).toBe('1');
  });

  it('Skip calls setLocale, persists onboarding_done, and navigates to login', async () => {
    await advanceToSlides();
    await act(async () => { fireEvent.press(screen.getByText('Skip')); });
    expect(mockSetLocale).toHaveBeenCalledWith('en');
    expect(await AsyncStorage.getItem('onboarding_done')).toBe('1');
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
  });

  it('shows all 4 slide titles', async () => {
    await advanceToSlides();
    expect(screen.getByText('Welcome to SolvyMed')).toBeTruthy();
    expect(screen.getByText('Smart Scheduling')).toBeTruthy();
    expect(screen.getByText('Patient Records')).toBeTruthy();
    expect(screen.getByText('Payment Tracking')).toBeTruthy();
  });
});
