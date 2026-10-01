import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string, v?: Record<string, string>) => (k === "newPatientOption" ? `Novo paciente: ${v?.name}` : k),
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
// "Novo paciente: {texto}".
describe("PatientPicker", () => {
  it("searches from ONE letter and lists the matches + \"Novo paciente\"", async () => {
    vi.useFakeTimers();
    const search = vi.fn(async () => PATIENTS);
    render(<form><PatientPicker search={search} /></form>);
    await typeIn("T");
    expect(search).toHaveBeenCalledWith("T");
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Tânia Lopes", "Beatriz Toledo", "Novo paciente: T"]);
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

  it("keyboard: arrows + Enter choose; \"Novo paciente\" keeps the typed name, unlinked", async () => {
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

  it("an exact name hides \"Novo paciente\"; a failed search still offers it", async () => {
    vi.useFakeTimers();
    const { unmount } = render(<form><PatientPicker search={async () => PATIENTS} /></form>);
    await typeIn("tânia lopes");
    expect(screen.queryByText(/Novo paciente/)).toBeNull();
    unmount();
    render(<form><PatientPicker search={async () => { throw new Error("x"); }} /></form>);
    await typeIn("Zé");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Novo paciente: Zé"]);
    vi.useRealTimers();
  });
});
