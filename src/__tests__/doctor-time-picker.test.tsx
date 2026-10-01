import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// Item 10, the doctor's picker (the same as app #243): the grid within the
// day's hours, greyed past closing / outside, taken marked, the toggle, the
// free time, and the chosen time; it writes the form's date / start fields.

const day = vi.hoisted(() => ({
  hoursSet: true,
  day: { enabled: true, start: "09:00", end: "12:00" },
  taken: [{ start: "10:00", end: "10:30" }],
  openWeekdays: [1, 2, 3, 4, 5],
  country: "BR",
}));
const calls = vi.hoisted(() => [] as unknown[][]);
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/schedule/actions", () => ({ getScheduleDay: async (...a: unknown[]) => { calls.push(a); return day; } }));

import { DoctorTimePicker } from "@/components/DoctorTimePicker";

function show() {
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={pt}>
      <form data-testid="f"><DoctorTimePicker defaultDate="2030-01-14" defaultStart="09:00" duration={30} /></form>
    </NextIntlClientProvider>,
  );
}

describe("DoctorTimePicker", () => {
  it("the day's hours, taken marked, ending after closing greyed; picks write the form", async () => {
    show();
    await waitFor(() => expect(screen.getByRole("button", { name: /^11:45/ })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /^10:00/ }).className).toContain("line-through");
    expect(screen.getByRole("button", { name: /^11:45/ }).className).toContain("text-slate-400"); // 11:45 + 30 > 12:00
    fireEvent.click(screen.getByRole("button", { name: /^11:15/ }));
    const f = new FormData(screen.getByTestId("f") as HTMLFormElement);
    expect(f.get("date")).toBe("2030-01-14");
    expect(f.get("start_time")).toBe("11:15");
    expect(screen.getByTestId("doctor-chosen-time")).toHaveTextContent("seg., 14 jan · 11:15–11:45");
  });

  it("Mostrar fora do horário widens to 06:00–22:00; Outro horário… takes any time", async () => {
    show();
    await waitFor(() => expect(screen.getByText("Mostrar fora do horário")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Mostrar fora do horário"));
    expect(screen.getByRole("button", { name: /^06:00/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^21:45/ })).toBeInTheDocument();
    fireEvent.click(screen.getByText("Outro horário…"));
    fireEvent.change(screen.getByLabelText("Outro horário…"), { target: { value: "13:07" } });
    expect(new FormData(screen.getByTestId("f") as HTMLFormElement).get("start_time")).toBe("13:07");
  });

  it("passes the appointment being moved, so it isn't taken against itself (9a)", async () => {
    render(
      <NextIntlClientProvider locale="pt-BR" messages={pt}>
        <DoctorTimePicker defaultDate="2030-01-14" defaultStart="10:00" duration={30} excludeId="appt-1" />
      </NextIntlClientProvider>,
    );
    await waitFor(() => expect(calls.some((c) => c[0] === "2030-01-14" && c[1] === "appt-1")).toBe(true));
  });

  it("waits for the day before showing times or the chosen line (no BR flash in a TH practice; d7)", async () => {
    show();
    expect(screen.getByTestId("doctor-time-grid")).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByTestId("doctor-chosen-time")).toBeNull();
    await waitFor(() => expect(screen.getByTestId("doctor-time-grid")).toHaveAttribute("aria-busy", "false"));
    expect(screen.getByTestId("doctor-chosen-time")).toBeInTheDocument();
  });
});
