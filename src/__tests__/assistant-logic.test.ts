import { describe, expect, it } from "vitest";
import { maskPersonalData } from "@/lib/assistant/mask";
import { bestArticle, createMockBackend, mockAnswer } from "@/lib/assistant/mockBackend";
import type { AnswerChunk } from "@/lib/assistant/types";

describe("maskPersonalData (spec §6: v1 sends no personal data)", () => {
  it.each([
    ["O CPF 123.456.789-09 não aparece", "O CPF [cpf] não aparece"],
    ["cpf 12345678909", "cpf [cpf]"],
    ["Thai ID 1-1017-00207-03-0 please", "Thai ID [id] please"],
    ["id 1101700207030", "id [id]"],
    ["ligue (11) 98765-4321", "ligue [phone]"],
    ["call +66 81 234 5678", "call [phone]"],
    ["email maria.silva@gmail.com ok", "email [email] ok"],
  ])("%j → %j", (input, out) => {
    expect(maskPersonalData(input)).toBe(out);
  });

  it("leaves ordinary questions alone (times, dates, amounts)", () => {
    const q = "Marca a Maria amanhã às 14h, 30 min, R$ 150";
    expect(maskPersonalData(q)).toBe(q);
  });
});

describe("the mock follows the spec's rules", () => {
  it("help questions are answered from the Help articles, with steps and Open screen", () => {
    expect(bestArticle("Como bloquear horário na agenda?", "pt")?.id).toBe("A3");
    const blocks = mockAnswer("Como convido minha secretária?", "pt", "/pt-BR");
    expect(blocks[0]).toMatchObject({ type: "text" });
    expect(blocks.some((b) => b.type === "open" && b.href === "/pt-BR/dashboard/settings")).toBe(true);
    expect(blocks[blocks.length - 1]).toEqual({ type: "feedback" });
  });

  it("no Open screen for what the website doesn't have", () => {
    const blocks = mockAnswer("How do I upload exams and files?", "en", "");
    expect(blocks.some((b) => b.type === "open")).toBe(false);
  });

  it("a missing time is asked for, never picked (rule 3)", () => {
    expect(mockAnswer("Marca a Maria Silva amanhã", "pt", "")).toEqual([{ type: "text", text: "Para que horário?" }]);
  });

  it("an ambiguous patient gets a pick list (rule 4)", () => {
    const [b] = mockAnswer("marca a maria amanhã às 14h", "pt", "");
    expect(b.type).toBe("pick");
  });

  it("an action comes back as a card with defaults labelled (rules 1, 5), nothing saved", () => {
    const blocks = mockAnswer("Marca a Maria Silva amanhã às 14h", "pt", "/pt-BR");
    const card = blocks.find((b) => b.type === "card");
    if (!card || card.type !== "card") throw new Error("no card");
    expect(card.card.fields.find((f) => f.label === "Paciente")?.value).toContain("12/03/1985");
    expect(card.card.fields.filter((f) => f.isDefault).map((f) => f.label)).toEqual(["Duração", "Procedimento", "Valor", "Onde"]);
    expect(card.card.warnings).toEqual([]);
  });

  it("warnings sit on the card itself", () => {
    const blocks = mockAnswer("Marca a Maria Silva amanhã às 12h", "pt", "");
    const card = blocks.find((b) => b.type === "card");
    expect(card && card.type === "card" && card.card.warnings[0]).toContain("bloqueado");
  });

  it("clinical and off-topic questions get the fixed replies", () => {
    expect(mockAnswer("Qual a dose de dipirona?", "pt", "")).toEqual([{ type: "text", text: "Não posso ajudar com questões clínicas." }]);
    expect(mockAnswer("Who won the football match?", "en", "")).toEqual([{ type: "text", text: "I can only help with SolvyMed." }]);
  });
});

describe("the mock backend", () => {
  it("streams text word by word, then the other blocks, then done; counts the message", async () => {
    const backend = createMockBackend({ lang: "pt", prefix: "", limit: 20, delayMs: 0 });
    const chunks: AnswerChunk[] = [];
    for await (const c of backend.ask({ messages: [{ role: "user", text: "Qual a dose?" }], screen: "home", locale: "pt-BR" })) chunks.push(c);
    expect(chunks.filter((c) => c.kind === "delta").map((c) => (c.kind === "delta" ? c.text : "")).join("")).toBe("Não posso ajudar com questões clínicas.");
    expect(chunks[chunks.length - 1]).toEqual({ kind: "done" });
    expect((await backend.usage()).used).toBe(1);
  });

  it("Confirmar is re-checked: a blocked slot is refused (rule 10)", async () => {
    const backend = createMockBackend({ lang: "pt", prefix: "", limit: 20, delayMs: 0 });
    expect(await backend.confirm("appt-1400")).toEqual({ ok: true });
    expect(await backend.confirm("appt-1200")).toEqual({ ok: false, reason: "blocked" });
  });
});
