import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const push = vi.fn();
let pathname = "/dashboard/schedule";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => pathname }));
vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => (key: string, v?: Record<string, unknown>) => `${ns}.${key}${v ? JSON.stringify(v) : ""}`,
}));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));

import { SolvyAi, cardIsSafe, screenOf } from "@/components/solvyai/SolvyAi";
import { mockAnswer } from "@/lib/assistant/mockBackend";
import type { ConfirmationCard } from "@/lib/assistant/types";

beforeEach(() => {
  push.mockClear();
  pathname = "/dashboard/schedule";
  try { localStorage.clear(); } catch { /* none */ }
});

function openPanel(props: Partial<Parameters<typeof SolvyAi>[0]> = {}) {
  render(<SolvyAi locale="pt-BR" prefix="/pt-BR" dailyLimit={20} {...props} />);
  fireEvent.click(screen.getByLabelText("assistant.open"));
}

describe("SolvyAI panel (specs/assistant.md §2)", () => {
  it("the ✦ button is the tour's spotlight target and opens the panel with this screen's chips", async () => {
    pathname = "/pt-BR/dashboard/schedule";
    render(<SolvyAi locale="pt-BR" prefix="/pt-BR" dailyLimit={20} />);
    expect(screen.getByLabelText("assistant.open")).toHaveAttribute("data-tour", "solvyai");
    fireEvent.click(screen.getByLabelText("assistant.open"));
    expect(screen.getByText("assistant.chips.schedule.a")).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText("assistant.usageToday").length).toBeGreaterThan(0));
    expect(screen.getByText("assistant.noPatientData")).toBeInTheDocument();
  });

  it("a help question streams an answer from the Help articles with steps and feedback", async () => {
    openPanel();
    fireEvent.change(screen.getByLabelText("assistant.placeholder"), { target: { value: "Como bloquear horário na agenda?" } });
    fireEvent.click(screen.getByText("assistant.send"));
    await waitFor(() => expect(screen.getByLabelText("assistant.helpful")).toBeInTheDocument(), { timeout: 5000 });
    expect(screen.getByText(/Bloquear horários/)).toBeInTheDocument();
  });

  it("personal data is masked before it's sent (and shown)", async () => {
    openPanel();
    fireEvent.change(screen.getByLabelText("assistant.placeholder"), { target: { value: "paciente CPF 123.456.789-09 não aparece" } });
    fireEvent.click(screen.getByText("assistant.send"));
    await waitFor(() => expect(screen.getByText("paciente CPF [cpf] não aparece")).toBeInTheDocument());
  });

  async function ask(text: string) {
    fireEvent.change(screen.getByLabelText("assistant.placeholder"), { target: { value: text } });
    fireEvent.click(screen.getByText("assistant.send"));
  }

  it("after a confirmed save: the panel minimises, goes to the day with the item highlighted, and offers Desfazer", async () => {
    openPanel();
    await ask("Marca a Maria Silva amanhã às 14h");
    await waitFor(() => expect(screen.getByText("assistant.confirm")).toBeInTheDocument(), { timeout: 5000 });
    expect(screen.getAllByText("(assistant.default)").length).toBe(4);
    fireEvent.click(screen.getByText("assistant.confirm"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/pt-BR/dashboard/schedule?date=2026-09-29&highlight=demo-1"));
    // Minimised to the pill, with the toast.
    expect(screen.queryByLabelText("assistant.placeholder")).not.toBeInTheDocument();
    expect(screen.getByText("SolvyAI ✦")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("assistant.saved (assistant.simulated)");
    fireEvent.click(screen.getByText(/assistant\.undo/));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("assistant.undone"));
  });

  it("a saved card can't be confirmed again after the panel is minimised and reopened (tester's finding)", async () => {
    openPanel();
    await ask("Marca a Maria Silva amanhã às 14h");
    await waitFor(() => expect(screen.getByText("assistant.confirm")).toBeInTheDocument(), { timeout: 5000 });
    fireEvent.click(screen.getByText("assistant.confirm"));
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    // Reopen from the pill: the card shows it was saved, with no Confirmar.
    fireEvent.click(screen.getByText("SolvyAI ✦"));
    expect(screen.queryByText("assistant.confirm")).not.toBeInTheDocument();
    expect(screen.getAllByText("assistant.saved").length).toBeGreaterThan(0);
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("blocked time asks the card's second question; Cancelar saves nothing", async () => {
    openPanel();
    await ask("Marca a Maria Silva amanhã às 12h");
    await waitFor(() => expect(screen.getByText("assistant.confirm")).toBeInTheDocument(), { timeout: 5000 });
    fireEvent.click(screen.getByText("assistant.confirm"));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Este horário está bloqueado (12:00–13:00). Agendar mesmo assim?");
    fireEvent.click(screen.getByText("assistant.cancel"));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    // Asked again, then Agendar saves.
    fireEvent.click(screen.getByText("assistant.confirm"));
    fireEvent.click(screen.getByText("Agendar"));
    await waitFor(() => expect(push).toHaveBeenCalled());
  });

  it("a conflict gets time chips, never a card; a chip is sent as the doctor's own choice", async () => {
    openPanel();
    await ask("Marca a Maria Silva amanhã às 10h");
    await waitFor(() => expect(screen.getByText("10:30")).toBeInTheDocument(), { timeout: 5000 });
    expect(screen.queryByText("assistant.confirm")).not.toBeInTheDocument();
    expect(screen.getByText("assistant.otherTime")).toBeInTheDocument();
  });

  it("a slot taken between the card and Confirmar: nothing saved, fresh times in the conversation", async () => {
    openPanel();
    await ask("Marca a Maria Silva amanhã às 16h");
    await waitFor(() => expect(screen.getByText("assistant.confirm")).toBeInTheDocument(), { timeout: 5000 });
    fireEvent.click(screen.getByText("assistant.confirm"));
    await waitFor(() => expect(screen.getByText("16:30")).toBeInTheDocument(), { timeout: 5000 });
    expect(screen.getByText("assistant.failed")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("at the daily limit the input is replaced by the limit message", async () => {
    openPanel({ dailyLimit: 1 });
    fireEvent.change(screen.getByLabelText("assistant.placeholder"), { target: { value: "Qual a dose?" } });
    fireEvent.click(screen.getByText("assistant.send"));
    await waitFor(() => expect(screen.getByText(/assistant\.limitReached/)).toBeInTheDocument(), { timeout: 5000 });
    expect(screen.queryByLabelText("assistant.placeholder")).not.toBeInTheDocument();
  });

  it("messages are capped at 500 characters", () => {
    openPanel();
    const box = screen.getByLabelText("assistant.placeholder") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "x".repeat(600) } });
    expect(box.value.length).toBe(500);
    expect(screen.getByText("500/500")).toBeInTheDocument();
  });

  it("fails closed: a blocked / outside-hours card without its second question is never shown", () => {
    const b = mockAnswer("Marca a Maria Silva amanhã às 12h", "pt", "").find((x) => x.type === "card");
    if (!b || b.type !== "card") throw new Error("no card");
    expect(cardIsSafe(b.card)).toBe(true);
    const bad: ConfirmationCard = { ...b.card, secondConfirm: undefined };
    expect(cardIsSafe(bad)).toBe(false);
    expect(cardIsSafe({ ...bad, warnings: [{ code: "outside_hours", text: "x" }] })).toBe(false);
    // Warnings that don't ask twice are fine without one.
    expect(cardIsSafe({ ...bad, warnings: [{ code: "same_patient_day", text: "x" }] })).toBe(true);
  });

  it("maps the page to its screen", () => {
    expect(screenOf("/pt-BR/dashboard", "/pt-BR")).toBe("home");
    expect(screenOf("/dashboard/patients/abc", "")).toBe("patients");
    expect(screenOf("/pt-BR/dashboard/clinics", "/pt-BR")).toBe("other");
  });
});
