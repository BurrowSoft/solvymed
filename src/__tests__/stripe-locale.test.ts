import { describe, expect, it } from "vitest";
import { routing } from "@/i18n/routing";
import { stripeLocale } from "@/lib/stripeBilling";

// The Stripe customer portal opens in the doctor's language (d7): every app
// locale Stripe supports, else "auto".
describe("stripeLocale", () => {
  it("passes the app locales Stripe has; Arabic (and anything unknown) → auto", () => {
    expect(stripeLocale("pt-BR")).toBe("pt-BR");
    expect(stripeLocale("th")).toBe("th");
    expect(stripeLocale("zh-TW")).toBe("zh-TW");
    expect(stripeLocale("ar")).toBe("auto");
    expect(stripeLocale("xx")).toBe("auto");
  });

  it("covers every app locale but Arabic", () => {
    const auto = (routing.locales as readonly string[]).filter((l) => stripeLocale(l) === "auto");
    expect(auto).toEqual(["ar"]);
  });
});
