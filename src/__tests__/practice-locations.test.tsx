import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// 1.8.0 F (migration 200, flag 'practice_locations'): several locations.
// Shown only with 2+; the primary first, can't be deleted while others
// remain; a location per working day, posted only when the picker shows.

const h = vi.hoisted(() => ({ makePrimary: vi.fn(), del: vi.fn(), update: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/clinics/actions", () => ({
  addClinic: vi.fn(),
  deleteClinic: (...a: unknown[]) => h.del(...a),
  locateClinicCity: vi.fn(),
  makePrimaryClinic: (...a: unknown[]) => h.makePrimary(...a),
  updateClinic: (...a: unknown[]) => h.update(...a),
  updateClinicLocation: vi.fn(),
}));

import { dayKeyOf, locationIdForDate, locationNameFor, publicLocationForDate, shownLocations, sortLocations } from "@/lib/locations";
import { ClinicsClient } from "@/app/[locale]/(site)/dashboard/(gated)/clinics/ClinicsClient";

const A = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Unidade Centro", is_primary: true };
const B = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Unidade Sul", is_primary: false };

beforeEach(() => {
  h.makePrimary.mockReset().mockResolvedValue({ success: true });
  h.del.mockReset().mockResolvedValue({ success: true });
  h.update.mockReset().mockResolvedValue({ success: true });
});

describe("the location rules (the app's lib/locations)", () => {
  it("shown only with the switch on and 2+", () => {
    expect(shownLocations([A, B], true)).toHaveLength(2);
    expect(shownLocations([A], true)).toEqual([]);
    expect(shownLocations([A, B], false)).toEqual([]);
  });

  it("the primary first, then position", () => {
    expect(sortLocations([{ ...B, position: 0 }, { ...A, position: 5 }]).map((l) => l.id)).toEqual([A.id, B.id]);
  });

  it("a visit's name: its own, else the primary; none with one location", () => {
    expect(locationNameFor(B.id, [A, B])).toBe("Unidade Sul");
    expect(locationNameFor(null, [A, B])).toBe("Unidade Centro");
    expect(locationNameFor("gone", [A, B])).toBe("Unidade Centro");
    expect(locationNameFor(B.id, [B])).toBeNull();
  });

  it("a date's location follows its day's hours, else the primary (200's _location_for_day)", () => {
    expect(dayKeyOf("2026-10-07")).toBe("wed");
    const hours = { wed: { location_id: B.id }, thu: { location_id: "not-hers" } };
    expect(locationIdForDate(hours, "2026-10-07", [A, B])).toBe(B.id);
    expect(locationIdForDate(hours, "2026-10-08", [A, B])).toBe(A.id);
    expect(locationIdForDate(hours, "2026-10-09", [A, B])).toBe(A.id);
    expect(locationIdForDate(hours, "2026-10-07", [A])).toBeNull();
  });

  it("the public list (UX Q4): the location serving that day", () => {
    const list = [{ ...A, days: ["mon", "tue"] }, { ...B, days: ["wed"] }];
    expect(publicLocationForDate(list, "2026-10-07")?.name).toBe("Unidade Sul");
    expect(publicLocationForDate(list, "2026-10-10")?.name).toBe("Unidade Centro");
    expect(publicLocationForDate([list[0]], "2026-10-07")).toBeNull();
  });
});

describe("My Clinics with locations on", () => {
  const view = (clinics: typeof A[], locationsOn = true) =>
    render(<NextIntlClientProvider locale="pt-BR" messages={pt}><ClinicsClient clinics={clinics} locationsOn={locationsOn} /></NextIntlClientProvider>);

  it("the primary badge and Make primary only with 2+", () => {
    view([A, B]);
    expect(screen.getAllByTestId("location-primary")).toHaveLength(1);
    expect(screen.getAllByText(pt.locations.makePrimary)).toHaveLength(1);
  });

  it("off: as before (no badge, no edit)", () => {
    view([A, B], false);
    expect(screen.queryByTestId("location-primary")).toBeNull();
    expect(screen.queryByText(pt.locations.edit)).toBeNull();
  });

  it("Make primary moves the badge", async () => {
    view([A, B]);
    await act(async () => { fireEvent.click(screen.getByText(pt.locations.makePrimary)); });
    expect(h.makePrimary).toHaveBeenCalledWith(B.id);
    const badge = screen.getByTestId("location-primary");
    expect(badge.closest("h3")?.textContent).toContain("Unidade Sul");
  });

  it("the primary can't be deleted while others remain", () => {
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    view([A, B]);
    fireEvent.click(screen.getAllByLabelText(pt.clinics.delete)[0]);
    expect(alert).toHaveBeenCalledWith(pt.locations.deletePrimary);
    expect(h.del).not.toHaveBeenCalled();
    alert.mockRestore();
  });
});
