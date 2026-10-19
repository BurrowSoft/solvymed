import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// F1 (specs/signup-funnel-fixes.md): on phones the banner is one short
// sentence + Aceitar/Recusar on one row at the same size; the page gets
// bottom padding as tall as the banner; the consent values don't change and
// nothing covers the pre-hydration page.

const nav = vi.hoisted(() => ({ path: "/pt-BR/auth/signup" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.path }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));

import { ConsentBanner } from "@/components/ConsentBanner";

const tree = () => (
  <NextIntlClientProvider locale="pt-BR" messages={pt}>
    <ConsentBanner />
  </NextIntlClientProvider>
);

describe("ConsentBanner (compact on phones)", () => {
  beforeEach(() => {
    document.cookie = "sm_consent=; Max-Age=0; Path=/";
    document.body.style.paddingBottom = "";
    nav.path = "/pt-BR/auth/signup";
  });

  it("server render: nothing (the pre-hydration page is never covered)", () => {
    expect(renderToString(tree())).not.toContain("consent-banner");
  });

  it("short text, the privacy link, Aceitar and Recusar as same-style buttons", () => {
    render(tree());
    expect(screen.getByText(pt.consent.textShort)).toBeInTheDocument();
    expect(screen.getByText(pt.consent.privacyLink).closest("a")).toHaveAttribute("href", "/privacy");
    const accept = screen.getByText(pt.consent.acceptShort).closest("button")!;
    const decline = screen.getByText(pt.consent.declineShort).closest("button")!;
    expect(accept.className).toBe(decline.className);
  });

  it("Recusar saves necessary only; the padding goes with the banner", () => {
    render(tree());
    expect(document.body.style.paddingBottom).toMatch(/px$/);
    fireEvent.click(screen.getByText(pt.consent.declineShort));
    expect(document.cookie).toMatch(/sm_consent=1\.00\.\d+/);
    expect(screen.queryByTestId("consent-banner")).toBeNull();
    expect(document.body.style.paddingBottom).toBe("");
  });

  it("Aceitar saves both", () => {
    render(tree());
    fireEvent.click(screen.getByText(pt.consent.acceptShort));
    expect(document.cookie).toMatch(/sm_consent=1\.11\.\d+/);
  });

  it("a return visit with a choice: no banner, no padding", () => {
    document.cookie = `sm_consent=1.00.${Math.floor(Date.now() / 1000)}; Path=/`;
    render(tree());
    expect(screen.queryByTestId("consent-banner")).toBeNull();
    expect(document.body.style.paddingBottom).toBe("");
  });

  it("the Escolher… link opens the categories", () => {
    render(tree());
    fireEvent.click(screen.getAllByText(pt.consent.choose)[0]);
    expect(screen.getByText(pt.consent.analyticsTitle)).toBeInTheDocument();
    expect(screen.getByText(pt.consent.save)).toBeInTheDocument();
  });
});
