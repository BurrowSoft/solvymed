import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("@/components/CookieSettingsButton", () => ({ CookieSettingsButton: () => null }));

import { PrivacyEn } from "@/app/[locale]/(site)/privacy/PrivacyEn";
import { PrivacyPtBR } from "@/app/[locale]/(site)/privacy/PrivacyPtBR";
import { conditionMet } from "@/lib/conditions";

// UX 36's 1.4.0 privacy additions: the SolvyAI and LINE blocks appear only
// when their features are live (policy = what runs).

describe("privacy policy: SolvyAI / LINE blocks follow their conditions", () => {
  it("today (both unmet) neither appears, in either language", () => {
    expect(conditionMet("solvyai-live")).toBe(false);
    expect(conditionMet("line-live")).toBe(false);
    for (const Doc of [PrivacyEn, PrivacyPtBR]) {
      const { container, unmount } = render(<Doc turnstile={false} />);
      expect(container.textContent).not.toMatch(/Anthropic|SolvyAI|LY Corporation|LINE/);
      unmount();
    }
  });

  it("each block shows with its own flag only", () => {
    let r = render(<PrivacyEn turnstile={false} solvyai />);
    expect(r.container.textContent).toContain("Anthropic (SolvyAI, professionals only, when used)");
    expect(r.container.textContent).toContain("6b. SolvyAI (professionals only)");
    // The mask covers CPF and Thai IDs, not passports: the text says so.
    expect(r.container.textContent).toContain("CPF and Thai ID numbers, phone numbers and emails are masked");
    expect(r.container.textContent).not.toMatch(/LY Corporation|6c\./);
    r.unmount();
    r = render(<PrivacyPtBR turnstile={false} line />);
    expect(r.container.textContent).toContain("LY Corporation (LINE)");
    expect(r.container.textContent).toContain("6c. Avisos pelo LINE (Tailândia)");
    expect(r.container.textContent).not.toMatch(/Anthropic|6b\./);
    r.unmount();
  });
});
