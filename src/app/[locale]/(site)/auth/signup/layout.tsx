import type { ReactNode } from "react";
import { cookies, headers } from "next/headers";
import { guessSignupCountry, SIGNUP_COUNTRY_COOKIE } from "@/lib/signupCountry";
import { CountryGuessProvider } from "./CountryGuess";

// Rendered per request, as before the landing went static (the layouts now
// set the locale from the route, which would otherwise prerender this page;
// it reads the query with useSearchParams).
export const dynamic = "force-dynamic";

// The country step's suggestion, from this request (country-preselect
// spec): the browser's languages, then the IP country. Only shown, never
// stored.
export default async function Layout({ children }: { children: ReactNode }) {
  const h = await headers();
  const guess = guessSignupCountry({
    saved: (await cookies()).get(SIGNUP_COUNTRY_COOKIE)?.value,
    acceptLanguage: h.get("accept-language"),
    ipCountry: h.get("x-vercel-ip-country") ?? h.get("cf-ipcountry"),
  });
  return <CountryGuessProvider guess={guess}>{children}</CountryGuessProvider>;
}
