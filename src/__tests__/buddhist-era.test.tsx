import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { birthDateOutOfRange, buddhistYearOf, looksBuddhistEra } from "@/lib/buddhistEra";

let locale = "th";
vi.mock("next-intl", () => ({
  useLocale: () => locale,
  useTranslations: () => (key: string) => key,
}));

import { DateInput } from "@/components/DateInput";

describe("birth dates: a Buddhist-era year is never saved or converted", () => {
  it("a year ≥ 2400 looks Buddhist-era; real birth years don't", () => {
    expect(looksBuddhistEra("2539-05-14")).toBe(true);
    expect(looksBuddhistEra("2400-01-01")).toBe(true);
    expect(looksBuddhistEra("1996-05-14")).toBe(false);
    expect(looksBuddhistEra("2399-12-31")).toBe(false);
    expect(looksBuddhistEra("")).toBe(false);
    expect(looksBuddhistEra(null)).toBe(false);
  });

  it("the hint's year is Gregorian + 543, and none for a Buddhist-era year", () => {
    expect(buddhistYearOf("1996-05-14")).toBe(2539);
    expect(buddhistYearOf("2539-05-14")).toBeNull();
    expect(buddhistYearOf("")).toBeNull();
  });
});

describe("birth dates are between 1900-01-01 and today (116)", () => {
  it("the range rule", () => {
    const today = "2026-09-29";
    expect(birthDateOutOfRange("1996-05-14", today)).toBe(false);
    expect(birthDateOutOfRange("1900-01-01", today)).toBe(false);
    expect(birthDateOutOfRange(today, today)).toBe(false);
    expect(birthDateOutOfRange("1899-12-31", today)).toBe(true);
    expect(birthDateOutOfRange("2026-09-30", today)).toBe(true);
    expect(birthDateOutOfRange("", today)).toBe(false);
  });

  it("a birth-date field refuses a future date with the range message, and carries min/max", () => {
    locale = "en";
    const { container } = render(<DateInput birthDate name="birth_date" />);
    const input = container.querySelector("input")!;
    expect(input.min).toBe("1900-01-01");
    expect(input.max).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    fireEvent.change(input, { target: { value: "2099-01-01" } });
    expect(screen.getByRole("alert")).toHaveTextContent("invalidBirthDate");
    expect(input.validity.customError).toBe(true);
    // A Buddhist-era year keeps its own, more specific message.
    fireEvent.change(input, { target: { value: "2539-05-14" } });
    expect(screen.getByRole("alert")).toHaveTextContent("buddhistYear");
  });

  it("schedule dates (not birth dates) may be in the future", () => {
    const { container } = render(<DateInput name="date" />);
    const input = container.querySelector("input")!;
    fireEvent.change(input, { target: { value: "2099-01-01" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(input.max).toBe("");
  });
});

describe("DateInput", () => {
  it("Thai: shows the พ.ศ. year of the picked date", () => {
    locale = "th";
    render(<DateInput birthDate name="birth_date" defaultValue="1996-05-14" />);
    expect(screen.getByText("พ.ศ. 2539")).toBeInTheDocument();
  });

  it("other languages: no พ.ศ. hint", () => {
    locale = "pt-BR";
    render(<DateInput birthDate name="birth_date" defaultValue="1996-05-14" />);
    expect(screen.queryByText(/พ\.ศ\./)).not.toBeInTheDocument();
  });

  it("a Buddhist-era year blocks the form (custom validity) and says why; the value isn't changed", () => {
    locale = "th";
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    const { container } = render(
      <form onSubmit={onSubmit}>
        <DateInput birthDate name="birth_date" />
        <button type="submit">save</button>
      </form>,
    );
    const input = container.querySelector("input")!;
    fireEvent.change(input, { target: { value: "2539-05-14" } });
    expect(screen.getByRole("alert")).toHaveTextContent("buddhistYear");
    expect(input.validity.customError).toBe(true);
    expect(input.value).toBe("2539-05-14");
    expect((container.querySelector("form") as HTMLFormElement).checkValidity()).toBe(false);

    fireEvent.change(input, { target: { value: "1996-05-14" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(input.validity.customError).toBe(false);
  });

  it("a schedule date (no birthDate): no พ.ศ. hint, but the same guard", () => {
    locale = "th";
    const { container } = render(<DateInput name="date" defaultValue="2026-09-28" />);
    expect(screen.queryByText(/พ\.ศ\./)).not.toBeInTheDocument();
    const input = container.querySelector("input")!;
    fireEvent.change(input, { target: { value: "2569-09-28" } });
    expect(screen.getByRole("alert")).toHaveTextContent("buddhistYear");
    expect(input.validity.customError).toBe(true);
  });

  it("controlled: reports changes and shows what it's given", () => {
    locale = "th";
    const onChange = vi.fn();
    const { container } = render(<DateInput birthDate value="1990-01-02" onChange={onChange} />);
    expect(screen.getByText("พ.ศ. 2533")).toBeInTheDocument();
    fireEvent.change(container.querySelector("input")!, { target: { value: "1991-01-02" } });
    expect(onChange).toHaveBeenCalledWith("1991-01-02");
  });
});
