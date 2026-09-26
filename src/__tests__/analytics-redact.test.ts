import { describe, it, expect } from "vitest";
import { redactAnalyticsUrl } from "@/lib/analyticsRedact";

const B = "https://www.solvymed.com";

describe("redactAnalyticsUrl", () => {
  it("redacts invite codes, with or without a locale", () => {
    expect(redactAnalyticsUrl(`${B}/invite/AB12CD`)).toBe(`${B}/invite/[code]`);
    expect(redactAnalyticsUrl(`${B}/pt-BR/invite/AB12CD`)).toBe(`${B}/pt-BR/invite/[code]`);
  });

  it("redacts public join codes and secretary codes", () => {
    expect(redactAnalyticsUrl(`${B}/join/XYZ789`)).toBe(`${B}/join/[code]`);
    expect(redactAnalyticsUrl(`${B}/es/join/secretary/S-ABC123`)).toBe(`${B}/es/join/secretary/[code]`);
  });

  it("redacts emails and codes in the query string", () => {
    const out = redactAnalyticsUrl(`${B}/join/secretary/S-1?email=ana%40gmail.com`)!;
    expect(out).not.toContain("ana");
    expect(new URL(out).searchParams.get("email")).toBe("[redacted]");
    const signup = new URL(redactAnalyticsUrl(`${B}/pt-BR/auth/signup?secretary=S-1&email=a%40b.c&join=Q1`)!);
    expect(signup.searchParams.get("secretary")).toBe("[redacted]");
    expect(signup.searchParams.get("email")).toBe("[redacted]");
    expect(signup.searchParams.get("join")).toBe("[redacted]");
  });

  it("drops the fragment (reset links carry tokens there)", () => {
    expect(redactAnalyticsUrl(`${B}/pt-BR/auth/reset-password#access_token=secret&type=recovery`)).toBe(
      `${B}/pt-BR/auth/reset-password`,
    );
  });

  it("leaves ordinary pages alone", () => {
    expect(redactAnalyticsUrl(`${B}/pt-BR/dashboard?tab=week`)).toBe(`${B}/pt-BR/dashboard?tab=week`);
    expect(redactAnalyticsUrl(`${B}/`)).toBe(`${B}/`);
  });

  it("drops unparseable URLs", () => {
    expect(redactAnalyticsUrl("not a url")).toBeNull();
  });
});
