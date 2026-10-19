import type { CountryChoice } from "./signupCountry";

// The country tapped on the signup's step, kept in memory across the client
// navigation to its form, even into another language (/pt-BR → /th mounts
// a new page), so that form doesn't count the same choice again as a "link"
// arrival (24 on #589). A new page load starts over: a tap before hydration
// follows the plain link and is counted once, as "link".
let tapped: CountryChoice | null = null;

export function noteCountryTap(country: CountryChoice) {
  tapped = country;
}

// True (once) when this country is the one just tapped.
export function takeCountryTap(country: CountryChoice): boolean {
  const hit = tapped === country;
  tapped = null;
  return hit;
}
