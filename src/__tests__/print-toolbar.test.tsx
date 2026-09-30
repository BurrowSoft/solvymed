import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
import { PrintToolbar } from "@/components/PrintToolbar";

describe("PrintToolbar", () => {
  it("prints by default; printable=false leaves only the way back (3e: the Thai receipt note)", () => {
    const { unmount } = render(<PrintToolbar backHref="/x" />);
    expect(screen.getByText("print")).toBeInTheDocument();
    unmount();
    render(<PrintToolbar backHref="/x" backLabel="Back" printable={false} />);
    expect(screen.queryByText("print")).toBeNull();
    expect(screen.getByText("← Back")).toBeInTheDocument();
  });
});
