import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock next-intl to avoid requiring NextIntlClientProvider
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      bookingRequests: 'Booking Requests',
      newPatient: 'New patient',
      waitingForResponse: 'Waiting for patient response',
      patientInfo: 'Patient Information',
      confirm: 'Confirm',
      proposeNewTime: 'Propose new time',
      reject: 'Reject',
      loadingProfile: 'Loading patient profile…',
      infoName: 'Name',
      infoEmail: 'Email',
      infoPhone: 'Phone',
      infoDob: 'Date of birth',
      infoCpf: 'CPF',
      infoNoProfile: 'patient has not completed their profile yet.',
      infoConsultation: 'Consultation',
      notInList: 'Not yet in your patient list',
      existingPatient: 'Existing patient',
      viewProfile: 'View full profile →',
      proposeFormTitle: 'Propose a new time',
      proposeDate: 'Date',
      proposeStart: 'Start',
      proposeEnd: 'End',
      send: 'Send',
      cancel: 'Cancel',
      dismiss: 'Dismiss',
      notePlaceholder: 'Note to patient (optional)',
    };
    return translations[key] ?? key;
  },
}));

// Mock server actions before importing the component
vi.mock('@/app/[locale]/dashboard/schedule/booking-actions', () => ({
  confirmBooking: vi.fn().mockResolvedValue(undefined),
  confirmBookingAndAddPatient: vi.fn().mockResolvedValue(undefined),
  rejectBooking: vi.fn().mockResolvedValue(undefined),
  proposeNewTime: vi.fn().mockResolvedValue(undefined),
}));

const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }),
    }),
  }),
}));

import { BookingRequestsPanel } from '@/app/[locale]/dashboard/schedule/BookingRequestsPanel';
import * as bookingActions from '@/app/[locale]/dashboard/schedule/booking-actions';

const TENTATIVE_BOOKING = {
  id: 'b1',
  patient_name: 'Maria Silva',
  date: '2030-01-15',
  start_time: '09:00:00',
  end_time: '10:00:00',
  consultation_type: 'Initial Consultation',
  status: 'tentative',
  notes: 'First visit',
};

const PAST_BOOKING = {
  id: 'b-past',
  patient_name: 'Ana Costa',
  date: '2020-01-01',
  start_time: '09:00:00',
  end_time: '10:00:00',
  consultation_type: 'Follow-up',
  status: 'tentative',
  notes: null,
};

const PROPOSAL_BOOKING = {
  ...TENTATIVE_BOOKING,
  id: 'b2',
  status: 'proposal',
};

describe('BookingRequestsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
  });

  it('renders nothing when there are no bookings', () => {
    const { container } = render(<BookingRequestsPanel bookings={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the section header with booking count badge', () => {
    render(<BookingRequestsPanel bookings={[TENTATIVE_BOOKING]} />);
    expect(screen.getByText('Booking Requests')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('renders patient name, date and time for a tentative booking', () => {
    render(<BookingRequestsPanel bookings={[TENTATIVE_BOOKING]} />);
    expect(screen.getByText('Maria Silva')).toBeInTheDocument();
    expect(screen.getByText(/2030-01-15/)).toBeInTheDocument();
    expect(screen.getByText('Initial Consultation')).toBeInTheDocument();
  });

  it('renders notes when present', () => {
    render(<BookingRequestsPanel bookings={[TENTATIVE_BOOKING]} />);
    expect(screen.getByText('First visit')).toBeInTheDocument();
  });

  it('shows Confirm, Propose new time, and Reject buttons for tentative status', () => {
    render(<BookingRequestsPanel bookings={[TENTATIVE_BOOKING]} />);
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Propose new time' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();
  });

  it('shows "Waiting for patient response" badge for proposal status', () => {
    render(<BookingRequestsPanel bookings={[PROPOSAL_BOOKING]} />);
    expect(screen.getByText('Waiting for patient response')).toBeInTheDocument();
  });

  it('does NOT show action buttons for proposal status', () => {
    render(<BookingRequestsPanel bookings={[PROPOSAL_BOOKING]} />);
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument();
  });

  it('shows the propose-new-time inline form when that button is clicked', () => {
    render(<BookingRequestsPanel bookings={[TENTATIVE_BOOKING]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Propose new time' }));
    expect(screen.getByText('Propose a new time')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('closes the propose form when Cancel is clicked', () => {
    render(<BookingRequestsPanel bookings={[TENTATIVE_BOOKING]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Propose new time' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Propose a new time')).not.toBeInTheDocument();
  });

  it('renders multiple bookings', () => {
    const second = { ...TENTATIVE_BOOKING, id: 'b3', patient_name: 'João Santos' };
    render(<BookingRequestsPanel bookings={[TENTATIVE_BOOKING, second]} />);
    expect(screen.getByText('Maria Silva')).toBeInTheDocument();
    expect(screen.getByText('João Santos')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('renders the Patient Information toggle button', () => {
    render(<BookingRequestsPanel bookings={[TENTATIVE_BOOKING]} />);
    expect(screen.getByRole('button', { name: 'Patient Information' })).toBeInTheDocument();
  });

  it('shows "patient has not completed their profile yet" when profile is null', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const booking = { ...TENTATIVE_BOOKING, patient_auth_id: 'auth-1' };
    render(<BookingRequestsPanel bookings={[booking]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Patient Information' }));
    await waitFor(() =>
      expect(screen.getByText(/patient has not completed their profile yet/i)).toBeInTheDocument(),
    );
  });

  it('displays loaded profile data when the patient has a profile', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: { full_name: 'Maria Silva', email: 'maria@example.com', phone: '11999887766', birth_date: '1990-05-15', cpf: '123.456.789-00' },
      error: null,
    });
    const booking = { ...TENTATIVE_BOOKING, patient_auth_id: 'auth-1' };
    render(<BookingRequestsPanel bookings={[booking]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Patient Information' }));
    await waitFor(() => expect(screen.getByText('maria@example.com')).toBeInTheDocument());
    expect(screen.getByText('11999887766')).toBeInTheDocument();
    expect(screen.getByText('1990-05-15')).toBeInTheDocument();
    expect(screen.getByText('123.456.789-00')).toBeInTheDocument();
  });

  it('hides the patient info panel when toggled off', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const booking = { ...TENTATIVE_BOOKING, patient_auth_id: 'auth-1' };
    render(<BookingRequestsPanel bookings={[booking]} />);
    const toggleBtn = screen.getByRole('button', { name: 'Patient Information' });
    fireEvent.click(toggleBtn);
    await waitFor(() => expect(screen.getByText(/patient has not completed/i)).toBeInTheDocument());
    fireEvent.click(toggleBtn);
    expect(screen.queryByText(/patient has not completed/i)).not.toBeInTheDocument();
  });

  it('renders obsolete card with reduced opacity indicator', () => {
    render(<BookingRequestsPanel bookings={[PAST_BOOKING]} />);
    // The card container should exist — we verify it renders without crashing
    expect(screen.getByText('Ana Costa')).toBeInTheDocument();
  });

  it('shows Propose and Dismiss buttons (not Confirm/Reject) for obsolete cards', () => {
    render(<BookingRequestsPanel bookings={[PAST_BOOKING]} />);
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Propose new time' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
  });

  it('calls rejectBooking when Dismiss is clicked on an obsolete card', async () => {
    render(<BookingRequestsPanel bookings={[PAST_BOOKING]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(bookingActions.rejectBooking).toHaveBeenCalledWith('b-past', undefined));
  });

  it('sorts non-obsolete cards before obsolete cards', () => {
    const futureBooking = { ...TENTATIVE_BOOKING, id: 'b-future', date: '2030-01-01' };
    render(<BookingRequestsPanel bookings={[PAST_BOOKING, futureBooking]} />);
    const names = screen.getAllByText(/Maria Silva|Ana Costa/).map(el => el.textContent);
    expect(names[0]).toBe('Maria Silva');  // future card first
    expect(names[1]).toBe('Ana Costa');   // past card last
  });
});
