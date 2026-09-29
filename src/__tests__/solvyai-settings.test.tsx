import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => (key: string) => `${ns}.${key}`,
}));
const rpc = vi.fn();
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ rpc }) }));

import { SolvyAiSettingsCard, BUTTON_EVENT, BUTTON_HIDDEN_KEY, readButtonHidden } from "@/components/solvyai/SolvyAiSettings";

beforeEach(() => {
  rpc.mockReset();
  try { localStorage.clear(); } catch { /* none */ }
});

describe("Configurações › SolvyAI (web)", () => {
  it("the button switch is per browser and tells the ✦ button at once", () => {
    rpc.mockResolvedValue({ data: null, error: { message: "function missing" } });
    const seen: boolean[] = [];
    window.addEventListener(BUTTON_EVENT, (e) => seen.push((e as CustomEvent<{ hidden: boolean }>).detail.hidden));
    render(<SolvyAiSettingsCard prefix="/pt-BR" />);
    const sw = screen.getByRole("switch", { name: "solvyaiSettings.buttonLabel" });
    expect(sw).toHaveAttribute("aria-checked", "true");
    fireEvent.click(sw);
    expect(localStorage.getItem(BUTTON_HIDDEN_KEY)).toBe("1");
    expect(readButtonHidden()).toBe(true);
    expect(seen).toEqual([true]);
    fireEvent.click(sw);
    expect(readButtonHidden()).toBe(false);
  });

  it("before migration 115 (the RPC is missing) the actions switch isn't shown", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "Could not find the function" } });
    render(<SolvyAiSettingsCard prefix="" />);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("assistant_usage_today"));
    expect(screen.queryByRole("switch", { name: "solvyaiSettings.actionsLabel" })).not.toBeInTheDocument();
  });

  it("turning actions on asks once; Cancel saves nothing, Turn on saves", async () => {
    rpc.mockImplementation(async (fn: string) => (fn === "assistant_usage_today" ? { data: { used: 0, limit: 20, actions: false }, error: null } : { data: true, error: null }));
    render(<SolvyAiSettingsCard prefix="/pt-BR" />);
    const sw = await screen.findByRole("switch", { name: "solvyaiSettings.actionsLabel" });
    expect(sw).toHaveAttribute("aria-checked", "false");
    // The text says what's sent and links the Privacy Policy.
    expect(screen.getByText(/solvyaiSettings\.actionsText/)).toBeInTheDocument();
    expect(screen.getByText("solvyaiSettings.privacy").closest("a")).toHaveAttribute("href", "/pt-BR/privacy");
    fireEvent.click(sw);
    expect(screen.getByRole("alertdialog")).toHaveTextContent("solvyaiSettings.confirmTitle");
    fireEvent.click(screen.getByText("solvyaiSettings.cancel"));
    expect(rpc).not.toHaveBeenCalledWith("set_solvyai_actions", expect.anything());
    fireEvent.click(sw);
    fireEvent.click(screen.getByText("solvyaiSettings.turnOn"));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("set_solvyai_actions", { p_enabled: true }));
    await waitFor(() => expect(sw).toHaveAttribute("aria-checked", "true"));
  });

  it("turning actions off doesn't ask", async () => {
    rpc.mockImplementation(async (fn: string) => (fn === "assistant_usage_today" ? { data: { actions: true }, error: null } : { data: false, error: null }));
    render(<SolvyAiSettingsCard prefix="" />);
    const sw = await screen.findByRole("switch", { name: "solvyaiSettings.actionsLabel" });
    fireEvent.click(sw);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("set_solvyai_actions", { p_enabled: false }));
  });

  it("a failed save says so and keeps the old state", async () => {
    rpc.mockImplementation(async (fn: string) => (fn === "assistant_usage_today" ? { data: { actions: true }, error: null } : { data: null, error: { message: "x" } }));
    render(<SolvyAiSettingsCard prefix="" />);
    const sw = await screen.findByRole("switch", { name: "solvyaiSettings.actionsLabel" });
    fireEvent.click(sw);
    await waitFor(() => expect(screen.getByText("solvyaiSettings.error")).toBeInTheDocument());
    expect(sw).toHaveAttribute("aria-checked", "true");
  });
});
