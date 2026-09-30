import { describe, expect, it } from "vitest";
import { answerText } from "@/lib/assistant/answerText";
import { toWireMessages } from "@/lib/assistant/remoteBackend";
import type { AnswerBlock } from "@/lib/assistant/types";

describe("answerText: an assistant turn as history", () => {
  const pick: AnswerBlock = { type: "pick", question: "Qual paciente?", options: [{ id: "p1", title: "Maria Silva · nasc. 20/06/1992", detail: "" }, { id: "p2", title: "Maria Silva · nasc. 03/01/1985", detail: "" }] };

  it("a list with no text is its question and options", () => {
    expect(answerText([pick])).toBe("Qual paciente? Maria Silva · nasc. 20/06/1992; Maria Silva · nasc. 03/01/1985");
  });

  it("the tapped option keeps the request it answers (3e/d7: the request was lost)", () => {
    const wire = toWireMessages([
      { role: "user", text: "Marca a Maria Silva amanhã às 15h" },
      { role: "assistant", text: answerText([pick]) },
      { role: "user", text: "Maria Silva · nasc. 20/06/1992" },
    ]);
    expect(wire.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(wire[0].text).toBe("Marca a Maria Silva amanhã às 15h");
  });

  it("text, a time choice and a card each say what was shown; links and feedback say nothing", () => {
    const slot: AnswerBlock = { type: "slot_choice", reason: "conflict", text: "Quarta às 14:00 já tem Ana. Qual destes horários?", conflicts: [], alternatives: [{ date: "2026-10-07", start: "15:00" }], other: true };
    expect(answerText([slot])).toBe("Quarta às 14:00 já tem Ana. Qual destes horários?");
    expect(answerText([{ type: "text", text: "Confira os detalhes." }, { type: "card", card: { title: "Nova consulta" } } as AnswerBlock])).toBe("Confira os detalhes. Nova consulta");
    expect(answerText([{ type: "feedback" }, { type: "text", text: " " }])).toBe("");
  });
});
