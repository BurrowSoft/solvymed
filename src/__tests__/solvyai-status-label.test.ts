import { describe, expect, it } from "vitest";
import { loadTexts } from "@/lib/assistant/server/texts";
import en from "@/messages/en.json";
import pt from "@/messages/pt-BR.json";
import th from "@/messages/th.json";

// 53 (6 Oct): SolvyAI's answers in en/th said "(scheduled)". The tools now
// give the model each status in the reader's words, the Agenda's own labels.
describe("SolvyAI status labels", () => {
  it("the Agenda's label in each language; an unknown key as it is", async () => {
    expect((await loadTexts("en")).statusLabel("scheduled")).toBe(en.schedule.statusScheduled);
    expect((await loadTexts("pt-BR")).statusLabel("confirmed")).toBe(pt.schedule.statusConfirmed);
    expect((await loadTexts("th")).statusLabel("scheduled")).toBe(th.schedule.statusScheduled);
    expect((await loadTexts("th")).statusLabel("scheduled")).not.toBe("scheduled");
    expect((await loadTexts("en")).statusLabel("weird")).toBe("weird");
  });
});
