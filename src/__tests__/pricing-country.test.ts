import { describe, expect, it } from "vitest";
import { pricingCountry, pricingCountryCode } from "@/lib/pricingCountry";
import { getPlanPrice } from "@/lib/subscription";

const priceFor = (opts: { chosen?: string | null; geo?: string | null }, offered: boolean) =>
  getPlanPrice(pricingCountryCode(pricingCountry(opts, offered))).amount;

describe("/pricing: which price is shown", () => {
  it("before the Thai release: R$ 89 for everyone, whatever the geo or ?c=", () => {
    expect(priceFor({ geo: "TH" }, false)).toBe("R$ 89");
    expect(priceFor({ geo: "US", chosen: "OTHER" }, false)).toBe("R$ 89");
    expect(priceFor({}, false)).toBe("R$ 89");
  });

  it("from the Thai release: the visitor's country by geo", () => {
    expect(priceFor({ geo: "BR" }, true)).toBe("R$ 89");
    expect(priceFor({ geo: "th" }, true)).toBe("฿690");
    expect(priceFor({ geo: "US" }, true)).toBe("US$ 19");
    expect(priceFor({ geo: null }, true)).toBe("US$ 19");
  });

  it("the switcher (?c=) wins over geo; anything else is ignored", () => {
    expect(priceFor({ geo: "BR", chosen: "TH" }, true)).toBe("฿690");
    expect(priceFor({ geo: "TH", chosen: "other" }, true)).toBe("US$ 19");
    expect(priceFor({ geo: "TH", chosen: "XX" }, true)).toBe("฿690");
  });
});
