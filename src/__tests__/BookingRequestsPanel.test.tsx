import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock server actions before importing the component
vi.mock('@/app/[locale]/dashboard/schedule/booking-actions', () => ({
  confirmBooking: vi.fn().mockResolvedValue(undefined),
  rejectBooking: vi.fn().mockResolvedValue(undefined),
  proposeNewTime: vi.fn().mockResolvedValue(undefined),
}));

import { BookingRequestsPanel } from '@/app/[locale]/dashboard/schedule/BookingRequestsPanel';
import * as bookingActions from '@/app/[locale]/dashboard/schedule/booking-actions';

const TENTATIVE_BOOKING = {
  id: 'b1',
  patient_name: 'Maria Silva',
  date: '2026-06-15',
  start_time: '09:00:00',
  end_time: '10:00:00',
  consultation_type: 'Initial Consultation',
  status: 'tentative',
  notes: 'First visit',
};

const PROPOSAL_BOOKING = {
  ...TENTATIVE_BOOKING,
  id: 'b2',
  status: 'proposal',
};

describe('BookingRequestsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    expect(screen.getByText(/2026-06-15/)).toBeInTheDocument();
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
});
