import { thaiEnabled } from "./publicLocales";

// Which country's price the public /pricing page shows (Sprint TH, TH-8).
// Before the Thai release (NEXT_PUBLIC_THAI_ENABLED) there's one live
// price, Brazil's, in every language. From it on: the visitor's pick in
// the page's country switcher (?c=), else their country from geo (Brazil or
// Thailand), else the page language (th → Thailand, else Brazil). Only BR
// and TH are offered (Vitor 1.4.0: no "Other countries" price). The amount
// always comes from getPlanPrice, the same table checkout charges from.

export type PricingChoice = "BR" | "TH";

export function pricingCountry(
  opts: { chosen?: string | null; geo?: string | null; locale?: string },
  offered: boolean = thaiEnabled,
): PricingChoice {
  if (!offered) return "BR";
  const chosen = (opts.chosen ?? "").toUpperCase();
  if (chosen === "BR" || chosen === "TH") return chosen;
  const geo = (opts.geo ?? "").toUpperCase();
  if (geo === "BR" || geo === "TH") return geo;
  return opts.locale === "th" ? "TH" : "BR";
}

// The country code getPlanPrice takes for each choice.
export function pricingCountryCode(choice: PricingChoice): string {
  return choice;
}
