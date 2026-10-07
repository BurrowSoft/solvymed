import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { LocaleRedirect, localizedPath } from "@/components/LocaleRedirect";

// A language the practice country doesn't offer (Thai in a Brazilian
// practice): the dashboard layout renders this instead of the dashboard
// (ad, after b3's lost SolvyAI answer), and it replaces the address at once.

describe("localizedPath", () => {
  it("swaps the locale prefix and keeps the rest of the address", () => {
    expect(localizedPath("pt-BR", "/th/dashboard/patients/p-1", "?tab=rx#x")).toBe("/pt-BR/dashboard/patients/p-1?tab=rx#x");
    expect(localizedPath("en", "/th/dashboard")).toBe("/dashboard");
    expect(localizedPath("pt-BR", "/th")).toBe("/pt-BR");
    expect(localizedPath("th", "/dashboard/schedule")).toBe("/th/dashboard/schedule");
    expect(localizedPath("pt-BR", "/zh-TW/dashboard")).toBe("/pt-BR/dashboard");
  });
});

describe("LocaleRedirect", () => {
  it("renders nothing, saves the choice and replaces the address", () => {
    const replace = vi.fn();
    const original = window.location;
    Object.defineProperty(window, "location", { configurable: true, value: { pathname: "/th/dashboard/schedule", search: "?date=2026-10-08", hash: "", replace } });
    const { container } = render(<LocaleRedirect to="pt-BR" />);
    expect(container.innerHTML).toBe("");
    expect(document.cookie).toContain("NEXT_LOCALE=pt-BR");
    expect(replace).toHaveBeenCalledWith("/pt-BR/dashboard/schedule?date=2026-10-08");
    Object.defineProperty(window, "location", { configurable: true, value: original });
  });
});
