import { describe, expect, it } from "vitest";
import { ambiguousDays } from "@/lib/assistant/server/tools";

// Rule 10a (UX 2026-09-30). Today is Tuesday 2026-09-29.
const TODAY = "2026-09-29";

describe("ambiguousDays", () => {
  it("any \"next\" form: the coming one and the one after", () => {
    for (const text of ["next Friday at 10", "próxima sexta", "Marca na sexta-feira que vem", "ศุกร์หน้า", "วันศุกร์หน้า 10 โมง", "le vendredi prochain", "nächsten Freitag", "el próximo viernes", "venerdì prossimo"]) {
      expect(ambiguousDays(text, TODAY), text).toEqual(["2026-10-02", "2026-10-09"]);
    }
    // "next Tuesday" said on a Tuesday: the one in a week and the one after.
    expect(ambiguousDays("next Tuesday", TODAY)).toEqual(["2026-10-06", "2026-10-13"]);
  });

  it("a bare weekday is the coming one, unless it's today's weekday", () => {
    expect(ambiguousDays("sexta às 10", TODAY)).toBeNull();
    expect(ambiguousDays("Friday", TODAY)).toBeNull();
    expect(ambiguousDays("ศุกร์ 10 โมง", TODAY)).toBeNull();
    expect(ambiguousDays("terça às 15h", TODAY)).toEqual(["2026-09-29", "2026-10-06"]);
    expect(ambiguousDays("Tuesday at 3pm", TODAY)).toEqual(["2026-09-29", "2026-10-06"]);
    expect(ambiguousDays("วันอังคาร บ่ายสาม", TODAY)).toEqual(["2026-09-29", "2026-10-06"]);
  });

  it("a written date or \"today\" settles it", () => {
    expect(ambiguousDays("próxima sexta, 02/10", TODAY)).toBeNull();
    expect(ambiguousDays("next Friday 2026-10-09", TODAY)).toBeNull();
    expect(ambiguousDays("hoje, terça, às 15h", TODAY)).toBeNull();
    expect(ambiguousDays("Sexta-feira, 09/10/2026", TODAY)).toBeNull();
    expect(ambiguousDays(undefined, TODAY)).toBeNull();
  });
});
