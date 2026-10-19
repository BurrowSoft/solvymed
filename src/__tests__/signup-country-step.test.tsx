import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// Country first (Vitor, 2026-10-01): the signup starts with "Where are you?"
// (Brasil / ประเทศไทย + "Use SolvyMed in English"); the choice comes back as
// ?c= in its language; ← returns to the step. Invite and join-link
// signups skip it.

const h = vi.hoisted(() => ({ params: new URLSearchParams(), push: vi.fn() }));
vi.mock("next/navigation", async (orig) => ({
  ...(await orig<typeof import("next/navigation")>()),
  useParams: () => ({ locale: "pt-BR" }),
  useRouter: () => ({ push: h.push, replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => h.params,
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ rpc: async () => ({ data: null, error: null }) }) }));

import SignupPage from "@/app/[locale]/(site)/auth/signup/page";
import { CountryGuessProvider } from "@/app/[locale]/(site)/auth/signup/CountryGuess";
import type { CountryChoice } from "@/lib/signupCountry";

function show(query: string, guess: CountryChoice | null = null) {
  h.params = new URLSearchParams(query);
  h.push.mockReset();
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={pt}>
      <CountryGuessProvider guess={guess}>
        <SignupPage />
      </CountryGuessProvider>
    </NextIntlClientProvider>,
  );
}

const stepButtons = () => screen.getAllByRole("link").filter((b) => /Brasil|ประเทศไทย/.test(b.textContent ?? ""));

describe("funnel F2: the country from the visitor's own path", () => {
  it("/pt-BR opened by the visitor: the form, with \"Consultório no Brasil · Alterar\" under the title", () => {
    const { unmount } = show("");
    expect(screen.queryByText("Onde você está? · คุณอยู่ที่ไหน? · Where are you?")).toBeNull();
    expect(screen.getByTestId("signup-country-line")).toHaveTextContent(`${pt.auth.signup.countryLine.BR} · ${pt.auth.signup.countryChange}`);
    expect(screen.getByTestId("signup-country-change")).toHaveAttribute("href", "/pt-BR/auth/signup?step=country");
    unmount();
  });

  it("a language the site picked (?lr=1) or Alterar (?step=country): the step", () => {
    for (const q of ["lr=1", "step=country"]) {
      const { unmount } = show(q);
      expect(screen.getByText("Onde você está? · คุณอยู่ที่ไหน? · Where are you?")).toBeInTheDocument();
      unmount();
    }
  });

  it("Paciente hides the line; Profissional de saúde shows it again", () => {
    const { unmount } = show("role=patient");
    expect(screen.queryByTestId("signup-country-line")).toBeNull();
    fireEvent.click(screen.getByText(pt.auth.signup.roleDoctor));
    expect(screen.getByTestId("signup-country-line")).toBeInTheDocument();
    unmount();
  });
});

describe("signup: country first", () => {
  it("starts with the two countries; a tap continues in that country's language", () => {
    const { unmount } = show("lr=1");
    expect(screen.getByText("Onde você está? · คุณอยู่ที่ไหน? · Where are you?")).toBeInTheDocument();
    expect(screen.queryByLabelText(/e-mail/i)).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: /ประเทศไทย/ }));
    expect(h.push).toHaveBeenCalledWith("/th/auth/signup?c=TH");
    unmount();
  });

  it("\"Use SolvyMed in English\" continues in English", () => {
    const { unmount } = show("lr=1");
    fireEvent.click(screen.getByLabelText("Use SolvyMed in English"));
    fireEvent.click(screen.getByRole("link", { name: /Brasil/ }));
    expect(h.push).toHaveBeenCalledWith("/auth/signup?c=BR");
    unmount();
  });

  it("with a country: the form, and ← back to the step (no country field)", () => {
    const { unmount } = show("c=BR");
    expect(screen.queryByText("Onde você está? · คุณอยู่ที่ไหน? · Where are you?")).toBeNull();
    const back = screen.getByRole("link", { name: pt.auth.signup.backToCountry });
    expect(back).toHaveAttribute("href", "/pt-BR/auth/signup?step=country");
    expect(document.querySelector("select#signup-country")).toBeNull();
    unmount();
  });

  it("a suggested country goes first in the primary style; nothing is chosen or stored until a tap", () => {
    document.cookie = "solvymed_signup_country=; path=/; max-age=0";
    const { unmount } = show("lr=1", "TH");
    const [first, second] = stepButtons();
    expect(first).toHaveTextContent("ประเทศไทย");
    expect(first).toHaveAttribute("data-suggested", "true");
    expect(first.className).toContain("bg-teal-600");
    expect(second).toHaveTextContent("Brasil");
    expect(second).not.toHaveAttribute("data-suggested");
    expect(second.className).toContain("bg-white");
    expect(h.push).not.toHaveBeenCalled();
    expect(document.cookie).not.toContain("solvymed_signup_country=TH");
    // The other country is still one tap.
    fireEvent.click(second);
    expect(h.push).toHaveBeenCalledWith("/pt-BR/auth/signup?c=BR");
    expect(document.cookie).toContain("solvymed_signup_country=BR");
    unmount();
  });

  it("no suggestion: as before, Brasil first and both outlined", () => {
    const { unmount } = show("lr=1");
    const buttons = stepButtons();
    expect(buttons.map((b) => b.textContent)).toEqual(["🇧🇷Brasil", "🇹🇭ประเทศไทย"]);
    expect(buttons.every((b) => !b.hasAttribute("data-suggested") && b.className.includes("bg-white"))).toBe(true);
    unmount();
  });

  it("a join link skips the step and offers only the English switch", () => {
    const { unmount } = show("join=ABC123");
    expect(screen.queryByText("Onde você está? · คุณอยู่ที่ไหน? · Where are you?")).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "Use SolvyMed in English" }));
    expect(h.push).toHaveBeenCalledWith("/en/auth/signup?join=ABC123&from=pt-BR");
    unmount();
  });
});

// Before hydration (01: ad traffic on slow mobile lines). A tap before the
// script arrives used to do nothing; the server HTML is what can be tapped
// then, so these read it (renderToString: no effects, no handlers).
describe("signup before hydration", () => {
  const html = (query: string) => {
    h.params = new URLSearchParams(query);
    const div = document.createElement("div");
    div.innerHTML = renderToString(
      <NextIntlClientProvider locale="pt-BR" messages={pt}>
        <CountryGuessProvider guess={null}>
          <SignupPage />
        </CountryGuessProvider>
      </NextIntlClientProvider>,
    );
    return div;
  };

  it("each country is a link to its step, in its language", () => {
    const hrefs = [...html("lr=1").querySelectorAll("a")].filter((a) => /Brasil|ประเทศไทย/.test(a.textContent ?? "")).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/pt-BR/auth/signup?c=BR", "/th/auth/signup?c=TH"]);
  });

  it("the role cards are links to ?role=…, and ?role=patient starts as patient", () => {
    const form = html("c=BR");
    const cards = [...form.querySelectorAll('a[role="button"]')];
    expect(cards.map((a) => a.getAttribute("href"))).toEqual(["?c=BR&role=professional", "?c=BR&role=patient"]);
    expect(cards.map((a) => a.getAttribute("aria-pressed"))).toEqual(["true", "false"]);
    const asPatient = [...html("c=BR&role=patient").querySelectorAll('a[role="button"]')];
    expect(asPatient.map((a) => a.getAttribute("aria-pressed"))).toEqual(["false", "true"]);
  });

  it("the join link's English switch is a link", () => {
    const sw = html("join=ABC123").querySelector('[data-testid="signup-english-switch"]');
    expect(sw?.tagName).toBe("A");
    expect(sw).toHaveAttribute("href", "/en/auth/signup?join=ABC123&from=pt-BR");
  });

  it("the submit waits for the script (a native POST lost what was typed)", () => {
    const submit = html("c=BR").querySelector('button[type="submit"]');
    expect(submit).toHaveAttribute("disabled");
    // It says why (01): "Carregando…" with the spinner, until the script is in.
    expect(submit).toHaveTextContent(pt.auth.signup.loading);
    // Credential fields stay without name= (no GET leak; feedback rule).
    expect(html("c=BR").querySelector("input[name]")).toBeNull();
  });

  it("the join English switch also toggles with Space (b9; a11y)", () => {
    const { unmount } = show("join=ABC123");
    fireEvent.keyDown(screen.getByRole("checkbox", { name: "Use SolvyMed in English" }), { key: " " });
    expect(h.push).toHaveBeenCalledWith("/en/auth/signup?join=ABC123&from=pt-BR");
    unmount();
  });

  it("after hydration the submit is enabled", () => {
    const { unmount } = show("c=BR");
    expect(screen.getByRole("button", { name: pt.auth.signup.submit })).not.toBeDisabled();
    unmount();
  });

  it("a country reached by its link (?c=) is saved in the cookie, as a tap did", () => {
    document.cookie = "solvymed_signup_country=; path=/; max-age=0";
    const { unmount } = show("c=TH");
    expect(document.cookie).toContain("solvymed_signup_country=TH");
    unmount();
  });
});
