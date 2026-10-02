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
  sub: null as null | Record<string, unknown>,
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
    rpc: (name: string, args?: unknown) =>
      name === "get_effective_subscription" ? Promise.resolve({ data: h.sub ? [h.sub] : [], error: null }) : h.rpc(name, args),
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

  it("a doctor whose trial ended goes straight to the paywall, never Home (build 25)", async () => {
    h.signIn.mockReset().mockResolvedValue({ data: { user: { id: "u-1", user_metadata: {} } }, error: null });
    h.push.mockReset();
    h.sub = { subscription_status: "trial", trial_ends_at: "2020-01-01T00:00:00Z", current_period_end: null, subscription_provider: null, subscription_id: null };
    const button = fill();
    fireEvent.submit(button.form!);
    await waitFor(() => expect(h.push).toHaveBeenCalledWith("/pt-BR/subscribe"));
    h.sub = null;
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

// e7: a password manager's autofill can fill the fields without React seeing
// it. The sign-in must use what's in the fields, and the email must not be
// emptied by the re-render on submit.
describe("login with autofilled fields", () => {
  it("signs in with the fields' own values and keeps them shown", async () => {
    h.role = { role: "professional" };
    h.signIn.mockReset().mockResolvedValue({ data: { user: { id: "u-1", user_metadata: {} } }, error: null });
    h.push.mockReset();
    render(
      <NextIntlClientProvider locale="pt-BR" messages={pt}>
        <LoginPage />
      </NextIntlClientProvider>,
    );
    const email = document.querySelector("input[type=email]") as HTMLInputElement;
    const password = document.querySelector("input[type=password]") as HTMLInputElement;
    // Set the DOM values directly, with no input event: React's state stays "".
    email.value = "auto@fill.co";
    password.value = "filled-by-manager";
    fireEvent.submit(email.form!);
    await waitFor(() => expect(h.signIn).toHaveBeenCalledTimes(1));
    expect(h.signIn.mock.calls[0][0]).toMatchObject({ email: "auto@fill.co", password: "filled-by-manager" });
    expect(email.value).toBe("auto@fill.co");
    await waitFor(() => expect(h.push).toHaveBeenCalledWith("/pt-BR/dashboard"));
  });

  // 3e on #332: an email React never saw was emptied by ANY re-render before
  // submit (typing the password, an error), not just by the submit.
  it("an autofilled email survives typing the password and a failed try", async () => {
    h.role = { role: "professional" };
    h.signIn.mockReset().mockResolvedValue({ data: { user: null }, error: { message: "Invalid login credentials", status: 400 } });
    render(
      <NextIntlClientProvider locale="pt-BR" messages={pt}>
        <LoginPage />
      </NextIntlClientProvider>,
    );
    const email = document.querySelector("input[type=email]") as HTMLInputElement;
    const password = document.querySelector("input[type=password]") as HTMLInputElement;
    email.value = "auto@fill.co"; // autofill: no input event
    fireEvent.change(password, { target: { value: "typed" } }); // the user types the password
    expect(email.value).toBe("auto@fill.co");
    fireEvent.submit(email.form!);
    await waitFor(() => expect(document.querySelector(".error-banner")).not.toBeNull());
    expect(h.signIn.mock.calls[0][0]).toMatchObject({ email: "auto@fill.co", password: "typed" });
    expect(email.value).toBe("auto@fill.co"); // kept after the error re-render
  });
});

// 3e on #332: a click before hydration is the browser's own GET; named
// fields would put the password in the URL. The fields have no names.
describe("login fields carry no name", () => {
  it("a native (pre-hydration) submit would send neither the email nor the password", () => {
    render(
      <NextIntlClientProvider locale="pt-BR" messages={pt}>
        <LoginPage />
      </NextIntlClientProvider>,
    );
    const form = (document.querySelector("input[type=email]") as HTMLInputElement).form!;
    (document.querySelector("input[type=email]") as HTMLInputElement).value = "a@b.co";
    (document.querySelector("input[type=password]") as HTMLInputElement).value = "secret123";
    expect([...new FormData(form).keys()]).toEqual([]);
    expect(form.querySelectorAll("input[name]")).toHaveLength(0);
    // And never a GET: even an unnamed field can't reach the URL (9a).
    expect(form.method).toBe("post");
  });
});

// Vitor, build 25 item 2: Tab from the email field must reach the password,
// then "Entrar"; "Esqueceu a senha?" comes after.
describe("login tab order", () => {
  it("email → password → submit → forgot password (document order, no tabindex tricks)", () => {
    render(
      <NextIntlClientProvider locale="pt-BR" messages={pt}>
        <LoginPage />
      </NextIntlClientProvider>,
    );
    const focusable = Array.from(document.querySelectorAll("form input, form button, form a"))
      .map((el) => el.getAttribute("data-testid") ?? el.tagName);
    const order = ["login-email", "login-password", "login-submit", "login-forgot"].map((id) => focusable.indexOf(id));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(document.querySelectorAll("form [tabindex]")).toHaveLength(0);
    expect(screen.getByLabelText(pt.auth.login.email)).toHaveAttribute("type", "email");
    expect(screen.getByLabelText(pt.auth.login.password)).toHaveAttribute("type", "password");
  });
});
