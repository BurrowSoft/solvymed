import { thaiEnabled } from "./publicLocales";

// Which country's price the public /pricing page shows (Sprint TH, TH-8).
// Before the Thai release (NEXT_PUBLIC_THAI_ENABLED) there's one live
// price, Brazil's, in every language. From it on: the visitor's pick in
// the page's country switcher (?c=), else their country from geo (Brazil,
// Thailand, anything else = Other). The amount itself always comes from
// getPlanPrice, the same table checkout charges from.

export type PricingChoice = "BR" | "TH" | "OTHER";

export function pricingCountry(
  opts: { chosen?: string | null; geo?: string | null },
  offered: boolean = thaiEnabled,
): PricingChoice {
  if (!offered) return "BR";
  const chosen = (opts.chosen ?? "").toUpperCase();
  if (chosen === "BR" || chosen === "TH" || chosen === "OTHER") return chosen;
  const geo = (opts.geo ?? "").toUpperCase();
  if (geo === "BR" || geo === "TH") return geo;
  return "OTHER";
}

// A country code getPlanPrice understands for each choice ('ZZ' = Other).
export function pricingCountryCode(choice: PricingChoice): string {
  return choice === "OTHER" ? "ZZ" : choice;
}
