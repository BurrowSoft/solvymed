import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BookingClient } from "@/app/[locale]/book/[professionalId]/BookingClient";

const mockPush = vi.fn();
const mockBack = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

const mockRpc = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    rpc: mockRpc,
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
function setupMocks({ workingHours = WORKING_HOURS, busySlots = [] as unknown[], procedures = [] as ProcedureRow[], bookingError = null as { message: string } | null } = {}) {
  mockRpc.mockImplementation((fn: string) => {
    if (fn === "get_professional_working_hours") return Promise.resolve({ data: workingHours, error: null });
    if (fn === "get_professional_procedures") return Promise.resolve({ data: procedures, error: null });
    if (fn === "get_busy_slots") return Promise.resolve({ data: busySlots, error: null });
    if (fn === "create_public_booking") return Promise.resolve({ data: "appt-1", error: bookingError });
    return Promise.resolve({ data: null, error: null });
  });
}

describe("BookingClient", () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockBack.mockClear();
    mockRpc.mockClear();
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
        { id: "p1", name: "Consultation", duration_minutes: 30, price: null, payment_type: "private" },
        { id: "p2", name: "Follow-up", duration_minutes: 20, price: null, payment_type: "private" },
      ],
    });
    render(<BookingClient {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText("Consultation")).toBeInTheDocument());
    expect(screen.getByText("Follow-up")).toBeInTheDocument();
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
    setupMocks({ busySlots: [] });
    render(<BookingClient {...BASE_PROPS} />);

    // Wait for a time slot to appear and click it
    await waitFor(() => expect(screen.getByText(/9:00/)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/9:00/));

    // Enable the button and click
    await waitFor(() => expect(screen.getByText("Send Booking Request")).not.toBeDisabled());
    fireEvent.click(screen.getByText("Send Booking Request"));

    await waitFor(() => expect(screen.getByText("Request sent!")).toBeInTheDocument());
  });

  it("shows slot_taken error when that error is returned", async () => {
    setupMocks({
      busySlots: [],
      bookingError: { message: "slot_taken" },
    });
    render(<BookingClient {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText(/9:00/)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/9:00/));
    await waitFor(() => expect(screen.getByText("Send Booking Request")).not.toBeDisabled());
    fireEvent.click(screen.getByText("Send Booking Request"));
    await waitFor(() =>
      expect(screen.getByText(/slot was just taken/i)).toBeInTheDocument(),
    );
  });

  it("shows max_bookings error when that error is returned", async () => {
    setupMocks({
      busySlots: [],
      bookingError: { message: "Max concurrent bookings reached" },
    });
    render(<BookingClient {...BASE_PROPS} />);
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
    setupMocks({ busySlots: [] });
    render(<BookingClient {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText(/9:00/)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/9:00/));
    await waitFor(() => expect(screen.getByText("Send Booking Request")).not.toBeDisabled());
    fireEvent.click(screen.getByText("Send Booking Request"));
    await waitFor(() => expect(screen.getByText("View my appointments")).toBeInTheDocument());
    fireEvent.click(screen.getByText("View my appointments"));
    expect(mockPush).toHaveBeenCalledWith("/my-appointments");
  });
});
