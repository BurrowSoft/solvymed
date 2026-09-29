import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { fireEvent, render, screen } from "@testing-library/react";
import { parseTheme } from "@/lib/theme";

// The dashboard's dark theme (Help C8, UX 36).

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
import { AppearanceCard } from "@/app/[locale]/(site)/dashboard/settings/AppearanceCard";

describe("theme choice", () => {
  it("Automático unless the cookie says Claro or Escuro", () => {
    expect(parseTheme(undefined)).toBe("auto");
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("<script>")).toBe("auto");
  });
});

describe("AppearanceCard", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div data-theme="auto" data-theme-root></div>';
    document.cookie = "sm_theme=; max-age=0; path=/";
  });

  it("applies the choice at once and keeps it for this browser", () => {
    render(<AppearanceCard />);
    expect(screen.getByRole("radio", { name: "themeAuto" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: "themeDark" }));
    expect(document.querySelector("[data-theme-root]")!.getAttribute("data-theme")).toBe("dark");
    expect(document.cookie).toContain("sm_theme=dark");
    expect(screen.getByRole("radio", { name: "themeDark" })).toHaveAttribute("aria-checked", "true");
  });
});

describe("dark-theme.css", () => {
  const css = fs.readFileSync("src/app/dark-theme.css", "utf8");
  const theme = fs.readFileSync("node_modules/tailwindcss/theme.css", "utf8");
  const v = (name: string) => theme.match(new RegExp(`--${name}:\s*([^;]+);`))![1].trim();

  it("is up to date with its generator", () => {
    // Line endings aside (a Windows checkout has CRLF).
    const lf = (x: string) => x.replace(/
/g, "
");
    const before = lf(css);
    execFileSync(process.execPath, ["scripts/dark-theme-build.mjs"], { stdio: "ignore" });
    expect(lf(fs.readFileSync("src/app/dark-theme.css", "utf8"))).toBe(before);
  });

  it("swaps light and dark steps, keeps 400–600, and makes white the card surface", () => {
    const darkBlock = css.slice(css.indexOf('[data-theme="dark"] {'), css.indexOf("}"));
    expect(darkBlock).toContain(`--color-slate-50: ${v("color-slate-950")};`);
    expect(darkBlock).toContain(`--color-red-700: ${v("color-red-300")};`);
    expect(darkBlock).not.toContain("--color-red-600:");
    expect(darkBlock).toContain(`--color-white: ${v("color-slate-900")};`);
    expect(css).toContain('[data-theme="dark"] .text-white { color: #fff; }');
  });

  it("follows the system when Automático, and a light scope (print views) resets everything", () => {
    expect(css).toMatch(/@media \(prefers-color-scheme: dark\) \{\s*\[data-theme="auto"\] \{/);
    const lightBlock = css.slice(css.indexOf('[data-theme="light"] {'));
    expect(lightBlock).toContain(`--color-slate-50: ${v("color-slate-50")};`);
    expect(lightBlock).toContain("--color-white: #fff;");
    expect(css).not.toContain("&");
  });
});
