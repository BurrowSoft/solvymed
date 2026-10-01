import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/x", useSearchParams: () => new URLSearchParams() }));
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
const saved: [string, number][] = [];
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/payments/actions", () => ({
  markPaid: vi.fn(), markUnpaid: vi.fn(),
  setPaymentAmount: vi.fn(async (id: string, v: number) => { saved.push([id, v]); return { success: true }; }),
}));
import { SetAmountButton } from "@/app/[locale]/(site)/dashboard/(gated)/payments/PaymentsClient";

// "Sem valor · Definir valor" (the app's #216): prefilled with the
// procedure's price, above zero only.
describe("SetAmountButton", () => {
  it("shows Sem valor · Definir valor; the box is prefilled with the procedure price", async () => {
    render(<SetAmountButton id="a-1" suggested={250} />);
    expect(screen.getByText(/noAmount/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("setAmount"));
    expect((screen.getByLabelText("setAmount") as HTMLInputElement).value).toBe("250");
    await act(async () => { fireEvent.click(screen.getByText("confirm")); });
    expect(saved).toEqual([["a-1", 250]]);
  });

  it("zero or empty → \"enter the amount first\", nothing saved", async () => {
    saved.length = 0;
    render(<SetAmountButton id="a-2" />);
    fireEvent.click(screen.getByText("setAmount"));
    await act(async () => { fireEvent.click(screen.getByText("confirm")); });
    expect(screen.getByText("amountFirst")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("setAmount"), { target: { value: "0" } });
    await act(async () => { fireEvent.click(screen.getByText("confirm")); });
    expect(screen.getByText("amountFirst")).toBeInTheDocument();
    expect(saved).toEqual([]);
  });
});
