import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";
import en from "@/messages/en.json";
import th from "@/messages/th.json";
import { toMyRequests } from "@/lib/patientChannel/patientPage";
import { MyRequests } from "@/components/patientChannel/MyRequests";

// Launch polish 21 (01, 10-27): "Suas mensagens" says which symptoms the patient ticked,
// from 257's pc_my_requests `symptoms` (names from the practice's current rules). Only when
// there are some: an older function (no key), a closed practice ([]) or none ticked → no line.

const row = (extra: Record<string, unknown> = {}) => ({
  id: "r1", status: "open", reasonTitle: "Efeito colateral", option: null, text: "enjoo desde ontem",
  replyText: null, repliedAt: null, createdAt: "2026-10-27T10:00:00Z", destination: "doctor", ...extra,
});
const show = (raw: unknown[]) =>
  render(
    <NextIntlClientProvider locale="pt-BR" messages={pt}>
      <MyRequests requests={toMyRequests(raw)} timeZone="America/Sao_Paulo" country="BR" />
    </NextIntlClientProvider>,
  );

describe("the ticked symptoms (257)", () => {
  it("the approved strings", () => {
    expect([pt, en, th].map((m) => m.patientChannel.patient.youTicked)).toEqual(["Você marcou: {names}", "You ticked: {names}", "คุณเลือก: {names}"]);
  });

  it("reads the names, in order; blanks and non-strings dropped", () => {
    expect(toMyRequests([row({ symptoms: ["Náusea ou enjoo", " ", 3, "Tontura "] })])[0].symptoms).toEqual(["Náusea ou enjoo", "Tontura"]);
  });

  it.each([
    ["the older function (no key)", row()],
    ["a closed practice ([])", row({ symptoms: [] })],
    ["a non-array", row({ symptoms: "Tontura" })],
  ])("%s: no names", (_, r) => {
    expect(toMyRequests([r])[0].symptoms).toEqual([]);
  });

  it("shows 'Você marcou:' with the names on the card", () => {
    show([row({ symptoms: ["Náusea ou enjoo", "Tontura"] })]);
    expect(screen.getByTestId("pc-my-request-ticks").textContent).toBe("Você marcou: Náusea ou enjoo, Tontura");
  });

  it("no names: no line (and the rest of the card as before)", () => {
    show([row(), row({ id: "r2", symptoms: [] })]);
    expect(screen.queryByTestId("pc-my-request-ticks")).toBeNull();
    expect(screen.getByText("enjoo desde ontem")).toBeTruthy();
  });

  it("an options request with ticks shows both lines", () => {
    show([row({ option: "Renovar receita", text: "", symptoms: ["Tontura"] })]);
    expect(screen.getByText(pt.patientChannel.patient.youChose.replace("{option}", "Renovar receita"))).toBeTruthy();
    expect(screen.getByTestId("pc-my-request-ticks").textContent).toBe("Você marcou: Tontura");
  });
});
