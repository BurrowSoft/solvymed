import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";
import en from "@/messages/en.json";
import th from "@/messages/th.json";

// 166 "Todos" views (UX, 6 Oct): List / Day (a column per doctor) / Week /
// Month; a fixed palette by her list's order (never the brand colour), the
// doctor's name with every dot; grids only when the shown doctors share a
// time zone; an appointment's detail acts for its own doctor.

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const h = vi.hoisted(() => ({ push: vi.fn(), actFor: vi.fn(), search: "" }));
vi.mock("next/navigation", async (orig) => ({
  ...(await orig<typeof import("next/navigation")>()),
  useRouter: () => ({ push: h.push, refresh: vi.fn() }),
  usePathname: () => "/pt-BR/dashboard/schedule",
  useSearchParams: () => new URLSearchParams(h.search),
}));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/schedule/row-actions", () => ({ actForRow: h.actFor }));

import { doctorColor, doctorColors, DOCTOR_PALETTE } from "@/lib/doctorPalette";

import { viewRange, parseView, sharedZone } from "@/lib/calendarRange";
import { CalendarView, type CalendarAppt, type CalendarDoctors } from "@/app/[locale]/(site)/dashboard/(gated)/schedule/CalendarView";
import { ViewToggle } from "@/app/[locale]/(site)/dashboard/(gated)/schedule/ScheduleClient";
import { PracticeSwitcher } from "@/components/PracticeSwitcher";

beforeEach(() => {
  h.push.mockReset();
  h.actFor.mockReset().mockResolvedValue({ ok: true });
  h.search = "";
});

const ctx = (currency: string) => ({ currency, pixKey: null, promptPayId: null, clinicName: "", clinicCity: "", procedures: [] }) as never;
const doctors: CalendarDoctors = {
  [A]: { tag: { id: A, name: "Dra. Ana Lima", short: "Dra. Ana Lima", color: doctorColor(0), calendar: "gregorian" }, ctx: ctx("BRL") },
  [B]: { tag: { id: B, name: "Dr. Paulo Souza", short: "Dr. Paulo Souza", color: doctorColor(1), calendar: "gregorian" }, ctx: ctx("BRL") },
};
const appt = (id: string, prof: string, date: string, start: string, name: string): CalendarAppt => ({
  id, professional_id: prof, date, patient_name: name, start_time: start, end_time: start.replace(/^(\d\d)/, (x) => String(+x + 1).padStart(2, "0")),
  duration_minutes: 60, status: "scheduled", type: "consultation", consultation_type: "Consulta", payment_status: "pending", payment_amount: 0,
});
// The same slot for both doctors, as in the tester's fixture.
const appts = [appt("a1", A, "2026-10-06", "10:00:00", "Maria"), appt("b1", B, "2026-10-06", "10:00:00", "João")];
const show = (view: "day" | "week" | "month", locale = "pt-BR", messages: object = pt) =>
  render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <CalendarView appointments={appts} currentDate="2026-10-06" today="2026-10-06" view={view} doctors={doctors} doctorOrder={[A, B]} />
    </NextIntlClientProvider>,
  );

describe("the palette", () => {
  it("by her list's order, distinct, wrapping after the last", () => {
    expect(new Set(DOCTOR_PALETTE).size).toBe(DOCTOR_PALETTE.length);
    expect(doctorColor(0)).toBe(DOCTOR_PALETTE[0]);
    expect(doctorColor(DOCTOR_PALETTE.length)).toBe(DOCTOR_PALETTE[0]);
    expect(doctorColors([B, A]).get(B)).toBe(DOCTOR_PALETTE[0]);
  });

  it("the switcher's dot is the palette's, not the brand colour", () => {
    const list = [
      { professional_id: A, display_name: "Ana", title: "Dra.", accent_color: "#ff0000", is_primary: true },
      { professional_id: B, display_name: "Paulo", title: "Dr.", accent_color: "#00ff00", is_primary: false },
    ];
    const { container } = render(<NextIntlClientProvider locale="pt-BR" messages={pt}><PracticeSwitcher practices={list} current={B} /></NextIntlClientProvider>);
    const dot = container.querySelector("span[aria-hidden]") as HTMLElement;
    expect(dot.style.backgroundColor).toBe("rgb(194, 65, 12)"); // DOCTOR_PALETTE[1]
  });
});

describe("time zones", () => {
  it("grids only when every shown practice keeps the same zone", () => {
    expect(sharedZone(["America/Sao_Paulo", "America/Sao_Paulo"])).toBe("America/Sao_Paulo");
    expect(sharedZone(["America/Sao_Paulo", "America/Manaus"])).toBeNull();
    expect(sharedZone(["America/Manaus"])).toBe("America/Manaus");
    expect(sharedZone([])).toBeNull();
  });

  it("UX's hint, in all three languages", () => {
    expect(en.secretaryPractices.zonesDiffer).toBe("These doctors are in different time zones. Use the list, or pick one doctor to see the calendar.");
    expect(pt.secretaryPractices.zonesDiffer).toBe("Esses médicos estão em fusos horários diferentes. Use a lista ou escolha um médico para ver o calendário.");
    expect(th.secretaryPractices.zonesDiffer).toBe("แพทย์เหล่านี้อยู่ในเขตเวลาต่างกัน ใช้มุมมองรายการ หรือเลือกแพทย์หนึ่งท่านเพื่อดูปฏิทิน");
  });

  it("the toggle: grids disabled, the doctor filter kept", () => {
    h.search = `doctor=${A}`;
    render(<NextIntlClientProvider locale="pt-BR" messages={pt}><ViewToggle currentView="list" currentDate="2026-10-06" disabled={["day", "week", "month"]} /></NextIntlClientProvider>);
    expect(screen.getByRole("button", { name: pt.schedule.day })).toBeDisabled();
    expect(screen.getByRole("button", { name: pt.schedule.month })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: pt.schedule.list }));
    expect(h.push).toHaveBeenCalledWith(`/pt-BR/dashboard/schedule?date=2026-10-06&view=list&doctor=${A}`);
  });
});

describe("the views", () => {
  it("Day: one column per doctor (dot + name), each doctor's visit in their own column", () => {
    show("day");
    const cols = screen.getAllByTestId("doctor-column");
    expect(cols.map((c) => c.textContent)).toEqual(["Dra. Ana Lima", "Dr. Paulo Souza"]);
    const colA = cols[0].parentElement!;
    const colB = cols[1].parentElement!;
    expect(within(colA).getByText("Maria")).toBeInTheDocument();
    expect(within(colA).queryByText("João")).toBeNull();
    expect(within(colB).getByText("João")).toBeInTheDocument();
  });

  it("Week and Month: every item names its doctor next to the dot", () => {
    const { unmount } = show("week");
    expect(screen.getByText("Maria").closest("button")!.textContent).toContain("Dra. Ana Lima");
    expect(screen.getByText("João").closest("button")!.textContent).toContain("Dr. Paulo Souza");
    unmount();
    show("month");
    expect(screen.getByText(/Dra\. Ana Lima · Maria/)).toBeInTheDocument();
    expect(screen.getByText(/Dr\. Paulo Souza · João/)).toBeInTheDocument();
  });

  it("navigating keeps the doctor filter", () => {
    h.search = `doctor=${B}`;
    show("week");
    fireEvent.click(screen.getAllByRole("button")[1]); // next
    expect(h.push).toHaveBeenCalledWith(`/pt-BR/dashboard/schedule?date=2026-10-13&view=week&doctor=${B}`);
  });

  it("the detail names the doctor and acts for that doctor", async () => {
    show("day");
    fireEvent.click(screen.getByText("João"));
    expect(screen.getAllByTestId("doctor-tag").some((t) => t.textContent === "Dr. Paulo Souza")).toBe(true);
    const select = screen.getAllByRole("combobox").at(-1)!;
    fireEvent.change(select, { target: { value: "confirmed" } });
    await vi.waitFor(() => expect(h.actFor).toHaveBeenCalled());
    expect(h.actFor.mock.calls[0][0]).toBe(B);
  });
});

describe("the range a view reads", () => {
  it("day, the Monday–Sunday week, the month's whole weeks", () => {
    expect(viewRange("day", "2026-10-06")).toEqual({ start: "2026-10-06", end: "2026-10-06" });
    expect(viewRange("week", "2026-10-06")).toEqual({ start: "2026-10-05", end: "2026-10-11" });
    expect(viewRange("month", "2026-10-06")).toEqual({ start: "2026-09-28", end: "2026-11-01" });
    expect(parseView("nope")).toBe("list");
  });
});

describe("fail closed (c6)", () => {
  it("an appointment whose doctor isn't in the map shows no actions", () => {
    const stray = { ...appt("x1", "33333333-3333-4333-8333-333333333333", "2026-10-06", "12:00:00", "Ninguém") };
    render(
      <NextIntlClientProvider locale="pt-BR" messages={pt}>
        <CalendarView appointments={[stray]} currentDate="2026-10-06" today="2026-10-06" view="week" doctors={doctors} doctorOrder={[A, B]} />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByText("Ninguém"));
    expect(screen.getAllByText("Ninguém")).toHaveLength(2); // the block + the open detail
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});

describe("the day Todos opens on (f0/c6)", () => {
  it("a Manaus chip at 23:30 Manaus / 00:30 São Paulo opens on Manaus's date; a ?date wins", async () => {
    const { clinicDate } = await import("@/lib/clinicTime");
    const { todosDay } = await import("@/lib/calendarRange");
    const at = new Date("2026-10-06T03:30:00Z");
    const spToday = clinicDate(at, "America/Sao_Paulo");
    expect(spToday).toBe("2026-10-06");
    const todayIn = (z: string) => clinicDate(at, z);
    expect(todosDay(null, "America/Manaus", spToday, todayIn)).toEqual({ today: "2026-10-05", currentDate: "2026-10-05" });
    expect(todosDay("2026-10-09", "America/Manaus", spToday, todayIn)).toEqual({ today: "2026-10-05", currentDate: "2026-10-09" });
    // Across zones (list only): her primary's today.
    expect(todosDay(null, null, spToday, todayIn)).toEqual({ today: "2026-10-06", currentDate: "2026-10-06" });
  });
});

describe("arrow labels (53's a11y nit; cf's copy)", () => {
  it("say what moves, per view, in all three languages", () => {
    for (const [view, prev, next] of [["day", "Dia anterior", "Próximo dia"], ["week", "Semana anterior", "Próxima semana"], ["month", "Mês anterior", "Próximo mês"]] as const) {
      const { unmount } = show(view);
      expect(screen.getByRole("button", { name: prev })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: next })).toBeInTheDocument();
      unmount();
    }
    expect([en.schedule.prevWeek, en.schedule.nextMonth]).toEqual(["Previous week", "Next month"]);
    expect([th.schedule.prevDay, th.schedule.nextWeek, th.schedule.prevMonth]).toEqual(["วันก่อนหน้า", "สัปดาห์ถัดไป", "เดือนก่อนหน้า"]);
  });
});
