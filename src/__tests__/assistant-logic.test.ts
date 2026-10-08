import { describe, expect, it } from "vitest";
import { maskPersonalData } from "@/lib/assistant/mask";
import { bestArticle, createMockBackend, mockAnswer, plusMinutes } from "@/lib/assistant/mockBackend";
import { isInternalHref, webPath } from "@/lib/assistant/targets";
import type { AnswerChunk } from "@/lib/assistant/types";

describe("maskPersonalData (spec §6: identifiers are masked; names go as typed)", () => {
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

  // The app's case table (mobile __tests__/lib/solvyai.test.ts), verbatim:
  // both sides mask the same way.
  it.each([
    ["e-mail ana.souza@clinic.com.br hoje", "e-mail [email] hoje"],
    ["CPF 123.456.789-09", "CPF [cpf]"],
    ["cpf 12345678909", "cpf [cpf]"],
    ["ID 1-1017-00230-70-8", "ID [id]"],
    ["ID 1101700230708", "ID [id]"],
    ["tel +55 11 91234-5678", "tel [phone]"],
    ["tel (11) 91234-5678", "tel [phone]"],
    ["โทร 081-234-5678", "โทร [phone]"],
    ["tel 11 91234 5678", "tel [phone]"],
    ["tel 91234-5678", "tel [phone]"],
    ["tel 1191234567", "tel [phone]"],
    ["tel (11) 3456-7890", "tel [phone]"],
    ["tel 11 3456 7890", "tel [phone]"],
    ["tel 91234 5678", "tel [phone]"],
    ["tel 34567890", "tel [phone]"],
    ["tel 3456-7890", "tel [phone]"],
  ])("app parity: %j → %j", (input, out) => {
    expect(maskPersonalData(input)).toBe(out);
  });

  it("app parity: times, amounts, dates (incl. dotted) and plain numbers are left alone", () => {
    for (const s of [
      "Marca às 14h, R$ 150,00, dia 2026-09-28 ou 29/09",
      "3 consultas 1500 2000",
      "recebi 12000 em 2026",
      // The tester's case: a dotted date used to become [phone].
      "Marca dia 29.09.2026 às 10h",
      "de 01.10.2026 a 15.10.2026",
    ]) expect(maskPersonalData(s)).toBe(s);
  });
});

describe("the mock follows the spec's rules", () => {
  it("help questions are answered from the Help articles, with steps and Open screen", () => {
    expect(bestArticle("Como bloquear horário na agenda?", "pt")?.id).toBe("A3");
    const blocks = mockAnswer("Como convido minha secretária?", "pt", "/pt-BR");
    expect(blocks[0]).toMatchObject({ type: "text" });
    // The Team section of Settings (cf: the website opens the section too).
    expect(blocks.some((b) => b.type === "open" && b.href === "/pt-BR/dashboard/settings#team")).toBe(true);
    expect(blocks[blocks.length - 1]).toEqual({ type: "feedback" });
  });

  it("no Open screen for what the website doesn't have", () => {
    // C6 (the app lock) is app-only.
    const blocks = mockAnswer("How do I turn on the app lock?", "en", "");
    expect(JSON.stringify(blocks)).toMatch(/lock|bloqueio/i);
    expect(blocks.some((b) => b.type === "open")).toBe(false);
  });

  it("the CSV export is on the website now (migration 126): it gets Open", () => {
    const blocks = mockAnswer("How do I export my patient list as a CSV spreadsheet?", "en", "");
    expect(JSON.stringify(blocks)).toMatch(/CSV|planilha|spreadsheet/i);
    expect(blocks.some((b) => b.type === "open")).toBe(true);
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
    expect(card.card.secondConfirm).toBeUndefined();
    // The card carries what Confirmar runs, and where to go after.
    expect(card.card.action).toEqual({ kind: "book_appointment", args: { patientId: "p1", date: "2026-09-29", start: "14:00", durationMin: 30 } });
    expect(card.card.after).toMatchObject({ screen: "schedule", date: "2026-09-29" });
    expect(card.card.viewHref).toBe("/pt-BR/dashboard/schedule?date=2026-09-29");
  });

  it("warnings sit on the card itself", () => {
    const blocks = mockAnswer("Marca a Maria Silva amanhã às 12h", "pt", "");
    const card = blocks.find((b) => b.type === "card");
    if (!card || card.type !== "card") throw new Error("no card");
    expect(card.card.warnings.map((w) => w.code)).toEqual(["blocked"]);
    // Blocked asks a second question before saving (§2.3).
    expect(card.card.secondConfirm?.question).toBe("Este horário está bloqueado (12:00–13:00). Agendar mesmo assim?");
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

  it("the stream has the contract's shape: meta first, then usage and done", async () => {
    const backend = createMockBackend({ lang: "pt", prefix: "", limit: 20, delayMs: 0 });
    const chunks: AnswerChunk[] = [];
    for await (const c of backend.ask({ messages: [{ role: "user", text: "Qual a dose?" }], screen: "home", locale: "pt-BR" })) chunks.push(c);
    expect(chunks[0]).toEqual({ kind: "meta", mode: "actions" });
    const usage = chunks.find((c) => c.kind === "usage");
    expect(usage && usage.kind === "usage" && usage.used).toBe(1);
    expect(Number.isNaN(Date.parse(usage && usage.kind === "usage" ? usage.resetsAt : ""))).toBe(false);
  });

  it("Confirmar runs the card's action; a slot taken meanwhile is refused and answered without counting (§5a)", async () => {
    const backend = createMockBackend({ lang: "pt", prefix: "", limit: 20, delayMs: 0 });
    expect(await backend.execute({ kind: "book_appointment", args: { date: "2026-09-29", start: "14:00" } })).toMatchObject({ ok: true, demo: true });
    const failed = await backend.execute({ kind: "book_appointment", args: { date: "2026-09-29", start: "16:00" } });
    expect(failed).toEqual({ ok: false, code: "slot_taken" });
    const chunks: AnswerChunk[] = [];
    for await (const c of backend.reportConfirmFailed("slot_taken", { kind: "book_appointment", args: { date: "2026-09-29", start: "16:00" } }, "pt-BR")) chunks.push(c);
    const choice = chunks.find((c) => c.kind === "block" && c.block.type === "slot_choice");
    expect(choice && choice.kind === "block" && choice.block.type === "slot_choice" && choice.block.alternatives.map((a) => a.start)).toEqual(["16:30", "17:00"]);
    expect((await backend.usage()).used).toBe(0);
  });
});

describe("the mock checks the schedule before proposing (§2.3)", () => {
  it("the end time carries the hour (14:45 + 30 min = 15:15, not 14:75)", () => {
    expect(plusMinutes("14:45", 30)).toBe("15:15");
    expect(plusMinutes("09:30", 30)).toBe("10:00");
    const blocks = mockAnswer("Marca a Maria Silva amanhã às 14:45", "pt", "");
    const card = blocks.find((b) => b.type === "card");
    if (!card || card.type !== "card") throw new Error("no card");
    expect(card.card.fields.find((f) => f.label === "Quando")?.value).toContain("14:45–15:15");
  });

  it("a conflict: no card, the nearest free times, nothing picked", () => {
    const blocks = mockAnswer("Marca a Maria Silva amanhã às 10h", "pt", "");
    expect(blocks.some((b) => b.type === "card")).toBe(false);
    const [choice] = blocks;
    expect(choice).toMatchObject({ type: "slot_choice", reason: "conflict", other: true });
    expect(choice.type === "slot_choice" && choice.alternatives.map((a) => a.start)).toEqual(["09:30", "10:30", "11:00"]);
  });

  it("outside the working hours: a warning and a second question", () => {
    const blocks = mockAnswer("Marca a Maria Silva amanhã às 19h", "pt", "");
    const card = blocks.find((b) => b.type === "card");
    if (!card || card.type !== "card") throw new Error("no card");
    expect(card.card.warnings.map((w) => w.code)).toEqual(["outside_hours"]);
    expect(card.card.secondConfirm?.question).toBe("Este horário está fora do horário de atendimento (08:00–18:00). Agendar mesmo assim?");
  });
});

describe("links and screens", () => {
  it("screen names map to this site's paths, from a fixed table", () => {
    expect(webPath("/pt-BR", { screen: "schedule", date: "2026-09-29" }, "a1")).toBe("/pt-BR/dashboard/schedule?date=2026-09-29&highlight=a1");
    expect(webPath("", { screen: "patient", id: "p-1" })).toBe("/dashboard/patients/p-1");
    // Anything odd in an id or a date is dropped, never put in the URL.
    expect(webPath("", { screen: "patient", id: "../../x" })).toBe("/dashboard/patients");
    expect(webPath("", { screen: "schedule", date: "javascript:1" })).toBe("/dashboard/schedule");
    expect(webPath("", { screen: "whatsapp" })).toBeNull();
    // A Help article: only an article-shaped id goes in the path.
    expect(webPath("/pt-BR", { screen: "help", id: "A3" })).toBe("/pt-BR/help/a3");
    expect(webPath("", { screen: "help", id: "../x" })).toBe("/help");
  });
  it("only internal hrefs are followed", () => {
    for (const bad of ["https://evil.test", "//evil.test", "/\\evil.test", "javascript:alert(1)"]) expect(isInternalHref(bad)).toBe(false);
    expect(isInternalHref("/pt-BR/dashboard")).toBe(true);
  });
});
