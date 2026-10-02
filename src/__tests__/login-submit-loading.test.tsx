import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// Vitor (1.4.0): after "Entrar" the button went back from the spinner while
// the next page loaded, so he clicked again. It now stays loading until the
// page changes; only an error resets it, and a double-click submits once.

const h = vi.hoisted(() => ({
  signIn: vi.fn(),
  push: vi.fn(),
  role: { role: "professional" } as Record<string, unknown>,
  rpc: vi.fn(async (_name: string, _args?: unknown): Promise<{ data: unknown; error: null | { message: string } }> => ({ data: [], error: null })),
}));
vi.mock("next/navigation", async (orig) => ({
  ...(await orig<typeof import("next/navigation")>()),
  useParams: () => ({ locale: "pt-BR" }),
  useRouter: () => ({ push: h.push, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { signInWithPassword: h.signIn },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: h.role }) }) }) }),
    rpc: (name: string, args?: unknown) => h.rpc(name, args),
  }),
}));

import LoginPage from "@/app/[locale]/(site)/auth/login/page";

function fill() {
  render(
    <NextIntlClientProvider locale="pt-BR" messages={pt}>
      <LoginPage />
    </NextIntlClientProvider>,
  );
  fireEvent.change(document.querySelector("input[type=email]")!, { target: { value: "a@b.co" } });
  fireEvent.change(document.querySelector("input[type=password]")!, { target: { value: "secret123" } });
  return document.querySelector("button[type=submit]") as HTMLButtonElement;
}

describe("login submit", () => {
  it("stays loading until the next page, and submits once on a double-click", async () => {
    h.signIn.mockReset().mockResolvedValue({ data: { user: { id: "u-1", user_metadata: {} } }, error: null });
    h.push.mockReset();
    const button = fill();
    fireEvent.submit(button.form!);
    fireEvent.submit(button.form!);
    await waitFor(() => expect(h.push).toHaveBeenCalledWith("/pt-BR/dashboard"));
    expect(h.signIn).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
  });

  it("an error resets the button and allows another try", async () => {
    h.signIn.mockReset().mockResolvedValue({ data: { user: null }, error: { message: "Invalid login credentials", status: 400 } });
    const button = fill();
    fireEvent.submit(button.form!);
    await waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.submit(button.form!);
    await waitFor(() => expect(h.signIn).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("/pt-BR/dashboard")).toBeNull();
  });
});


// Vitor, build 25 item 11: a patient who signed up in the APP with an invite
// code, then signs in on the website, is linked with that code, not asked
// for it again.
describe("sign-in links a stored invite code", () => {
  const patient = (code?: string) => {
    h.role = null as unknown as Record<string, unknown>; // no role row yet (an app signup)
    h.signIn.mockReset().mockResolvedValue({ data: { user: { id: "p-1", user_metadata: { role: "patient", ...(code ? { invite_code: code } : {}) } } }, error: null });
    h.push.mockReset();
  };

  it("a personal code links and goes to Minhas Consultas", async () => {
    patient("abc123");
    h.rpc.mockReset().mockResolvedValue({ data: "personal", error: null });
    const button = fill();
    fireEvent.submit(button.form!);
    await waitFor(() => expect(h.push).toHaveBeenCalledWith("/pt-BR/my-appointments"));
    expect(h.rpc).toHaveBeenCalledWith("connect_with_code", { p_code: "ABC123" });
  });

  it("a public code → waiting for the clinic", async () => {
    patient("PUB1");
    h.rpc.mockReset().mockResolvedValue({ data: "public", error: null });
    fireEvent.submit(fill().form!);
    await waitFor(() => expect(h.push).toHaveBeenCalledWith("/pt-BR/auth/pending-confirmation"));
  });

  it("refused → the invite form as before", async () => {
    patient("OLD1");
    h.rpc.mockReset().mockResolvedValue({ data: null, error: { message: "patient_archived" } });
    fireEvent.submit(fill().form!);
    await waitFor(() => expect(h.push).toHaveBeenCalledWith("/pt-BR/auth/invite-required"));
  });

  it("no code, or a role row already there (e.g. removed by a clinic): no attempt, the invite form", async () => {
    patient();
    h.rpc.mockReset();
    const { unmount } = { unmount: () => document.body.replaceChildren() };
    fireEvent.submit(fill().form!);
    await waitFor(() => expect(h.push).toHaveBeenCalledWith("/pt-BR/auth/invite-required"));
    unmount();
    patient("ABC123");
    h.role = { role: "patient", invited_by_professional_id: null, linked_patient_id: null };
    fireEvent.submit(fill().form!);
    await waitFor(() => expect(h.push).toHaveBeenCalledWith("/pt-BR/auth/invite-required"));
    expect(h.rpc).not.toHaveBeenCalledWith("connect_with_code", expect.anything());
  });
});
