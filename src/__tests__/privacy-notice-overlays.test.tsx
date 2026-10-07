import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";

// cf (6 Oct): one overlay at a time. The privacy notice is inline: hidden
// while a tour or a popup runs, shown after.

const h = vi.hoisted(() => ({ running: false }));
vi.mock("@/components/tour/TourProvider", () => ({ useTour: () => ({ running: h.running }) }));
vi.mock("@/lib/privacyNoticeActions", () => ({ acknowledgePrivacyNotice: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({ Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

import { PrivacyNoticeCard } from "@/components/PrivacyNoticeCard";

const view = () => render(<NextIntlClientProvider locale="en" messages={en}><PrivacyNoticeCard locale="en" date="12 October 2026" /></NextIntlClientProvider>);

describe("the privacy notice and the tour", () => {
  it("hidden while the tour runs", () => {
    h.running = true;
    view();
    expect(screen.queryByTestId("privacy-notice")).toBeNull();
  });

  it("shown when nothing runs, and it never blocks the tour (no data-tour-block)", () => {
    h.running = false;
    view();
    const card = screen.getByTestId("privacy-notice");
    expect(card.hasAttribute("data-tour-block")).toBe(false);
  });
});
