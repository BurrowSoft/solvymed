import { describe, expect, it } from "vitest";
import { landingPrice } from "@/lib/pricingCountry";
import { getPlanPrice, TRIAL_DAYS } from "@/lib/subscription";
import { playStoreUrl } from "@/lib/appStores";
import en from "@/messages/en.json";
import pt from "@/messages/pt-BR.json";
import th from "@/messages/th.json";

// The YouTube links (02, 10-13): the landing says the trial length and the
// price (the same table checkout charges, never a second number), and a
// consented visitor's episode reaches the Play referrer.

describe("the landing's trial line", () => {
  it("the price of the page's country; other languages get none", () => {
    expect(landingPrice("pt-BR")).toBe(getPlanPrice("BR").amount);
    expect(landingPrice("th", true)).toBe(getPlanPrice("TH").amount);
    expect(landingPrice("th", false)).toBeNull();
    expect(landingPrice("en")).toBeNull();
    expect(landingPrice("ja")).toBeNull();
  });

  it("the trial is the server's 15 days, and the texts take it as {days}", () => {
    expect(TRIAL_DAYS).toBe(15);
    for (const m of [en, pt, th]) {
      expect(m.hero.trialLine).toContain("{days}");
      expect(m.hero.trialLine).toContain("{price}");
      expect(m.hero.trialLineNoPrice).toContain("{days}");
      expect(m.hero.trialLineNoPrice).not.toContain("{price}");
    }
  });
});

describe("the Play referrer", () => {
  const referrer = (url: string) => new URLSearchParams(decodeURIComponent(new URL(url).searchParams.get("referrer") ?? ""));

  it("without a (consented) campaign: today's fixed referrer", () => {
    const r = referrer(playStoreUrl("landing"));
    expect(r.get("utm_source")).toBe("solvymed_web");
    expect(r.get("utm_campaign")).toBe("landing");
    expect(r.has("utm_content")).toBe(false);
  });

  it("with the visitor's campaign: utm_content, cleaned and capped", () => {
    expect(referrer(playStoreUrl("landing", "ep01-br")).get("utm_content")).toBe("ep01-br");
    expect(referrer(playStoreUrl("landing", "ep01 br&x=<script>")).get("utm_content")).toBe("ep01brxscript");
    expect(referrer(playStoreUrl("landing", "a".repeat(300))).get("utm_content")).toHaveLength(100);
    expect(referrer(playStoreUrl("landing", "  ")).has("utm_content")).toBe(false);
  });
});
