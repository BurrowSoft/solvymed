import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// Funnel F3 (specs/signup-funnel-fixes.md): signup_view {step},
// signup_country {c}, signup_role {role}, signup_form_start (first focus),
// signup_error {code} (the auth error CODE only, never its message or
// anything typed). track() itself sends only with analytics consent.

const h = vi.hoisted(() => ({
  params: new URLSearchParams(),
  track: vi.fn(),
  signUp: vi.fn(),
}));
vi.mock("@/lib/track", () => ({ track: h.track }));
vi.mock("next/navigation", async (orig) => ({
  ...(await orig<typeof import("next/navigation")>()),
  useParams: () => ({ locale: "pt-BR" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => h.params,
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ rpc: async () => ({ data: null, error: null }), auth: { signUp: h.signUp } }),
}));

import SignupPage from "@/app/[locale]/(site)/auth/signup/page";
import { CountryGuessProvider } from "@/app/[locale]/(site)/auth/signup/CountryGuess";

function show(query: string) {
  h.params = new URLSearchParams(query);
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={pt}>
      <CountryGuessProvider guess={null}>
        <SignupPage />
      </CountryGuessProvider>
    </NextIntlClientProvider>,
  );
}

const events = () => h.track.mock.calls.map((c) => [c[0], c[1]]);

describe("signup funnel events", () => {
  beforeEach(() => {
    h.track.mockReset();
    h.signUp.mockReset();
  });

  it("the country step: signup_view {step: country}; a tap → signup_country {c}", () => {
    const { unmount } = show("step=country"); // the step before and after F2 (#588)
    expect(events()).toContainEqual(["signup_view", { step: "country" }]);
    fireEvent.click(screen.getByRole("link", { name: /ประเทศไทย/ }));
    expect(events()).toContainEqual(["signup_country", { c: "TH", source: "step" }]);
    unmount();
  });

  it("?c= reached without a tap here (a tap before hydration): signup_country {source: link}, once", () => {
    const { rerender, unmount } = show("c=BR");
    rerender(
      <NextIntlClientProvider locale="pt-BR" messages={pt}>
        <CountryGuessProvider guess={null}>
          <SignupPage />
        </CountryGuessProvider>
      </NextIntlClientProvider>,
    );
    expect(events().filter(([e]) => e === "signup_country")).toEqual([["signup_country", { c: "BR", source: "link" }]]);
    unmount();
  });

  it("the form: view once, role changes, first focus once", () => {
    const { unmount } = show("c=BR");
    expect(events().filter(([e]) => e === "signup_view")).toEqual([["signup_view", { step: "form" }]]);
    fireEvent.click(screen.getByText(pt.auth.signup.rolePatient));
    expect(events()).toContainEqual(["signup_role", { role: "patient" }]);
    const email = document.querySelector("#signup-email") as HTMLInputElement;
    fireEvent.focus(email);
    fireEvent.focus(document.querySelector("#signup-full-name") ?? email);
    expect(events().filter(([e]) => e === "signup_form_start")).toHaveLength(1);
    unmount();
  });

  it("an auth error: its code only, nothing typed", async () => {
    h.signUp.mockResolvedValue({ data: { user: null }, error: { code: "weak_password", message: "Password a@b.co is weak", status: 422 } });
    const { unmount } = show("c=BR");
    fireEvent.change(document.querySelector("#signup-full-name")!, { target: { value: "Dra Teste" } });
    fireEvent.change(document.querySelector("#signup-email")!, { target: { value: "e2e-f3@example.invalid" } });
    fireEvent.change(document.querySelector("#signup-password")!, { target: { value: "Secret-123456" } });
    fireEvent.change(document.querySelector("#signup-confirm-password")!, { target: { value: "Secret-123456" } });
    document.querySelectorAll<HTMLInputElement>('#signup-form input[type="checkbox"]').forEach((b) => { if (!b.checked) fireEvent.click(b); });
    fireEvent.submit(document.querySelector("#signup-form")!);
    await waitFor(() => expect(events()).toContainEqual(["signup_error", { code: "weak_password" }]));
    const sent = JSON.stringify(h.track.mock.calls);
    expect(sent).not.toContain("a@b.co");
    expect(sent).not.toContain("example.invalid");
    expect(sent).not.toContain("Dra Teste");
    unmount();
  });
});
