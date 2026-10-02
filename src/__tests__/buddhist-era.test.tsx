import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { birthDateOutOfRange, buddhistYearOf, looksBuddhistEra } from "@/lib/buddhistEra";

let locale = "th";
vi.mock("next-intl", () => ({
  useLocale: () => locale,
  useTranslations: () => (key: string) => key,
}));

import { DateInput } from "@/components/DateInput";

const field = (c: HTMLElement) => c.querySelector('input[type="text"]') as HTMLInputElement;
const hidden = (c: HTMLElement) => c.querySelector('input[type="hidden"]') as HTMLInputElement;

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



  it("a birth-date field refuses a future date with the range message", () => {
    locale = "pt-BR";
    const { container } = render(<DateInput birthDate name="birth_date" />);
    fireEvent.change(field(container), { target: { value: "01/01/2099" } });
    expect(screen.getByRole("alert")).toHaveTextContent("invalidBirthDate");
    expect(field(container).validity.customError).toBe(true);
    fireEvent.change(field(container), { target: { value: "14/05/2539" } });
    expect(screen.getByRole("alert")).toHaveTextContent("buddhistYear");
  });

  it("'today' is the browser's, read after mount (never a server-rendered date)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // 06:30 in Bangkok = 23:30 UTC the day before: a server's date would be a day early.
    vi.setSystemTime(new Date(2026, 8, 30, 6, 30));
    const { container } = render(<DateInput birthDate name="birth_date" />);
    await act(async () => {});
    fireEvent.change(field(container), { target: { value: "30/09/2026" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.change(field(container), { target: { value: "01/10/2026" } });
    expect(screen.getByRole("alert")).toHaveTextContent("invalidBirthDate");
    vi.useRealTimers();
  });

  it("schedule dates (not birth dates) may be in the future", () => {
    const { container } = render(<DateInput name="date" />);
    fireEvent.change(field(container), { target: { value: "01/01/2099" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(hidden(container).value).toBe("2099-01-01");
  });
});

describe("DateInput: our dd/mm/yyyy field, never the browser's date input (build 25, item 7)", () => {
  it("a text field with the dd/mm placeholder; no native date input at all", () => {
    locale = "en";
    const { container } = render(<DateInput birthDate name="birth_date" />);
    expect(container.querySelector('input[type="date"]')).toBeNull();
    expect(field(container).placeholder).toBe("placeholder");
    expect(field(container).inputMode).toBe("numeric");
  });

  it("slashes as you type; the form gets ISO only when the date is complete and real", () => {
    const { container } = render(<DateInput name="date" />);
    fireEvent.change(field(container), { target: { value: "0510" } });
    expect(field(container).value).toBe("05/10");
    expect(hidden(container).value).toBe("");
    fireEvent.change(field(container), { target: { value: "05102026" } });
    expect(field(container).value).toBe("05/10/2026");
    expect(hidden(container).value).toBe("2026-10-05");
  });

  it("an impossible date (31/02) says invalid and blocks the form", () => {
    const { container } = render(<form><DateInput name="date" /></form>);
    fireEvent.change(field(container), { target: { value: "31/02/2026" } });
    expect(screen.getByRole("alert")).toHaveTextContent("invalid");
    expect(hidden(container).value).toBe("");
    expect((container.querySelector("form") as HTMLFormElement).checkValidity()).toBe(false);
  });

  it("an existing value shows as dd/mm/yyyy (never mm/dd)", () => {
    const { container } = render(<DateInput name="date" defaultValue="2026-10-05" />);
    expect(field(container).value).toBe("05/10/2026");
  });

  it("Thai: shows the พ.ศ. year of the date", () => {
    locale = "th";
    render(<DateInput birthDate name="birth_date" defaultValue="1996-05-14" />);
    expect(screen.getByText("พ.ศ. 2539")).toBeInTheDocument();
  });

  it("other languages: no พ.ศ. hint", () => {
    locale = "pt-BR";
    render(<DateInput birthDate name="birth_date" defaultValue="1996-05-14" />);
    expect(screen.queryByText(/พ\.ศ\./)).not.toBeInTheDocument();
  });

  it("a Buddhist-era year blocks the form (custom validity) and says why; it's never converted", () => {
    locale = "th";
    const { container } = render(<form><DateInput birthDate name="birth_date" /></form>);
    fireEvent.change(field(container), { target: { value: "14/05/2539" } });
    expect(screen.getByRole("alert")).toHaveTextContent("buddhistYear");
    expect(field(container).validity.customError).toBe(true);
    expect(field(container).value).toBe("14/05/2539");
    expect((container.querySelector("form") as HTMLFormElement).checkValidity()).toBe(false);
    fireEvent.change(field(container), { target: { value: "14/05/1996" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(field(container).validity.customError).toBe(false);
  });

  it("controlled: reports ISO changes and shows what it's given", () => {
    locale = "th";
    const onChange = vi.fn();
    const { container, rerender } = render(<DateInput birthDate value="1990-01-02" onChange={onChange} />);
    expect(field(container).value).toBe("02/01/1990");
    expect(screen.getByText("พ.ศ. 2533")).toBeInTheDocument();
    fireEvent.change(field(container), { target: { value: "02/01/1991" } });
    expect(onChange).toHaveBeenCalledWith("1991-01-02");
    rerender(<DateInput birthDate value="2000-12-31" onChange={onChange} />);
    expect(field(container).value).toBe("31/12/2000");
  });
});

describe("maskedDate helpers", () => {
  it("formats, parses and round-trips", async () => {
    const { formatMaskedDate, isoFromMasked, maskedFromIso } = await import("@/lib/maskedDate");
    expect(formatMaskedDate("5/10/2026")).toBe("05/10/2026");
    expect(formatMaskedDate("05-10-2026")).toBe("05/10/2026");
    expect(formatMaskedDate("051020261234")).toBe("05/10/2026");
    expect(isoFromMasked("29/02/2024")).toBe("2024-02-29");
    expect(isoFromMasked("29/02/2025")).toBe("");
    expect(isoFromMasked("00/10/2026")).toBe("");
    expect(isoFromMasked("05/13/2026")).toBe("");
    expect(maskedFromIso("2026-10-05")).toBe("05/10/2026");
    expect(maskedFromIso("")).toBe("");
  });
});
