import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const push = vi.fn();
let pathname = "/dashboard/schedule";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => pathname }));
vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => (key: string, v?: Record<string, unknown>) => `${ns}.${key}${v ? JSON.stringify(v) : ""}`,
}));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));

import { SolvyAi, screenOf } from "@/components/solvyai/SolvyAi";

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

  it("an action comes back as a confirmation card; Confirmar is simulated and offers Desfazer", async () => {
    openPanel();
    fireEvent.change(screen.getByLabelText("assistant.placeholder"), { target: { value: "Marca a Maria Silva amanhã às 14h" } });
    fireEvent.click(screen.getByText("assistant.send"));
    await waitFor(() => expect(screen.getByText("assistant.confirm")).toBeInTheDocument(), { timeout: 5000 });
    expect(screen.getAllByText("(assistant.default)").length).toBe(4);
    fireEvent.click(screen.getByText("assistant.confirm"));
    await waitFor(() => expect(screen.getByText("assistant.saved")).toBeInTheDocument());
    expect(screen.getByText("(assistant.simulated)")).toBeInTheDocument();
    expect(screen.getByText(/assistant\.undo/)).toBeInTheDocument();
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

  it("maps the page to its screen", () => {
    expect(screenOf("/pt-BR/dashboard", "/pt-BR")).toBe("home");
    expect(screenOf("/dashboard/patients/abc", "")).toBe("patients");
    expect(screenOf("/pt-BR/dashboard/clinics", "/pt-BR")).toBe("other");
  });
});
