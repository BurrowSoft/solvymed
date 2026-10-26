import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string, v?: Record<string, string>) => (k === "newPatientOption" ? `Agendar sem cadastro: ${v?.name}` : k),
}));
import { PatientPicker } from "@/app/[locale]/(site)/dashboard/(gated)/schedule/PatientPicker";

const PATIENTS = [{ id: "p1", full_name: "Tânia Lopes" }, { id: "p2", full_name: "Beatriz Toledo" }];

async function typeIn(text: string) {
  const input = screen.getByRole("combobox") as HTMLInputElement;
  fireEvent.change(input, { target: { value: text } });
  await act(async () => { await vi.advanceTimersByTimeAsync(250); });
  return input;
}

// Vitor's test (29/30): typing "T" showed nothing (2-letter minimum and a
// native <datalist>). Now: our own list from the first letter, plus
// "Agendar sem cadastro: {texto}" (UX: it books without creating a record).
describe("PatientPicker", () => {
  it("searches from ONE letter and lists the matches + \"Agendar sem cadastro\"", async () => {
    vi.useFakeTimers();
    const search = vi.fn(async () => PATIENTS);
    render(<form><PatientPicker search={search} /></form>);
    await typeIn("T");
    expect(search).toHaveBeenCalledWith("T");
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Tânia Lopes", "Beatriz Toledo", "Agendar sem cadastro: T"]);
    vi.useRealTimers();
  });

  it("picking a patient books by id; typing again drops it", async () => {
    vi.useFakeTimers();
    const { container } = render(<form><PatientPicker search={async () => PATIENTS} /></form>);
    const input = await typeIn("Be");
    fireEvent.mouseDown(screen.getByText("Beatriz Toledo"));
    expect(input.value).toBe("Beatriz Toledo");
    expect((container.querySelector("input[name=patient_id]") as HTMLInputElement).value).toBe("p2");
    expect(screen.queryByRole("listbox")).toBeNull();
    await typeIn("Beatriz T");
    expect(container.querySelector("input[name=patient_id]")).toBeNull();
    vi.useRealTimers();
  });

  it("keyboard: arrows + Enter choose; \"Agendar sem cadastro\" keeps the typed name, unlinked", async () => {
    vi.useFakeTimers();
    const { container } = render(<form><PatientPicker search={async () => [PATIENTS[0]]} /></form>);
    const input = await typeIn("Tâ");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input.value).toBe("Tâ");
    expect(container.querySelector("input[name=patient_id]")).toBeNull();
    vi.useRealTimers();
  });

  it("an exact name hides \"Agendar sem cadastro\"", async () => {
    vi.useFakeTimers();
    render(<form><PatientPicker search={async () => PATIENTS} /></form>);
    await typeIn("tânia lopes");
    expect(screen.queryByText(/Agendar sem cadastro/)).toBeNull();
    vi.useRealTimers();
  });

  // 01, 10-26 (the app the same): no booking by name before the search answers, and a
  // failed search never silently offers it.
  it("while the search runs: 'Buscando…', no unregistered row, Save blocked; then unblocked", async () => {
    vi.useFakeTimers();
    let answer: (p: typeof PATIENTS) => void = () => {};
    const blocked = vi.fn();
    render(<form><PatientPicker search={() => new Promise((r) => { answer = r; })} onStatusChange={(st) => blocked(st.blocked)} /></form>);
    await typeIn("Tâ");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["pickerSearching"]);
    expect(screen.getByTestId("picker-searching").getAttribute("aria-disabled")).toBe("true");
    expect(blocked).toHaveBeenLastCalledWith(true);
    await act(async () => { answer([PATIENTS[0]]); });
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Tânia Lopes", "Agendar sem cadastro: Tâ"]);
    expect(blocked).toHaveBeenLastCalledWith(false);
    vi.useRealTimers();
  });

  it("no match: the row says it will be booked without a record, and Save is free", async () => {
    vi.useFakeTimers();
    const blocked = vi.fn();
    render(<form><PatientPicker search={async () => []} onStatusChange={(st) => blocked(st.blocked)} /></form>);
    await typeIn("Zé");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["pickerNoMatch"]);
    expect(blocked).toHaveBeenLastCalledWith(false);
    vi.useRealTimers();
  });

  it("a failed search: the message, Save blocked until 'mesmo assim' or a retry that works", async () => {
    vi.useFakeTimers();
    const blocked = vi.fn();
    let fail = true;
    const search = vi.fn(async () => { if (fail) throw new Error("x"); return [PATIENTS[1]]; });
    render(<form><PatientPicker search={search} onStatusChange={(st) => blocked(st.blocked)} /></form>);
    await typeIn("Be");
    expect(screen.getByTestId("picker-failed").textContent).toContain("pickerFailed");
    expect(screen.queryByText(/Agendar sem cadastro/)).toBeNull();
    expect(blocked).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByText("pickerAnyway"));
    expect(blocked).toHaveBeenLastCalledWith(false);
    fail = false;
    await act(async () => { fireEvent.click(screen.getByText("pickerRetry")); });
    expect(search).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId("picker-failed")).toBeNull();
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Beatriz Toledo", "Agendar sem cadastro: Be"]);
    vi.useRealTimers();
  });

  it("matches but none picked: Save stays free, the form shows the link hint; never an automatic pick", async () => {
    vi.useFakeTimers();
    const status = vi.fn();
    const { container } = render(<form><PatientPicker search={async () => PATIENTS} onStatusChange={status} /></form>);
    await typeIn("Tânia Lopes");
    expect(status).toHaveBeenLastCalledWith({ blocked: false, unlinked: true });
    expect(container.querySelector("input[name=patient_id]")).toBeNull();
    fireEvent.mouseDown(screen.getByText("Tânia Lopes"));
    expect(status).toHaveBeenLastCalledWith({ blocked: false, unlinked: false });
    vi.useRealTimers();
  });
});
