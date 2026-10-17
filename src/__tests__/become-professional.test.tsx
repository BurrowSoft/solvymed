import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// "Sou profissional de saúde" (Vitor, 10-18; the web twin of the app's, 13):
// a confirm step with the practice's country, become_professional (231),
// a session refresh, then the professional welcome. No default country.

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  refresh: vi.fn(async () => ({ data: {}, error: null })),
  user: { user_metadata: {} as Record<string, unknown> },
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    rpc: h.rpc,
    auth: { refreshSession: h.refresh, getUser: async () => ({ data: { user: h.user } }) },
  }),
}));

import { BecomeProfessional } from "@/components/BecomeProfessional";

const show = () =>
  render(
    <NextIntlClientProvider locale="pt-BR" messages={pt}>
      <BecomeProfessional locale="pt-BR" />
    </NextIntlClientProvider>,
  );

describe("BecomeProfessional", () => {
  const assign = vi.fn();
  const original = window.location;
  beforeEach(() => {
    h.rpc.mockReset();
    h.refresh.mockClear();
    h.user = { user_metadata: {} };
    assign.mockReset();
    document.cookie = "solvymed_signup_country=; path=/; max-age=0";
    Object.defineProperty(window, "location", { configurable: true, value: { ...original, assign } });
  });
  afterEach(() => Object.defineProperty(window, "location", { configurable: true, value: original }));

  it("the link opens the confirm step; no country chosen → Mudar conta is disabled", () => {
    show();
    fireEvent.click(screen.getByText(pt.auth.becomeProfessional.link));
    expect(screen.getByText(pt.auth.becomeProfessional.body)).toBeInTheDocument();
    expect(screen.getByTestId("become-professional-switch")).toBeDisabled();
  });

  it("the sign-up's country is preselected; Mudar conta switches, refreshes, then the welcome", async () => {
    document.cookie = "solvymed_signup_country=TH; path=/";
    h.rpc.mockResolvedValue({ data: { country: "TH" }, error: null });
    show();
    fireEvent.click(screen.getByText(pt.auth.becomeProfessional.link));
    await waitFor(() => expect(screen.getByTestId("become-professional-switch")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("become-professional-switch"));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/pt-BR/auth/professional-welcome"));
    expect(h.rpc).toHaveBeenCalledWith("become_professional", expect.objectContaining({ p_country: "TH" }));
    expect(h.refresh).toHaveBeenCalled();
  });

  it("the account's own country when there's no sign-up choice", async () => {
    h.user = { user_metadata: { country: "BR" } };
    h.rpc.mockResolvedValue({ data: { country: "BR" }, error: null });
    show();
    fireEvent.click(screen.getByText(pt.auth.becomeProfessional.link));
    await waitFor(() => expect(screen.getByTestId("become-professional-switch")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("become-professional-switch"));
    await waitFor(() => expect(h.rpc).toHaveBeenCalledWith("become_professional", expect.objectContaining({ p_country: "BR" })));
  });

  it("linked to a clinic: says so, stays, no refresh", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: "patient_linked", code: "P0001" } });
    show();
    fireEvent.click(screen.getByText(pt.auth.becomeProfessional.link));
    fireEvent.click(screen.getByLabelText(/Brasil/));
    fireEvent.click(screen.getByTestId("become-professional-switch"));
    await screen.findByText(pt.auth.becomeProfessional.errorLinked);
    expect(h.refresh).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });

  it("already_professional (a double tap): refresh and on to the welcome (13)", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: "already_professional", code: "P0001" } });
    show();
    fireEvent.click(screen.getByText(pt.auth.becomeProfessional.link));
    fireEvent.click(screen.getByLabelText(/Brasil/));
    fireEvent.click(screen.getByTestId("become-professional-switch"));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/pt-BR/auth/professional-welcome"));
    expect(h.refresh).toHaveBeenCalled();
  });

  it("other refusals: the generic text", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: "is_secretary", code: "P0001" } });
    show();
    fireEvent.click(screen.getByText(pt.auth.becomeProfessional.link));
    fireEvent.click(screen.getByLabelText(/Brasil/));
    fireEvent.click(screen.getByTestId("become-professional-switch"));
    await screen.findByText(pt.auth.errors.generic);
  });

  it("Cancelar closes the step", () => {
    show();
    fireEvent.click(screen.getByText(pt.auth.becomeProfessional.link));
    fireEvent.click(screen.getByText(pt.auth.becomeProfessional.cancel));
    expect(screen.queryByTestId("become-professional-confirm")).toBeNull();
  });
});
