import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// The setup card's "Also useful" payment chip follows the PRACTICE country
// (UX): Pix in Brazil, the PromptPay ID in Thailand, none elsewhere.

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => `setup.${k}` }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), useParams: () => ({ locale: "pt-BR" }), usePathname: () => "/pt-BR/dashboard", useSearchParams: () => new URLSearchParams() }));
vi.mock("@/lib/setup", async (orig) => ({ ...(await orig<Record<string, unknown>>()) }));

import { SetupChecklist } from "@/components/SetupChecklist";

// jsdom has no scrollIntoView (the card scrolls itself into view when opened).
Element.prototype.scrollIntoView = () => {};

const progress = {
  profile_done: false, hours_done: false, procedure_done: false, patient_done: false, appointment_done: false, invite_done: false,
  done_count: 0, setup_hidden: false, completed_ack: false,
} as unknown as Parameters<typeof SetupChecklist>[0]["progress"];

const chipsFor = (paymentQr: "pix" | "promptpay" | null) => {
  const r = render(<SetupChecklist progress={progress} locale="pt-BR" inviteCode={null} expanded paymentQr={paymentQr} />);
  const texts = [screen.queryByText("setup.pix"), screen.queryByText("setup.promptpay")].map((e) => e?.textContent ?? null);
  r.unmount();
  return texts;
};

describe("SetupChecklist: the payment chip by practice country", () => {
  it("BR → Pix, TH → PromptPay, other → none", () => {
    expect(chipsFor("pix")).toEqual(["setup.pix", null]);
    expect(chipsFor("promptpay")).toEqual([null, "setup.promptpay"]);
    expect(chipsFor(null)).toEqual([null, null]);
  });
});
