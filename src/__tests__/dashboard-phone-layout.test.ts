import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Vitor 10-23 (412 px): the home's cards ran off the right edge and the
// greeting was squeezed beside "Enviar para Pacientes".
const page = readFileSync(resolve(__dirname, "../app/[locale]/(site)/dashboard/(gated)/page.tsx"), "utf8");

describe("the dashboard home on phones", () => {
  it("the greeting stacks above its buttons below sm", () => {
    expect(page).toContain(`className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4"`);
    expect(page).toContain(`<div data-tour="home" className="min-w-0">`);
  });

  it("the schedule cards can't grow past the screen; their rows wrap", () => {
    expect(page).toContain(`className="grid grid-cols-1 gap-6 lg:grid-cols-2 mb-8"`);
    expect(page.split(`className="min-w-0 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-6"`).length - 1).toBe(2);
    expect(page.split("flex flex-wrap items-center gap-x-3 gap-y-1.5").length - 1).toBe(2);
  });

  it("the unpaid-sessions card stacks its button under the text below sm", () => {
    expect(page).toContain(`<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">`);
  });

  it("the setup card: the title on its own line below sm, the counter never wraps", () => {
    const setup = readFileSync(resolve(__dirname, "../components/SetupChecklist.tsx"), "utf8");
    expect(setup).toContain(`basis-full text-base font-bold text-slate-900 sm:basis-auto`);
    expect(setup).toContain(`<span className="whitespace-nowrap text-sm text-slate-500">{t("progress", { done })}</span>`);
  });
});
