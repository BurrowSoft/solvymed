import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";
import { DEFAULT_DESIGN } from "@/lib/studio/design";

// Document Studio PR4 (ec, #543 B1): a print page in the design falls back
// to today's print view when the PDF can't be made, so a prescription,
// history or receipt can always be printed.

const browser = vi.hoisted(() => ({ renderInBrowser: vi.fn(), drawPages: vi.fn(), printPdf: vi.fn() }));
vi.mock("@/lib/pdf/browser", () => browser);
vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));

const { DesignedPrint } = await import("@/components/DesignedPrint");

function show() {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <DesignedPrint
        backHref="/dashboard/patients/1" fileName="x.pdf"
        input={{ design: structuredClone(DEFAULT_DESIGN), locale: "en", practice: { displayName: "Dr. Test", specialty: null, registrationLine: null, clinicName: null, locations: [] }, logoUrls: { square: null, wide: null, reversed: null }, doc: { title: "Prescription", blocks: [] } }}
        fallback={<div data-testid="classic-view">today&apos;s print view</div>}
      />
    </NextIntlClientProvider>,
  );
}

describe("DesignedPrint", () => {
  it("the PDF can't be made: today's print view instead", async () => {
    browser.renderInBrowser.mockRejectedValueOnce(new Error("font fetch failed"));
    show();
    await waitFor(() => expect(screen.getByTestId("classic-view")).toBeInTheDocument());
    expect(screen.queryByTestId("designed-print")).toBeNull();
  });

  it("the PDF is made: its pages, and Print is enabled", async () => {
    browser.renderInBrowser.mockResolvedValueOnce(new Uint8Array([1, 2, 3]));
    browser.drawPages.mockResolvedValueOnce([document.createElement("canvas")]);
    show();
    await waitFor(() => expect(screen.getByTestId("designed-pages").dataset.state).toBe("ready"));
    expect(screen.getByTestId("designed-print")).not.toBeDisabled();
    expect(screen.queryByTestId("classic-view")).toBeNull();
  });
});
