import { getAvailableSlots, createTentativeBooking } from '../../lib/booking-service';
import { supabase } from '../../lib/supabase';

// supabase is globally mocked in jest.setup.js
const mockFrom = supabase.from as jest.Mock;
const mockRpc = jest.fn();
(supabase as unknown as Record<string, unknown>).rpc = mockRpc;

function makeProfRow(workingHours: Record<string, unknown>) {
  const maybeSingle = jest.fn().mockResolvedValue({ data: { working_hours: workingHours }, error: null });
  const eq2 = jest.fn().mockReturnValue({ maybeSingle });
  const select = jest.fn().mockReturnValue({ eq: eq2 });
  mockFrom.mockReturnValue({ select });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRpc.mockResolvedValue({ data: [], error: null });
});

// ─── getAvailableSlots ────────────────────────────────────────────────────────

describe('getAvailableSlots()', () => {
  it('returns empty array when professional_id is missing', async () => {
    const slots = await getAvailableSlots('', '2026-06-16', 30);
    expect(slots).toEqual([]);
  });

  it('returns empty array when the day is disabled in working hours', async () => {
    // 2026-06-15 is a Monday (day index 1)
    makeProfRow({ mon: { enabled: false, start: '09:00', end: '17:00' } });
    const slots = await getAvailableSlots('prof-1', '2026-06-15', 30);
    expect(slots).toEqual([]);
  });

  it('returns empty array when working_hours is null', async () => {
    makeProfRow({});
    const slots = await getAvailableSlots('prof-1', '2026-06-15', 30);
    expect(slots).toEqual([]);
  });

  it('returns all slots for a free day with 30-min duration', async () => {
    // 09:00–11:00 = 4 slots of 30 min
    makeProfRow({ mon: { enabled: true, start: '09:00', end: '11:00' } });
    mockRpc.mockResolvedValue({ data: [], error: null });

    const slots = await getAvailableSlots('prof-1', '2026-06-15', 30);
    expect(slots).toEqual([
      { start: '09:00', end: '09:30' },
      { start: '09:30', end: '10:00' },
      { start: '10:00', end: '10:30' },
      { start: '10:30', end: '11:00' },
    ]);
  });

  it('returns correct slots for 60-min duration', async () => {
    makeProfRow({ mon: { enabled: true, start: '09:00', end: '11:00' } });
    mockRpc.mockResolvedValue({ data: [], error: null });

    const slots = await getAvailableSlots('prof-1', '2026-06-15', 60);
    expect(slots).toEqual([
      { start: '09:00', end: '10:00' },
      { start: '10:00', end: '11:00' },
    ]);
  });

  it('excludes a slot that overlaps with a busy range', async () => {
    // 09:00–11:00 with 30-min slots; 09:30–10:00 is busy
    makeProfRow({ mon: { enabled: true, start: '09:00', end: '11:00' } });
    mockRpc.mockResolvedValue({
      data: [{ slot_start: '09:30', slot_end: '10:00' }],
      error: null,
    });

    const slots = await getAvailableSlots('prof-1', '2026-06-15', 30);
    expect(slots.map(s => s.start)).toEqual(['09:00', '10:00', '10:30']);
    expect(slots.map(s => s.start)).not.toContain('09:30');
  });

  it('excludes a slot that partially overlaps at the start', async () => {
    // Busy 08:45–09:15 makes the 09:00 slot unavailable
    makeProfRow({ mon: { enabled: true, start: '09:00', end: '11:00' } });
    mockRpc.mockResolvedValue({
      data: [{ slot_start: '08:45', slot_end: '09:15' }],
      error: null,
    });

    const slots = await getAvailableSlots('prof-1', '2026-06-15', 30);
    expect(slots.map(s => s.start)).not.toContain('09:00');
    expect(slots.map(s => s.start)).toContain('09:30');
  });

  it('excludes a slot that partially overlaps at the end', async () => {
    // Busy 10:45–11:15 makes the 10:30 slot unavailable
    makeProfRow({ mon: { enabled: true, start: '09:00', end: '11:00' } });
    mockRpc.mockResolvedValue({
      data: [{ slot_start: '10:45', slot_end: '11:15' }],
      error: null,
    });

    const slots = await getAvailableSlots('prof-1', '2026-06-15', 30);
    expect(slots.map(s => s.start)).not.toContain('10:30');
    expect(slots.map(s => s.start)).toContain('10:00');
  });

  it('excludes multiple non-contiguous busy slots correctly', async () => {
    // 09:00–13:00 with 30-min slots; 09:30 and 11:00 are busy
    makeProfRow({ mon: { enabled: true, start: '09:00', end: '13:00' } });
    mockRpc.mockResolvedValue({
      data: [
        { slot_start: '09:30', slot_end: '10:00' },
        { slot_start: '11:00', slot_end: '11:30' },
      ],
      error: null,
    });

    const slots = await getAvailableSlots('prof-1', '2026-06-15', 30);
    const starts = slots.map(s => s.start);
    expect(starts).toContain('09:00');
    expect(starts).not.toContain('09:30');
    expect(starts).toContain('10:00');
    expect(starts).toContain('10:30');
    expect(starts).not.toContain('11:00');
    expect(starts).toContain('11:30');
    expect(starts).toContain('12:00');
    expect(starts).toContain('12:30');
  });
});

// ─── createTentativeBooking — error handling ──────────────────────────────────

describe('createTentativeBooking() error handling', () => {
  const BASE_OPTS = {
    professionalId: 'prof-1',
    patientAuthId: 'auth-1',
    patientName: 'Maria',
    date: '2026-06-15',
    startTime: '09:00',
    endTime: '09:30',
    durationMinutes: 30,
    consultationType: 'Consultation',
  };

  it('throws "slot_taken" when the RPC raises that error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'slot_taken' } });
    await expect(createTentativeBooking(BASE_OPTS)).rejects.toThrow('slot_taken');
  });

  it('throws "patient_blocked" when the patient is blocked from scheduling', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'Patient is blocked from scheduling' },
    });
    await expect(createTentativeBooking(BASE_OPTS)).rejects.toThrow('patient_blocked');
  });

  it('throws "max_bookings_reached" when the concurrent limit is exceeded', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'Max concurrent bookings reached for this patient (1)' },
    });
    await expect(createTentativeBooking(BASE_OPTS)).rejects.toThrow('max_bookings_reached');
  });

  it('re-throws unknown errors as-is', async () => {
    const unknownErr = { message: 'unexpected database error' };
    mockRpc.mockResolvedValue({ data: null, error: unknownErr });
    await expect(createTentativeBooking(BASE_OPTS)).rejects.toEqual(unknownErr);
  });

  it('returns the new appointment id on success', async () => {
    mockRpc.mockResolvedValue({ data: 'appt-uuid-123', error: null });
    const id = await createTentativeBooking(BASE_OPTS);
    expect(id).toBe('appt-uuid-123');
  });
});
