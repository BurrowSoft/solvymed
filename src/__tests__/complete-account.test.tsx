import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legalVersions";

// "Complete your account" (232): only for a pending Google account; the role,
// the practice country (BR/TH, explicit; with Change), the name from Google,
// the Terms + Privacy checkbox; complete_google_signup with the page's current
// versions; then the same post-sign-up step as an e-mail confirmation.

const h = vi.hoisted(() => ({
  params: new URLSearchParams(),
  user: { id: "g1", email: "dra.google@example.invalid", user_metadata: { full_name: "Dra Google" } } as { id: string; email?: string; user_metadata: Record<string, unknown> } | null,
  pending: true,
  // B4: the opening check fails ("error": the RPC answers an error; "throw": no connection).
  pendingFail: null as null | "error" | "throw",
  rpc: vi.fn(),
  refresh: vi.fn(async () => ({ data: {}, error: null })),
  track: vi.fn(),
  signOut: vi.fn(async () => ({ error: null })),
}));
vi.mock("next/navigation", async (orig) => ({
  ...(await orig<typeof import("next/navigation")>()),
  useParams: () => ({ locale: "pt-BR" }),
  useSearchParams: () => h.params,
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: h.user } }), refreshSession: h.refresh, signOut: h.signOut },
    rpc: async (fn: string, args?: unknown) => {
      if (fn !== "signup_onboarding_is_pending") return h.rpc(fn, args);
      if (h.pendingFail === "throw") throw new TypeError("Failed to fetch");
      return h.pendingFail === "error" ? { data: null, error: { message: "upstream" } } : { data: h.pending, error: null };
    },
  }),
}));
vi.mock("@/lib/track", () => ({ track: h.track }));

import CompleteAccountPage from "@/app/[locale]/(site)/auth/complete-account/page";

const show = (q = "") => {
  h.params = new URLSearchParams(q);
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={pt}>
      <CompleteAccountPage />
    </NextIntlClientProvider>,
  );
};

describe("Complete your account", () => {
  const replace = vi.fn();
  const assign = vi.fn();
  const original = window.location;
  beforeEach(() => {
    h.user = { id: "g1", email: "dra.google@example.invalid", user_metadata: { full_name: "Dra Google" } };
    h.signOut.mockClear();
    h.pending = true;
    h.pendingFail = null;
    h.rpc.mockReset();
    h.rpc.mockResolvedValue({ data: { status: "done" }, error: null });
    h.track.mockReset();
    replace.mockReset();
    assign.mockReset();
    Object.defineProperty(window, "location", { configurable: true, value: { ...original, replace, assign, origin: "https://www.solvymed.com" } });
    vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({ redirect: "/pt-BR/auth/professional-welcome" }) })));
  });
  afterEach(() => {
    Object.defineProperty(window, "location", { configurable: true, value: original });
    vi.unstubAllGlobals();
  });

  it("not pending (completed, or another account): on to the dashboard; signed out: the login", async () => {
    h.pending = false;
    show();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/pt-BR/dashboard"));
    h.user = null;
    show();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/pt-BR/auth/login"));
  });

  it("a doctor from Thailand: the line with Change, the name from Google, the RPC with the current versions, then after-verify", async () => {
    show("c=TH&role=professional");
    expect(await screen.findByTestId("complete-country-line")).toHaveTextContent(pt.auth.signup.countryLine.TH);
    await waitFor(() => expect(screen.getByTestId("complete-name")).toHaveValue("Dra Google"));
    fireEvent.click(screen.getByTestId("complete-terms"));
    await waitFor(() => expect(screen.getByTestId("complete-submit")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("complete-submit"));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/pt-BR/auth/professional-welcome"));
    expect(h.rpc).toHaveBeenCalledWith("complete_google_signup", expect.objectContaining({
      p_role: "professional", p_country: "TH", p_full_name: "Dra Google", p_invite_code: null,
      p_privacy_version: PRIVACY_VERSION, p_terms_version: TERMS_VERSION, p_locale: "pt-BR", p_platform: "web",
    }));
    expect(h.refresh).toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith("/api/auth/after-verify", expect.objectContaining({ method: "POST" }));
    expect(h.track).toHaveBeenCalledWith("signup_complete_submitted", { role: "professional" });
  });

  it("no country: the two countries; submitting without one says so; Change brings them back", async () => {
    show();
    await screen.findByTestId("complete-country-BR");
    fireEvent.click(screen.getByTestId("complete-terms"));
    await waitFor(() => expect(screen.getByTestId("complete-submit")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("complete-submit"));
    expect(await screen.findByTestId("complete-error-country")).toHaveTextContent(pt.auth.completeAccount.countryRequired);
    // F6: the first missing field is focused.
    expect(document.activeElement).toBe(screen.getByTestId("complete-country-BR"));
    fireEvent.click(screen.getByTestId("complete-country-BR"));
    fireEvent.click(screen.getByTestId("complete-country-change"));
    expect(screen.getByTestId("complete-country-TH")).toBeInTheDocument();
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("a patient: the invite code is required; then sent upper-cased by the RPC's rules", async () => {
    show("role=patient");
    await screen.findByTestId("complete-invite-code");
    fireEvent.click(screen.getByTestId("complete-terms"));
    await waitFor(() => expect(screen.getByTestId("complete-submit")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("complete-submit"));
    expect(await screen.findByTestId("complete-error-code")).toHaveTextContent(pt.auth.signup.inviteCodeRequired);
    expect(document.activeElement).toBe(screen.getByTestId("complete-invite-code"));
    expect(screen.getByTestId("complete-invite-code")).toHaveAttribute("aria-invalid", "true");
    fireEvent.change(screen.getByTestId("complete-invite-code"), { target: { value: " abc123 " } });
    fireEvent.click(screen.getByTestId("complete-submit"));
    await waitFor(() => expect(h.rpc).toHaveBeenCalledWith("complete_google_signup", expect.objectContaining({
      p_role: "patient", p_country: null, p_invite_code: "abc123",
    })));
  });

  it("the Terms + Privacy checkbox is required; an RPC refusal shows its text and stays", async () => {
    show("c=BR");
    await waitFor(() => expect(screen.getByTestId("complete-submit")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("complete-submit"));
    expect(await screen.findByTestId("complete-error-consent")).toHaveTextContent(pt.auth.completeAccount.consentRequired);
    h.rpc.mockResolvedValue({ data: null, error: { message: "consent_required", code: "P0001" } });
    fireEvent.click(screen.getByTestId("complete-terms"));
    fireEvent.click(screen.getByTestId("complete-submit"));
    await waitFor(() => expect(h.rpc).toHaveBeenCalled());
    expect(await screen.findByTestId("complete-error-consent")).toHaveTextContent(pt.auth.completeAccount.consentRequired);
    expect(assign).not.toHaveBeenCalled();
  });
  it.each(["error", "throw"] as const)("B4: the opening check fails (%s) → says so with Try again, never a dead spinner nor the dashboard", async (fail) => {
    h.pendingFail = fail;
    show();
    expect(await screen.findByTestId("complete-load-failed")).toHaveTextContent(pt.auth.completeAccount.loadError);
    expect(screen.queryByTestId("complete-submit")).toBeNull();
    expect(replace).not.toHaveBeenCalled();
    expect(h.track).toHaveBeenCalledWith("complete_account_error", { code: "load_failed" });
    h.pendingFail = null;
    fireEvent.click(screen.getByTestId("complete-retry"));
    await waitFor(() => expect(screen.getByTestId("complete-submit")).toBeEnabled());
    expect(h.track).toHaveBeenCalledWith("complete_account_view");
  });

  it("B4: already completed elsewhere (not_pending) → the dashboard, not an error", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: "not_pending" } });
    show("c=BR");
    await waitFor(() => expect(screen.getByTestId("complete-submit")).toBeEnabled());
    fireEvent.click(screen.getByTestId("complete-terms"));
    fireEvent.click(screen.getByTestId("complete-submit"));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/pt-BR/dashboard"));
    expect(screen.queryByTestId("complete-error")).toBeNull();
  });

  it("B4: a refusal is counted by its code", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: "invite_code_required" } });
    show("role=patient");
    await waitFor(() => expect(screen.getByTestId("complete-submit")).toBeEnabled());
    fireEvent.change(screen.getByTestId("complete-invite-code"), { target: { value: "X" } });
    fireEvent.click(screen.getByTestId("complete-terms"));
    fireEvent.click(screen.getByTestId("complete-submit"));
    await waitFor(() => expect(h.track).toHaveBeenCalledWith("complete_account_error", { code: "invite_code_required" }));
  });

  it("F1: the Google account being completed, with 'Usar outra conta' → signed out, to the login", async () => {
    show("c=BR");
    const line = await screen.findByTestId("complete-account-line");
    expect(line).toHaveTextContent("Conta Google: dra.google@example.invalid");
    fireEvent.click(screen.getByTestId("complete-use-another"));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/pt-BR/auth/login"));
    expect(h.signOut).toHaveBeenCalledTimes(1);
    expect(h.track).toHaveBeenCalledWith("complete_account_switch");
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("F2: a patient without a code: 'Não tenho código' explains how to get in, with the same way out", async () => {
    show("role=patient");
    await screen.findByTestId("complete-invite-code");
    expect(screen.queryByTestId("complete-no-code-help")).toBeNull();
    fireEvent.click(screen.getByTestId("complete-no-code"));
    expect(screen.getByTestId("complete-no-code-help")).toHaveTextContent(pt.auth.completeAccount.noCodeText);
    expect(screen.getByTestId("complete-no-code")).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByTestId("complete-no-code-use-another"));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/pt-BR/auth/login"));
    expect(h.signOut).toHaveBeenCalled();
  });

  it("F6: the RPC's field refusals land next to their field; other errors stay at the bottom", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: "unsupported_country", code: "P0001" } });
    show("c=TH");
    await waitFor(() => expect(screen.getByTestId("complete-submit")).toBeEnabled());
    fireEvent.click(screen.getByTestId("complete-terms"));
    fireEvent.click(screen.getByTestId("complete-submit"));
    expect(await screen.findByTestId("complete-error-country")).toHaveTextContent(pt.auth.completeAccount.countryRequired);
    expect(screen.getByTestId("complete-country-BR")).toBeInTheDocument();
    expect(screen.queryByTestId("complete-error")).toBeNull();
    h.rpc.mockResolvedValue({ data: null, error: { message: "boom", code: "XX000" } });
    fireEvent.click(screen.getByTestId("complete-country-TH"));
    expect(screen.queryByTestId("complete-error-country")).toBeNull();
    fireEvent.click(screen.getByTestId("complete-submit"));
    expect(await screen.findByTestId("complete-error")).toHaveTextContent(pt.auth.errors.generic);
  });
});
