import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SubscribeHeader } from "@/app/[locale]/(site)/subscribe/SubscribeHeader";

// /subscribe's exits (d7/9a on #213): a locked account gets no "Voltar" and
// a plain logo (the dashboard and the home page both bounce back here).

describe("SubscribeHeader", () => {
  it("while the dashboard lets them in: Voltar and the logo lead there", () => {
    const { container } = render(<SubscribeHeader exitHref="/pt-BR/dashboard" backLabel="Voltar" />);
    expect(screen.getByText(/Voltar/).getAttribute("href")).toBe("/pt-BR/dashboard");
    expect(container.querySelectorAll("a")).toHaveLength(2);
  });

  it("locked: no Voltar and no link at all", () => {
    const { container } = render(<SubscribeHeader exitHref={null} backLabel="Voltar" />);
    expect(screen.queryByText(/Voltar/)).toBeNull();
    expect(container.querySelectorAll("a")).toHaveLength(0);
    expect(screen.getByText("SolvyMed")).toBeInTheDocument();
  });
});
