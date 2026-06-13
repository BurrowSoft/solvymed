import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DiscoverClient } from "@/app/[locale]/discover/DiscoverClient";
import type { ClinicListing } from "@/app/[locale]/discover/page";

const mockPush = vi.fn();
const mockSignOut = vi.fn().mockResolvedValue({});

vi.mock("next/navigation", () => ({
  useParams: () => ({ locale: "en" }),
  useRouter: () => ({ push: mockPush, back: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { signOut: mockSignOut },
  }),
}));

const CLINICS: ClinicListing[] = [
  {
    id: "clinic-1",
    name: "Health Clinic",
    city: "Bangkok",
    country: "TH",
    professionals: [
      { id: "prof-1", name: "Dr. Smith", specialty: "General Practice" },
      { id: "prof-2", name: "Dr. Jones", specialty: "Cardiology" },
    ],
  },
];

describe("DiscoverClient — Book button", () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockSignOut.mockClear();
  });

  it("renders clinic list", () => {
    render(<DiscoverClient clinics={CLINICS} />);
    expect(screen.getByText("Health Clinic")).toBeInTheDocument();
  });

  it("does not show Book buttons before expanding a clinic", () => {
    render(<DiscoverClient clinics={CLINICS} />);
    expect(screen.queryByText("Book")).not.toBeInTheDocument();
  });

  it("shows Book buttons after expanding a clinic card", () => {
    render(<DiscoverClient clinics={CLINICS} />);
    fireEvent.click(screen.getByText("Health Clinic"));
    const bookButtons = screen.getAllByText("Book");
    expect(bookButtons).toHaveLength(2);
  });

  it("navigates to /book/[professionalId] when Book is clicked", () => {
    render(<DiscoverClient clinics={CLINICS} />);
    fireEvent.click(screen.getByText("Health Clinic"));
    const [firstBook] = screen.getAllByText("Book");
    fireEvent.click(firstBook);
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining("/book/prof-1"),
    );
  });

  it("includes the doctor name in the booking URL", () => {
    render(<DiscoverClient clinics={CLINICS} />);
    fireEvent.click(screen.getByText("Health Clinic"));
    fireEvent.click(screen.getAllByText("Book")[0]);
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining("name=Dr.%20Smith"),
    );
  });

  it("includes the specialty in the booking URL", () => {
    render(<DiscoverClient clinics={CLINICS} />);
    fireEvent.click(screen.getByText("Health Clinic"));
    fireEvent.click(screen.getAllByText("Book")[0]);
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining("specialty=General%20Practice"),
    );
  });

  it("includes the clinic name in the booking URL", () => {
    render(<DiscoverClient clinics={CLINICS} />);
    fireEvent.click(screen.getByText("Health Clinic"));
    fireEvent.click(screen.getAllByText("Book")[0]);
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining("clinicName=Health%20Clinic"),
    );
  });

  it("filters clinics by search query", () => {
    render(<DiscoverClient clinics={CLINICS} />);
    const input = screen.getByPlaceholderText(/search/i);
    fireEvent.change(input, { target: { value: "cardio" } });
    expect(screen.getByText("Health Clinic")).toBeInTheDocument();
  });

  it("shows 'No clinics found' when nothing matches", () => {
    render(<DiscoverClient clinics={CLINICS} />);
    const input = screen.getByPlaceholderText(/search/i);
    fireEvent.change(input, { target: { value: "zzznomatch" } });
    expect(screen.getByText("No clinics match your search")).toBeInTheDocument();
  });

  it("sign out button calls supabase signOut", async () => {
    render(<DiscoverClient clinics={CLINICS} />);
    fireEvent.click(screen.getByText("Sign out"));
    await vi.waitFor(() => expect(mockSignOut).toHaveBeenCalled());
  });
});
