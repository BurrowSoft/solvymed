import { describe, expect, it } from "vitest";
import { pricingCountry, pricingCountryCode } from "@/lib/pricingCountry";
import { getPlanPrice } from "@/lib/subscription";

const priceFor = (opts: { chosen?: string | null; geo?: string | null; locale?: string }, offered: boolean) =>
  getPlanPrice(pricingCountryCode(pricingCountry(opts, offered))).amount;

describe("/pricing: which price is shown", () => {
  it("before the Thai release: R$ 89 for everyone, whatever the geo or ?c=", () => {
    expect(priceFor({ geo: "TH" }, false)).toBe("R$ 89");
    expect(priceFor({ geo: "US", chosen: "TH" }, false)).toBe("R$ 89");
    expect(priceFor({}, false)).toBe("R$ 89");
  });

  it("from the Thai release: Brazil or Thailand only (Vitor 1.4.0, no Other price)", () => {
    expect(priceFor({ geo: "BR" }, true)).toBe("R$ 89");
    expect(priceFor({ geo: "th" }, true)).toBe("฿690");
    expect(priceFor({ geo: "US" }, true)).toBe("R$ 89");
    expect(priceFor({ geo: "US", locale: "th" }, true)).toBe("฿690");
    expect(priceFor({ geo: null }, true)).toBe("R$ 89");
  });

  it("the switcher (?c=) wins over geo; anything else (incl. the old OTHER) is ignored", () => {
    expect(priceFor({ geo: "BR", chosen: "TH" }, true)).toBe("฿690");
    expect(priceFor({ geo: "TH", chosen: "other" }, true)).toBe("฿690");
    expect(priceFor({ geo: "TH", chosen: "XX" }, true)).toBe("฿690");
  });
});
