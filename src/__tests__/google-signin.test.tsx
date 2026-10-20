import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// Sign in with Google, web phase 1 (specs/google-sign-in.md; migration 232):
// the button only while the public switch google_signin is on; the country
// and role ride our own callback URL (no cookie); scopes openid/email/profile;
// signup_google_start {source} (consent-gated by track).

const h = vi.hoisted(() => ({
  flags: [] as { key: string; enabled: boolean }[],
  oauth: vi.fn(async (_a: unknown) => ({ error: null as unknown })),
  track: vi.fn(),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    rpc: async (fn: string) => (fn === "get_public_flags" ? { data: h.flags, error: null } : { data: null, error: null }),
    auth: { signInWithOAuth: h.oauth },
  }),
}));
vi.mock("@/lib/track", () => ({ track: h.track }));

import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { GOOGLE_SCOPES, googleRedirectTo, parseGoogleRole } from "@/lib/googleSignIn";

const show = (props: Partial<React.ComponentProps<typeof GoogleSignInButton>> = {}) =>
  render(
    <NextIntlClientProvider locale="pt-BR" messages={pt}>
      <GoogleSignInButton locale="pt-BR" source="signup" {...props} />
    </NextIntlClientProvider>,
  );

describe("googleRedirectTo", () => {
  it("our callback with the language, the source, and only a valid country / role", () => {
    const u = new URL(googleRedirectTo("https://www.solvymed.com", { locale: "th", country: "TH", role: "patient", source: "signup" }));
    expect(u.origin + u.pathname).toBe("https://www.solvymed.com/api/auth/callback");
    expect(Object.fromEntries(u.searchParams)).toEqual({ locale: "th", google: "signup", c: "TH", role: "patient" });
    const bare = new URL(googleRedirectTo("https://x.test", { locale: "en", country: null, role: null, source: "login" }));
    expect(Object.fromEntries(bare.searchParams)).toEqual({ locale: "en", google: "login" });
    expect(parseGoogleRole("secretary")).toBeNull();
  });
});

describe("GoogleSignInButton", () => {
  beforeEach(() => {
    h.flags = [];
    h.oauth.mockReset();
    h.oauth.mockResolvedValue({ error: null });
    h.track.mockReset();
  });

  it("nothing while google_signin is off (or missing)", async () => {
    h.flags = [{ key: "google_signin", enabled: false }];
    const { container } = show();
    await new Promise((r) => setTimeout(r, 20));
    expect(container.innerHTML).toBe("");
  });

  it("on: the white Google button + the divider; a click starts OAuth with our callback and the scopes", async () => {
    h.flags = [{ key: "google_signin", enabled: true }];
    show({ country: "BR", role: "professional" });
    const btn = await screen.findByTestId("google-signin");
    expect(btn).toHaveTextContent(pt.auth.google.continue);
    expect(btn).toHaveAttribute("data-source", "signup");
    expect(screen.getByText(pt.auth.google.or)).toBeInTheDocument();
    fireEvent.click(btn);
    await waitFor(() => expect(h.oauth).toHaveBeenCalled());
    const arg = h.oauth.mock.calls[0][0] as { provider: string; options: { redirectTo: string; scopes: string; queryParams: Record<string, string> } };
    expect(arg.provider).toBe("google");
    expect(arg.options.scopes).toBe(GOOGLE_SCOPES);
    expect(arg.options.scopes).toBe("openid email profile");
    expect(arg.options.queryParams).toEqual({ prompt: "select_account" });
    const to = new URL(arg.options.redirectTo);
    expect(to.pathname).toBe("/api/auth/callback");
    expect(to.searchParams.get("c")).toBe("BR");
    expect(to.searchParams.get("role")).toBe("professional");
    expect(h.track).toHaveBeenCalledWith("signup_google_start", { source: "signup" });
  });

  it("?google_test=1 shows it with the switch off (the tester's window); nothing else does", async () => {
    h.flags = [{ key: "google_signin", enabled: false }];
    window.history.replaceState(null, "", "/pt-BR/auth/signup?google_test=1");
    show();
    expect(await screen.findByTestId("google-signin")).toBeInTheDocument();
    window.history.replaceState(null, "", "/pt-BR/auth/signup?google_test=0");
    const { container } = render(<NextIntlClientProvider locale="pt-BR" messages={pt}><GoogleSignInButton locale="pt-BR" source="login" /></NextIntlClientProvider>);
    await new Promise((r) => setTimeout(r, 20));
    expect(container.innerHTML).toBe("");
    window.history.replaceState(null, "", "/");
  });

  it("an OAuth error: says so, the button works again", async () => {
    h.flags = [{ key: "google_signin", enabled: true }];
    h.oauth.mockResolvedValue({ error: { message: "x" } });
    show({ source: "login" });
    fireEvent.click(await screen.findByTestId("google-signin"));
    await screen.findByText(pt.auth.google.failed);
    expect(screen.getByTestId("google-signin")).not.toBeDisabled();
  });
});
