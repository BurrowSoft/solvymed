import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// /book/[professionalId] checks migration 141's get_practice_accepts_bookings
// first (UX / mobile #196): a locked practice says so instead of a calendar.
// Only an explicit false stops it; an error or a database without 141
// (PGRST202) books as before.

const h = vi.hoisted(() => ({ accepts: { data: true as unknown, error: null as unknown } }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "pat-1", email: "p@x.invalid" } } }) },
    rpc: (fn: string) => {
      if (fn === "get_practice_accepts_bookings") return Promise.resolve(h.accepts);
      if (fn === "get_professional_public_info") return { maybeSingle: async () => ({ data: { full_name: "Dra. Ana", specialty: null, clinic_name: "Clínica X" }, error: null }) };
      return Promise.resolve({ data: [], error: null });
    },
  }),
}));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (k: string) => k }));
vi.mock("next/navigation", () => ({ redirect: () => { throw new Error("REDIRECT"); } }));
vi.mock("@/app/[locale]/(site)/book/[professionalId]/BookingClient", () => ({ BookingClient: () => <div>CALENDAR</div> }));

import BookPage from "@/app/[locale]/(site)/book/[professionalId]/page";

const props = () => ({ params: Promise.resolve({ locale: "pt-BR", professionalId: "doc-1" }), searchParams: Promise.resolve({}) });
beforeEach(() => { h.accepts = { data: true, error: null }; });

describe("booking a locked practice", () => {
  it("false: the note, the practice's name and a way to my appointments; no calendar", async () => {
    h.accepts = { data: false, error: null };
    render(await BookPage(props()));
    expect(screen.getByRole("status").textContent).toBe("practiceInactive");
    expect(screen.getByText("Dra. Ana")).toBeInTheDocument();
    expect(screen.getByText("viewAppointments").getAttribute("href")).toBe("/pt-BR/my-appointments");
    expect(screen.queryByText("CALENDAR")).toBeNull();
  });

  it("true, an error, or no 141 yet (PGRST202): the booking calendar as before", async () => {
    for (const accepts of [{ data: true, error: null }, { data: null, error: { code: "PGRST202", message: "Could not find the function" } }, { data: null, error: { message: "boom" } }]) {
      h.accepts = accepts;
      const { unmount } = render(await BookPage(props()));
      expect(screen.getByText("CALENDAR")).toBeInTheDocument();
      unmount();
    }
  });
});
