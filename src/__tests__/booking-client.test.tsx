import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BookingClient } from "@/app/[locale]/book/[professionalId]/BookingClient";

const mockPush = vi.fn();
const mockBack = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => (key: string, params?: Record<string, unknown>) => {
    const translations: Record<string, string> = {
      "book.title": "Book Appointment",
      "book.selectProcedure": "Select procedure",
      "book.sessionDuration": "Session duration",
      "book.appointmentFor": "What is this appointment for?",
      "book.other": "Other",
      "book.otherPlaceholder": "Describe the appointment…",
      "book.pickDate": "Pick a date",
      "book.today": "Today",
      "book.availableTimes": "Available times",
      "book.noSlots": "No available slots",
      "book.tryDifferentDate": "Try a different date.",
      "book.notes": "Notes",
      "book.notesOptional": "(optional)",
      "book.notesPlaceholder": "Reason for visit, symptoms, questions for the doctor…",
      "book.sendRequest": "Send Booking Request",
      "book.sending": "Sending…",
      "book.hint": "The doctor will confirm or suggest a different time.",
      "book.successTitle": "Request sent!",
      "book.successBody": params ? `Your request for ${params.date} at ${params.time} with ${params.doctor}` : "",
      "book.successHint": "The doctor will confirm or suggest a different time.",
      "book.viewAppointments": "View my appointments",
      "book.backToClinics": "Back to clinics",
      "book.errorSlotTaken": "This slot was just taken. Please choose another time.",
      "book.errorBlocked": "Your bookings with this professional are currently restricted.",
      "book.errorMaxBookings": "You already have the maximum number of active appointments with this professional.",
      "book.errorGeneric": "Could not send booking request. Please try again.",
      "book.patientDetails": "Your details",
      "book.patientDetailsHint": "This information helps the doctor prepare for your appointment.",
      "book.fullNameLabel": "Full name",
      "book.fullNamePlaceholder": "Your full name",
      "book.emailLabel": "Email",
      "book.phoneLabel": "Phone",
      "book.phonePlaceholder": "+55 11 99999-9999",
      "book.dobLabel": "Date of birth",
      "book.cpfLabel": "CPF",
      "book.cpfPlaceholder": "000.000.000-00",
      "consultType.consultation": "Consultation",
      "consultType.followUp": "Follow-up",
      "consultType.examReview": "Exam Review",
      "consultType.procedure": "Procedure",
      "consultType.emergency": "Emergency",
    };
    return translations[`${ns}.${key}`] ?? key;
  },
}));

const mockRpc = vi.fn();
const mockUpsert = vi.fn().mockResolvedValue({ error: null });
const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    rpc: mockRpc,
    from: (table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }),
      upsert: mockUpsert,
    }),
  }),
}));

const BASE_PROPS = {
  professionalId: "prof-1",
  professionalName: "Dr. Smith",
  specialty: "General Practice",
  clinicName: "Health Clinic",
  patientAuthId: "patient-1",
  patientEmail: "patient@example.com",
  locale: "en",
};

const WORKING_HOURS = {
  mon: { enabled: true, start: "09:00", end: "17:00" },
  tue: { enabled: true, start: "09:00", end: "17:00" },
  wed: { enabled: true, start: "09:00", end: "17:00" },
  thu: { enabled: true, start: "09:00", end: "17:00" },
  fri: { enabled: true, start: "09:00", end: "17:00" },
  // All 7 days enabled so tests pass regardless of what day "today" is
  sat: { enabled: true, start: "09:00", end: "17:00" },
  sun: { enabled: true, start: "09:00", end: "17:00" },
};

type ProcedureRow = { id: string; name: string; duration_minutes: number; price: number | null; payment_type: string };
type ProfileData = { full_name?: string; phone?: string; birth_date?: string; cpf?: string } | null;

function setupMocks({
  workingHours = WORKING_HOURS,
  busySlots = [] as unknown[],
  procedures = [] as ProcedureRow[],
  bookingError = null as { message: string } | null,
  profile = null as ProfileData,
} = {}) {
  mockRpc.mockImplementation((fn: string) => {
    if (fn === "get_professional_working_hours") return Promise.resolve({ data: workingHours, error: null });
    if (fn === "get_professional_procedures") return Promise.resolve({ data: procedures, error: null });
    if (fn === "get_busy_slots") return Promise.resolve({ data: busySlots, error: null });
    if (fn === "create_public_booking") return Promise.resolve({ data: "appt-1", error: bookingError });
    return Promise.resolve({ data: null, error: null });
  });
  if (profile !== null) {
    mockMaybeSingle.mockResolvedValue({ data: profile, error: null });
  }
}

// Profile that satisfies all three required fields
const FULL_PROFILE: ProfileData = { full_name: "Test Patient", phone: "11999887766", birth_date: "1990-01-01" };

describe("BookingClient", () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockBack.mockClear();
    mockRpc.mockClear();
    mockUpsert.mockClear();
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
  });

  it("shows doctor name and clinic in the header card", async () => {
    setupMocks();
    render(<BookingClient {...BASE_PROPS} />);
    expect(screen.getByText("Dr. Smith")).toBeInTheDocument();
    expect(screen.getByText("Health Clinic")).toBeInTheDocument();
  });

  it("shows loading spinner while fetching setup data", () => {
    mockRpc.mockReturnValue(new Promise(() => {})); // never resolves
    render(<BookingClient {...BASE_PROPS} />);
    // Spinner shown during loading — form content is hidden
    expect(screen.queryByText("Pick a date")).not.toBeInTheDocument();
  });

  it("shows duration fallback chips when no procedures are configured", async () => {
    setupMocks({ procedures: [] });
    render(<BookingClient {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText("30 min")).toBeInTheDocument());
    expect(screen.getByText("45 min")).toBeInTheDocument();
    expect(screen.getByText("60 min")).toBeInTheDocument();
  });

  it("shows procedure buttons when procedures are available", async () => {
    setupMocks({
      procedures: [
        { id: "p1", name: "General Visit", duration_minutes: 30, price: null, payment_type: "private" },
        { id: "p2", name: "Follow-up Check", duration_minutes: 20, price: null, payment_type: "private" },
      ],
    });
    render(<BookingClient {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText("General Visit")).toBeInTheDocument());
    expect(screen.getByText("Follow-up Check")).toBeInTheDocument();
  });

  it("shows time slots after setup loads", async () => {
    setupMocks({ busySlots: [] });
    render(<BookingClient {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText("Available times")).toBeInTheDocument());
  });

  it("disables Send button when no slot is selected", async () => {
    setupMocks();
    render(<BookingClient {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText("Send Booking Request")).toBeInTheDocument());
    expect(screen.getByText("Send Booking Request")).toBeDisabled();
  });

  it("shows success screen after a successful booking", async () => {
    setupMocks({ busySlots: [], profile: FULL_PROFILE });
    render(<BookingClient {...BASE_PROPS} />);

    // Wait for consultation type chips and select one
    await waitFor(() => expect(screen.getAllByText("Consultation")[0]).toBeInTheDocument());
    fireEvent.click(screen.getAllByText("Consultation")[0]);

    // Wait for a time slot to appear and click it
    await waitFor(() => expect(screen.getByText(/9:00/)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/9:00/));

    // Enable the button and click
    await waitFor(() => expect(screen.getByText("Send Booking Request")).not.toBeDisabled());
    fireEvent.click(screen.getByText("Send Booking Request"));

    await waitFor(() => expect(screen.getByText("Request sent!")).toBeInTheDocument());
  });

  it("shows slot_taken error when that error is returned", async () => {
    setupMocks({ busySlots: [], bookingError: { message: "slot_taken" }, profile: FULL_PROFILE });
    render(<BookingClient {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getAllByText("Consultation")[0]).toBeInTheDocument());
    fireEvent.click(screen.getAllByText("Consultation")[0]);
    await waitFor(() => expect(screen.getByText(/9:00/)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/9:00/));
    await waitFor(() => expect(screen.getByText("Send Booking Request")).not.toBeDisabled());
    fireEvent.click(screen.getByText("Send Booking Request"));
    await waitFor(() =>
      expect(screen.getByText(/slot was just taken/i)).toBeInTheDocument(),
    );
  });

  it("shows max_bookings error when that error is returned", async () => {
    setupMocks({ busySlots: [], bookingError: { message: "Max concurrent bookings reached" }, profile: FULL_PROFILE });
    render(<BookingClient {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getAllByText("Consultation")[0]).toBeInTheDocument());
    fireEvent.click(screen.getAllByText("Consultation")[0]);
    await waitFor(() => expect(screen.getByText(/9:00/)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/9:00/));
    await waitFor(() => expect(screen.getByText("Send Booking Request")).not.toBeDisabled());
    fireEvent.click(screen.getByText("Send Booking Request"));
    await waitFor(() =>
      expect(screen.getByText(/maximum number of active appointments/i)).toBeInTheDocument(),
    );
  });

  it("back button calls router.back()", async () => {
    setupMocks();
    render(<BookingClient {...BASE_PROPS} />);
    const backBtn = screen.getByRole("button", { name: "" }); // SVG back arrow button
    fireEvent.click(backBtn);
    expect(mockBack).toHaveBeenCalled();
  });

  it("'View my appointments' navigates to /my-appointments after booking", async () => {
    setupMocks({ busySlots: [], profile: FULL_PROFILE });
    render(<BookingClient {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getAllByText("Consultation")[0]).toBeInTheDocument());
    fireEvent.click(screen.getAllByText("Consultation")[0]);
    await waitFor(() => expect(screen.getByText(/9:00/)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/9:00/));
    await waitFor(() => expect(screen.getByText("Send Booking Request")).not.toBeDisabled());
    fireEvent.click(screen.getByText("Send Booking Request"));
    await waitFor(() => expect(screen.getByText("View my appointments")).toBeInTheDocument());
    fireEvent.click(screen.getByText("View my appointments"));
    expect(mockPush).toHaveBeenCalledWith("/my-appointments");
  });

  it("renders the patient details form section after setup loads", async () => {
    setupMocks();
    render(<BookingClient {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText("Your details")).toBeInTheDocument());
    expect(screen.getByText("Full name")).toBeInTheDocument();
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("Phone")).toBeInTheDocument();
    expect(screen.getByText("Date of birth")).toBeInTheDocument();
    expect(screen.getByText("CPF")).toBeInTheDocument();
  });

  it("pre-fills full name from email username when no profile exists", async () => {
    setupMocks();
    render(<BookingClient {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText("Your details")).toBeInTheDocument());
    const nameInput = screen.getByPlaceholderText("Your full name");
    expect((nameInput as HTMLInputElement).value).toBe("patient");
  });

  it("pre-fills form fields when patient profile is loaded from database", async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: { full_name: "Maria Silva", phone: "11999887766", birth_date: "1990-05-15", cpf: "12345678901" },
      error: null,
    });
    setupMocks();
    render(<BookingClient {...BASE_PROPS} />);
    await waitFor(() => {
      const nameInput = screen.getByPlaceholderText("Your full name");
      expect((nameInput as HTMLInputElement).value).toBe("Maria Silva");
    });
  });

  it("disables Send button when required profile fields are missing", async () => {
    setupMocks({ busySlots: [] });
    render(<BookingClient {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getAllByText("Consultation")[0]).toBeInTheDocument());
    fireEvent.click(screen.getAllByText("Consultation")[0]);
    await waitFor(() => expect(screen.getByText(/9:00/)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/9:00/));
    // All three required fields empty → button stays disabled
    await waitFor(() => expect(screen.getByText("Send Booking Request")).toBeDisabled());
    // Fill name and phone but not DOB → still disabled
    fireEvent.change(screen.getByPlaceholderText("Your full name"), { target: { value: "Maria" } });
    fireEvent.change(screen.getByPlaceholderText("+55 11 99999-9999"), { target: { value: "11999887766" } });
    await waitFor(() => expect(screen.getByText("Send Booking Request")).toBeDisabled());
  });

  it("upserts patient profile before calling create_public_booking", async () => {
    setupMocks({ busySlots: [], profile: FULL_PROFILE });
    render(<BookingClient {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getAllByText("Consultation")[0]).toBeInTheDocument());
    fireEvent.click(screen.getAllByText("Consultation")[0]);
    await waitFor(() => expect(screen.getByText(/9:00/)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/9:00/));
    await waitFor(() => expect(screen.getByText("Send Booking Request")).not.toBeDisabled());
    fireEvent.click(screen.getByText("Send Booking Request"));
    await waitFor(() => expect(screen.getByText("Request sent!")).toBeInTheDocument());
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "patient-1", email: "patient@example.com" }),
      expect.objectContaining({ onConflict: "user_id" }),
    );
    expect(mockRpc).toHaveBeenCalledWith("create_public_booking", expect.any(Object));
  });
});
