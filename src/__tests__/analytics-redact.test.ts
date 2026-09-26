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

  it("redacts ?next= (it can hold an invite path with a code)", () => {
    const out = redactAnalyticsUrl(`${B}/pt-BR/auth/login?next=%2Fpt-BR%2Fjoin%2Fsecretary%2FS-ABCDEFGH`)!;
    expect(out).not.toContain("S-ABCDEFGH");
    expect(new URL(out).searchParams.get("next")).toBe("[redacted]");
  });

  it("redacts search terms (patient names, CPFs)", () => {
    for (const q of ["Maria Silva", "123.456.789-00"]) {
      const out = redactAnalyticsUrl(`${B}/dashboard/patients?q=${encodeURIComponent(q)}`)!;
      expect(out).not.toContain("Maria");
      expect(out).not.toContain("789");
      expect(new URL(out).searchParams.get("q")).toBe("[redacted]");
    }
  });

  it("redacts any unknown param, keeps allowlisted ones", () => {
    const out = new URL(redactAnalyticsUrl(`${B}/?utm_source=google&utm_campaign=br_launch&text=hello&name=Ana`)!);
    expect(out.searchParams.get("utm_source")).toBe("google");
    expect(out.searchParams.get("utm_campaign")).toBe("br_launch");
    expect(out.searchParams.get("text")).toBe("[redacted]");
    expect(out.searchParams.get("name")).toBe("[redacted]");
  });

  it("drops the fragment (reset links carry tokens there)", () => {
    expect(redactAnalyticsUrl(`${B}/pt-BR/auth/reset-password#access_token=secret&type=recovery`)).toBe(
      `${B}/pt-BR/auth/reset-password`,
    );
  });

  it("leaves ordinary pages alone", () => {
    expect(redactAnalyticsUrl(`${B}/pt-BR/dashboard/schedule?date=2026-09-26&view=week`)).toBe(
      `${B}/pt-BR/dashboard/schedule?date=2026-09-26&view=week`,
    );
    expect(redactAnalyticsUrl(`${B}/`)).toBe(`${B}/`);
  });

  it("drops unparseable URLs", () => {
    expect(redactAnalyticsUrl("not a url")).toBeNull();
  });
});
