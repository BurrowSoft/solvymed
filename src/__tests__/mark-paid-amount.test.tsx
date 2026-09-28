import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/dashboard/payments",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
const markPaid = vi.fn().mockResolvedValue({ success: true });
vi.mock("@/app/[locale]/dashboard/payments/actions", () => ({
  markPaid: (...a: unknown[]) => markPaid(...a),
  markUnpaid: vi.fn(),
}));

import { MarkPaidButton } from "@/app/[locale]/dashboard/payments/PaymentsClient";

beforeEach(() => markPaid.mockClear());

function typeAmount(text: string) {
  render(<MarkPaidButton id="a1" />);
  fireEvent.click(screen.getByText("markPaid")); // no amount yet → the field opens
  fireEvent.change(screen.getByPlaceholderText("amountPlaceholder"), { target: { value: text } });
}

describe("Mark paid: the typed amount (money hotfix)", () => {
  it("\"150,50\" is saved as 150.50, shown back before confirming", async () => {
    typeAmount("150,50");
    expect(screen.getByText(/= R\$\s150,50/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("confirm"));
    await waitFor(() => expect(markPaid).toHaveBeenCalledWith("a1", 150.5));
  });

  it("\"1.500,50\" is saved as 1500.50", async () => {
    typeAmount("1.500,50");
    fireEvent.click(screen.getByText("confirm"));
    await waitFor(() => expect(markPaid).toHaveBeenCalledWith("a1", 1500.5));
  });

  it("invalid text shows an error and saves nothing (no fallback)", () => {
    typeAmount("150,5050");
    fireEvent.click(screen.getByText("confirm"));
    expect(screen.getByText("errorInvalidAmount")).toBeInTheDocument();
    expect(markPaid).not.toHaveBeenCalled();
  });

  it("the field is a text input with a decimal keyboard (not type=number)", () => {
    typeAmount("");
    const input = screen.getByPlaceholderText("amountPlaceholder");
    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveAttribute("inputmode", "decimal");
  });
});
