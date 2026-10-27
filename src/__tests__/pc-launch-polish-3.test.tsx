import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";
import th from "@/messages/th.json";
import { formatPhone, PHONE_FORMATS } from "@/lib/phoneFormat";
import { brandInitials } from "@/lib/readableAccent";
import { isUnscored } from "@/lib/patientChannel/unscored";
import { DEFAULT_SETTINGS } from "@/lib/patientChannel/channel";
import { ChannelSettings } from "@/app/[locale]/(site)/dashboard/settings/patient-channel/ChannelSettings";

// Patient Channel launch polish, PR 3 (specs/patient-channel-launch-polish.md): 16 the 24 h
// times, 19 the text-box hint, 27 the phone format per country, 29 no score for administrative
// requests, 33 / 35 the Thai entry line and initials.

describe("27: phone numbers per country (display only)", () => {
  it("Brazil: a mobile and a landline, with or without +55", () => {
    expect(formatPhone("11912340001", "BR")).toBe("(11) 91234-0001");
    expect(formatPhone("1131234567", "BR")).toBe("(11) 3123-4567");
    expect(formatPhone("+55 11 91234-0001", "BR")).toBe("(11) 91234-0001");
    expect(formatPhone("5511912340001", "BR")).toBe("(11) 91234-0001");
    // DDD 55 (RS) is a real area code, not the country's: left alone.
    expect(formatPhone("55912340001", "BR")).toBe("(55) 91234-0001");
  });
  it("Thailand: a mobile and a Bangkok landline, with or without +66", () => {
    expect(formatPhone("0812340001", "TH")).toBe("081 234 0001");
    expect(formatPhone("021234567", "TH")).toBe("02 123 4567");
    expect(formatPhone("+66 81 234 0001", "TH")).toBe("081 234 0001");
    expect(formatPhone("66812340001", "TH")).toBe("081 234 0001");
  });
  it("anything that fits no pattern stays as stored; no country, as stored", () => {
    expect(formatPhone("+1 415 555 0100", "BR")).toBe("+1 415 555 0100");
    expect(formatPhone("1234", "TH")).toBe("1234");
    expect(formatPhone("ramal 12", "BR")).toBe("ramal 12");
    expect(formatPhone(" 11912340001 ", null)).toBe("11912340001");
    expect(formatPhone(null, "BR")).toBe("");
    expect(Object.keys(PHONE_FORMATS).sort()).toEqual(["BR", "TH"]);
  });
});

describe("29: administrative requests have no score", () => {
  it("an options or exam reason is unscored; a symptom form or an older snapshot keeps its score", () => {
    expect(isUnscored({ kind: "options", title: "Recibo" })).toBe(true);
    expect(isUnscored({ kind: "exam" })).toBe(true);
    expect(isUnscored({ kind: "symptom_form" })).toBe(false);
    expect(isUnscored({ title: "Antiga" })).toBe(false);
    expect(isUnscored(null)).toBe(false);
  });
});

describe("35: Thai titles out of the initials", () => {
  it("หมอ / คุณหมอ (no dot, with or without a space), as the dotted ones", () => {
    expect(brandInitials("หมอซ้อมใหญ่ ทดสอบ")).toBe("ซท");
    expect(brandInitials("หมอ สมชาย ใจดี")).toBe("สใ");
    expect(brandInitials("คุณหมอมาลี สุขใจ")).toBe("มส");
    expect(brandInitials("นพ.สมชาย ใจดี")).toBe("สใ");
    expect(brandInitials("Dra. Ana Souza")).toBe("AS");
  });
});

describe("19 / 33: the copy", () => {
  it("the text-box hint is plain (no keys to press)", () => {
    expect(pt.patientChannel.patient.textBox.hint).toBe("Termos que o consultório conhece viram etiquetas: escolha uma sugestão ou digite a palavra inteira.");
    expect(th.patientChannel.patient.textBox.hint).toBe("คำที่คลินิกรู้จักจะกลายเป็นป้าย: เลือกคำแนะนำ หรือพิมพ์คำให้ครบ");
  });
  it("the Thai entry line reads \"if it's an emergency\", not \"emergency or not?\"", () => {
    expect(th.patientChannel.patient.entryEmergency).toBe("หากเป็นเหตุฉุกเฉิน อย่าใช้ช่องทางนี้ โทร {number} หรือไปห้องฉุกเฉิน");
  });
});

describe("16: the reading hours in 24 h", () => {
  const mount = (locale: "pt-BR" | "th", messages: typeof pt) => render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <ChannelSettings professionalId="doc1" hasRow onRowCreated={() => {}}
        initial={{ ...DEFAULT_SETTINGS, readingHours: [{ days: [1], from: "08:10", to: "18:00" }] }} reasons={[]} faq={[]} brandHref="#" />
    </NextIntlClientProvider>,
  );
  it("pt-BR: the times are 24 h selects in 15-minute steps; a stored off-grid time stays; the change is stored as HH:MM", () => {
    mount("pt-BR", pt);
    const [from, to] = screen.getAllByRole("combobox").filter((s) => (s as HTMLSelectElement).value.includes(":")) as HTMLSelectElement[];
    expect(from.value).toBe("08:10");
    expect(to.value).toBe("18:00");
    expect(to.selectedOptions[0].textContent).toBe("18:00");
    expect(document.body.textContent).not.toMatch(/AM|PM/);
    expect(Array.from(to.options).some((o) => o.value === "13:45")).toBe(true);
    fireEvent.change(to, { target: { value: "17:30" } });
    expect(to.value).toBe("17:30");
  });
  it("th: 24 h too", () => {
    mount("th", th as unknown as typeof pt);
    const to = screen.getAllByRole("combobox").find((s) => (s as HTMLSelectElement).value === "18:00") as HTMLSelectElement;
    expect(to.selectedOptions[0].textContent).toBe("18:00");
  });
});
