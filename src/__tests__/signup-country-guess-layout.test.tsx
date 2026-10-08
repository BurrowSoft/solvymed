import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// country-preselect: the signup layout works out the step's suggestion on
// the server from this request (cookie, Accept-Language, Vercel IP
// country) and hands it to the page; nothing is written.

const req = vi.hoisted(() => ({ headers: new Headers(), cookie: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  headers: async () => req.headers,
  cookies: async () => ({ get: (name: string) => (name === "solvymed_signup_country" && req.cookie ? { value: req.cookie } : undefined) }),
}));

import Layout from "@/app/[locale]/(site)/auth/signup/layout";
import { useCountryGuess } from "@/app/[locale]/(site)/auth/signup/CountryGuess";

function Probe() {
  return <p>guess:{useCountryGuess() ?? "none"}</p>;
}

async function guessFor(h: Record<string, string>, cookie?: string) {
  req.headers = new Headers(h);
  req.cookie = cookie;
  const { unmount } = render(await Layout({ children: <Probe /> }));
  const text = screen.getByText(/^guess:/).textContent;
  unmount();
  return text;
}

describe("signup layout: the country step's suggestion", () => {
  it("browser language, then the IP country, then none", async () => {
    expect(await guessFor({ "accept-language": "en-US,en;q=0.9,pt-BR;q=0.8", "x-vercel-ip-country": "TH" })).toBe("guess:BR");
    expect(await guessFor({ "accept-language": "en-US", "x-vercel-ip-country": "TH" })).toBe("guess:TH");
    expect(await guessFor({ "accept-language": "pt", "x-vercel-ip-country": "PT" })).toBe("guess:none");
    expect(await guessFor({})).toBe("guess:none");
  });

  it("a country already tapped in this browser is never replaced by a guess", async () => {
    expect(await guessFor({ "accept-language": "pt-BR", "x-vercel-ip-country": "BR" }, "TH")).toBe("guess:TH");
  });
});
