import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// "Discard changes?" on New patient, New appointment, Reschedule and Block
// time (02):
// with changes, ✕, a click outside, Escape and Cancel ask first; Keep
// editing keeps what was typed, Discard closes. Clean, they close at once,
// and Escape closes too.

vi.mock("next/navigation", async (orig) => ({
  ...(await orig<typeof import("next/navigation")>()),
  useParams: () => ({ locale: "pt-BR" }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/pt-BR/dashboard",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/schedule/actions", () => ({
  getScheduleDay: async () => null,
  createAppointment: vi.fn(),
  searchPatientsForPicker: async () => [],
  updateAppointmentStatus: vi.fn(), deleteAppointment: vi.fn(), blockTime: vi.fn(), moveAppointment: vi.fn(), undoScheduleChange: vi.fn(),
}));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/actions", () => ({ createPatient: vi.fn(), restorePatient: vi.fn() }));
vi.mock("@/lib/dropQueryParam", () => ({ dropQueryParam: vi.fn() }));

import { BlockTimeButton, NewAppointmentButton, RescheduleButton } from "@/app/[locale]/(site)/dashboard/(gated)/schedule/ScheduleClient";
import { NewPatientButton } from "@/app/[locale]/(site)/dashboard/(gated)/patients/PatientsClient";
import { PracticeLocationsProvider } from "@/components/PracticeLocations";
import { hasUnsavedChanges } from "@/components/DiscardGuard";
import { createAppointment } from "@/app/[locale]/(site)/dashboard/(gated)/schedule/actions";

const C = pt.common;
const S = pt.schedule;
const wrap = (ui: React.ReactNode) => render(<NextIntlClientProvider locale="pt-BR" messages={pt}>{ui}</NextIntlClientProvider>);
// The dirty check runs just after the change.
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 5)); });

afterEach(() => cleanup());

const heading = (title: string) => screen.queryByRole("heading", { name: title });
// The four ways out.
const ways = (title: string) => ({
  x: () => fireEvent.click(heading(title)!.nextElementSibling!),
  outside: () => fireEvent.click(heading(title)!.closest(".fixed")!),
  escape: () => act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); }),
  cancel: () => fireEvent.click(screen.getByRole("button", { name: S.cancel })),
});
const asks = () => screen.queryByTestId("discard-confirm");

describe("New appointment", () => {
  const A = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Unidade Centro", is_primary: true };
  const B = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Unidade Sul", is_primary: false };
  const page = () => wrap(
    <PracticeLocationsProvider value={{ list: [A, B], hours: { mon: { location_id: B.id } } }}>
      <NewAppointmentButton defaultDate="2030-01-14" procedures={[]} />
    </PracticeLocationsProvider>,
  );
  const open = () => fireEvent.click(screen.getByRole("button", { name: S.newAppt }));
  const notes = () => document.querySelector("textarea[name=notes]") as HTMLTextAreaElement;

  it.each(["x", "outside", "escape", "cancel"] as const)("clean: %s closes at once", async (way) => {
    page();
    open();
    await settle();
    ways(S.newAppt)[way]();
    expect(asks()).toBeNull();
    expect(heading(S.newAppt)).toBeNull();
  });

  it.each(["x", "outside", "escape", "cancel"] as const)("with changes: %s asks; Keep editing keeps them, Discard closes", async (way) => {
    page();
    open();
    fireEvent.change(notes(), { target: { value: "Trazer exames" } });
    await settle();
    expect(hasUnsavedChanges()).toBe(true);
    ways(S.newAppt)[way]();
    expect(asks()).toHaveTextContent(C.discardTitle);
    fireEvent.click(screen.getByRole("button", { name: C.keepEditing }));
    expect(asks()).toBeNull();
    expect(notes().value).toBe("Trazer exames");
    ways(S.newAppt)[way]();
    fireEvent.click(screen.getByRole("button", { name: C.discard }));
    expect(heading(S.newAppt)).toBeNull();
    await settle();
    expect(hasUnsavedChanges()).toBe(false);
    // Opened again: empty.
    open();
    expect(notes().value).toBe("");
  });

  it("Esc on the question is Keep editing (ec)", async () => {
    page();
    open();
    fireEvent.change(notes(), { target: { value: "Trazer exames" } });
    await settle();
    ways(S.newAppt).escape();
    expect(asks()).toHaveTextContent(C.discardTitle);
    ways(S.newAppt).escape();
    expect(asks()).toBeNull();
    expect(heading(S.newAppt)).not.toBeNull();
    expect(notes().value).toBe("Trazer exames");
  });

  it("with the check-time question over it, Esc doesn't close or ask", async () => {
    vi.mocked(createAppointment).mockResolvedValueOnce({ error: "needs_confirm", code: "needs_confirm", hours: { kind: "outside", start: "08:00", end: "18:00" }, blocked: null } as never);
    page();
    open();
    fireEvent.change(notes(), { target: { value: "Trazer exames" } });
    await settle();
    await act(async () => { fireEvent.submit(notes().form!); });
    expect(await screen.findByRole("heading", { name: S.checkTimeTitle })).toBeInTheDocument();
    ways(S.newAppt).escape();
    expect(asks()).toBeNull();
    expect(heading(S.newAppt)).not.toBeNull();
    expect(heading(S.checkTimeTitle)).not.toBeNull();
  });

  it("a choice made by clicking (a location chip) counts as a change", async () => {
    page();
    open();
    fireEvent.click(screen.getByText("Unidade Centro"));
    await settle();
    ways(S.newAppt).escape();
    expect(asks()).toHaveTextContent(C.discardTitle);
  });
});

describe("Reschedule", () => {
  const page = () => wrap(<RescheduleButton id="cccccccc-cccc-4ccc-8ccc-cccccccccccc" date="2030-01-14" start="09:00" />);
  const open = () => fireEvent.click(screen.getByRole("button", { name: S.reschedule }));

  it("clean: Escape and Cancel close at once", async () => {
    page();
    open();
    await settle();
    ways(S.rescheduleTitle).escape();
    expect(heading(S.rescheduleTitle)).toBeNull();
    open();
    await settle();
    ways(S.rescheduleTitle).cancel();
    expect(asks()).toBeNull();
    expect(heading(S.rescheduleTitle)).toBeNull();
  });

  it("another time picked: ✕ asks; Discard closes", async () => {
    page();
    open();
    const other = await screen.findByRole("button", { name: "10:00" });
    fireEvent.click(other);
    await settle();
    ways(S.rescheduleTitle).x();
    expect(asks()).toHaveTextContent(C.discardTitle);
    fireEvent.click(screen.getByRole("button", { name: C.discard }));
    expect(heading(S.rescheduleTitle)).toBeNull();
  });
});

describe("Block time", () => {
  const page = () => wrap(<BlockTimeButton defaultDate="2030-01-14" />);
  const open = () => fireEvent.click(screen.getByRole("button", { name: S.blockTime }));
  const reason = () => document.querySelector("input[name=reason]") as HTMLInputElement;

  it.each(["x", "outside", "escape", "cancel"] as const)("clean: %s closes at once", async (way) => {
    page();
    open();
    await settle();
    ways(S.blockTime)[way]();
    expect(asks()).toBeNull();
    expect(heading(S.blockTime)).toBeNull();
  });

  it.each(["x", "outside", "escape", "cancel"] as const)("a reason typed: %s asks; Keep editing keeps it, Discard closes", async (way) => {
    page();
    open();
    fireEvent.change(reason(), { target: { value: "Congresso" } });
    await settle();
    ways(S.blockTime)[way]();
    expect(asks()).toHaveTextContent(C.discardTitle);
    fireEvent.click(screen.getByRole("button", { name: C.keepEditing }));
    expect(reason().value).toBe("Congresso");
    ways(S.blockTime)[way]();
    fireEvent.click(screen.getByRole("button", { name: C.discard }));
    expect(heading(S.blockTime)).toBeNull();
    open();
    expect(reason().value).toBe("");
  });
});

describe("New patient", () => {
  const P = pt.patients;
  const page = () => wrap(<NewPatientButton locale="pt-BR" idKind="BR" />);
  const open = () => fireEvent.click(screen.getByRole("button", { name: P.newPatient }));
  const name = () => document.querySelector("input[name=full_name]") as HTMLInputElement;

  it.each(["x", "outside", "escape"] as const)("clean: %s closes at once", async (way) => {
    page();
    open();
    await settle();
    ways(P.newPatient)[way]();
    expect(asks()).toBeNull();
    expect(heading(P.newPatient)).toBeNull();
  });

  it.each(["x", "outside", "escape"] as const)("a name typed: %s asks; Keep editing keeps it, Discard closes", async (way) => {
    page();
    open();
    fireEvent.change(name(), { target: { value: "Maria Souza" } });
    await settle();
    ways(P.newPatient)[way]();
    expect(asks()).toHaveTextContent(C.discardTitle);
    fireEvent.click(screen.getByRole("button", { name: C.keepEditing }));
    expect(name().value).toBe("Maria Souza");
    ways(P.newPatient)[way]();
    fireEvent.click(screen.getByRole("button", { name: C.discard }));
    expect(heading(P.newPatient)).toBeNull();
    open();
    expect(name().value).toBe("");
  });
});
