import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// b9 on #588 (B1): /auth/login → the NEXT_LOCALE redirect → /pt-BR/auth/login?lr=1
// → "Criar conta" landed on /pt-BR/auth/signup without lr, i.e. as BR. The
// login's link now carries lr=1 (from its URL or the visit's flag, noted on
// every page by LocaleArrival), so the signup asks for the country.

const h = vi.hoisted(() => ({ params: new URLSearchParams() }));
vi.mock("next/navigation", async (orig) => ({
  ...(await orig<typeof import("next/navigation")>()),
  useParams: () => ({ locale: "pt-BR" }),
  usePathname: () => "/pt-BR/auth/login",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => h.params,
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: {}, rpc: async () => ({ data: null, error: null }) }) }));

import LoginPage from "@/app/[locale]/(site)/auth/login/page";
import { LocaleArrival } from "@/components/LocaleArrival";
import { autoLocaleArrival } from "@/lib/localeArrival";
import { pathCountry } from "@/lib/signupCountry";

const signupHref = (query: string) => {
  h.params = new URLSearchParams(query);
  const { unmount } = render(
    <NextIntlClientProvider locale="pt-BR" messages={pt}>
      <LoginPage />
    </NextIntlClientProvider>,
  );
  const href = screen.getByTestId("login-signup").getAttribute("href");
  unmount();
  return href;
};

describe("login → Criar conta keeps a site-picked language", () => {
  it("opened by the visitor: the plain signup (its path gives the country)", () => {
    expect(signupHref("")).toBe("/pt-BR/auth/signup");
  });

  it("?lr=1 on the login itself: forwarded", () => {
    expect(signupHref("lr=1")).toBe("/pt-BR/auth/signup?lr=1");
  });

  it("LocaleArrival notes ?lr=1 on any page; the flag then forwards it and stops the path country", () => {
    window.history.replaceState(null, "", "/pt-BR/auth/login?lr=1");
    render(<LocaleArrival />);
    expect(autoLocaleArrival()).toBe(true);
    window.history.replaceState(null, "", "/pt-BR/auth/login");
    expect(signupHref("")).toBe("/pt-BR/auth/signup?lr=1");
    expect(pathCountry("pt-BR", new URLSearchParams(), autoLocaleArrival())).toBeNull();
  });
});
