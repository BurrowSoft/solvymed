import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";
import en from "@/messages/en.json";
import th from "@/messages/th.json";
import cases from "./fixtures/patient-channel-score-cases.json";

// Launch polish B, the doctor's side (01's triage of the dress rehearsal, 10-27):
// 6 the template card first on an empty page; 9 "recalculated" only when something was;
// 10 the reset says what it kept, before and after; 11 "Enviando…" on the cover;
// 12 the visible "Renomear" starts the button's name; 14 the compact save bar on phones.

const h = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    rpc: h.rpc,
    storage: { from: (bucket: string) => ({ getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cdn.test/${bucket}/${p}` } }) }) },
  }),
}));

import * as cover from "@/lib/patientChannel/cover";
import { CoverCard } from "@/app/[locale]/(site)/dashboard/settings/patient-channel/CoverCard";
import { PatientChannelSettings } from "@/app/[locale]/(site)/dashboard/settings/patient-channel/PatientChannelSettings";
import { EMPTY_RULES } from "@/lib/patientChannel/rules";
import { DEFAULT_SETTINGS } from "@/lib/patientChannel/channel";
import type { ChannelConfig } from "@/lib/patientChannel/score";

const P = pt.patientChannel;
const EXTRA = { professionalId: "doc1", channel: { settings: DEFAULT_SETTINGS, reasons: [], faq: [] }, brandHref: "/x" };
const one = (cases.config as ChannelConfig).symptoms[0];
const withSymptom: ChannelConfig = { ...EMPTY_RULES, symptoms: [{ ...one, immediateWarning: false }] };
const show = (rules: ChannelConfig, version = 2) =>
  render(
    <NextIntlClientProvider locale="pt-BR" messages={pt}>
      <PatientChannelSettings {...EXTRA} templateId="general-side-effects-br" initialRules={rules} initialVersion={version} emergencyNumber="192" />
    </NextIntlClientProvider>,
  );

describe("the approved strings (01, 10-27)", () => {
  it("pt / en / th", () => {
    expect([pt, en, th].map((m) => m.patientChannel.settings.savedOnly)).toEqual(["Regras salvas.", "Rules saved.", "บันทึกกฎแล้ว"]);
    expect([pt, en, th].map((m) => m.patientChannel.template.restored)).toEqual([
      "Modelo restaurado. Seus motivos e perguntas frequentes foram mantidos.",
      "Template restored. Your reasons and FAQ were kept.",
      "คืนค่าแม่แบบแล้ว เหตุผลและคำถามที่พบบ่อยของคุณยังคงอยู่",
    ]);
    expect(pt.patientChannel.template.confirm).toMatch(/pelo modelo\. Seus motivos e perguntas frequentes são mantidos\. Continuar\?$/);
    expect(en.patientChannel.template.confirm).toMatch(/with the template\. Your reasons and FAQ are kept\. Continue\?$/);
    expect(th.patientChannel.template.confirm).toMatch(/ด้วยแม่แบบ เหตุผลและคำถามที่พบบ่อยของคุณจะยังคงอยู่ ดำเนินการต่อหรือไม่$/);
    expect([pt, en, th].map((m) => m.patientChannel.cover.uploading)).toEqual(["Enviando…", "Uploading…", "กำลังอัปโหลด…"]);
  });
});

describe("6: an empty page starts with the template", () => {
  it("the template card comes before 'Testar como paciente'", () => {
    show(EMPTY_RULES, 0);
    const card = screen.getByTestId("pc-template-start");
    const test = screen.getByRole("button", { name: P.settings.testButton });
    expect(card.compareDocumentPosition(test) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card.compareDocumentPosition(screen.getByRole("heading", { name: P.settings.rulesTitle })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("9: the saved line", () => {
  afterEach(() => vi.unstubAllGlobals());
  const save = async (rescored: number) => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ version: 3, rescored }) })));
    show(withSymptom);
    fireEvent.click(screen.getByRole("checkbox", { name: P.symptoms.immediate, checked: false }));
    fireEvent.click(screen.getByTestId("pc-save"));
    await waitFor(() => expect(screen.getByTestId("pc-save")).toBeDisabled());
    return screen.getByRole("status").textContent;
  };
  it("nothing recalculated: just 'Regras salvas.'", async () => {
    expect(await save(0)).toBe(P.settings.savedOnly);
  });
  it("open requests recalculated: the full line", async () => {
    expect(await save(2)).toBe(P.settings.saved);
  });
});

describe("10: back to the template says what it kept", () => {
  const reload = vi.fn();
  const original = window.location;
  beforeEach(() => {
    h.rpc.mockReset();
    reload.mockReset();
    sessionStorage.clear();
    Object.defineProperty(window, "location", { configurable: true, value: { ...original, reload } });
  });
  afterEach(() => Object.defineProperty(window, "location", { configurable: true, value: original }));

  it("the confirm says the reasons and FAQ stay; after the reload the page says it was restored, once", async () => {
    h.rpc.mockResolvedValue({ data: 3, error: null });
    const first = show(withSymptom);
    fireEvent.click(screen.getByRole("button", { name: P.template.backTo }));
    expect(screen.getByText(P.template.confirm)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: P.template.replace }));
    await waitFor(() => expect(reload).toHaveBeenCalled());
    first.unmount();
    // The "reload":
    const second = show(withSymptom);
    expect(screen.getByTestId("pc-template-restored").textContent).toBe(P.template.restored);
    second.unmount();
    show(withSymptom);
    expect(screen.queryByTestId("pc-template-restored")).toBeNull();
  });

  it("a failed reset sets no line", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: "open_requests_exist" } });
    const first = show(withSymptom);
    fireEvent.click(screen.getByRole("button", { name: P.template.backTo }));
    fireEvent.click(screen.getByRole("button", { name: P.template.replace }));
    await screen.findByRole("alert");
    first.unmount();
    show(withSymptom);
    expect(screen.queryByTestId("pc-template-restored")).toBeNull();
  });
});

describe("11: the cover upload says it's sending", () => {
  it("'Usar esta imagem' turns into 'Enviando…' until it's done", async () => {
    vi.spyOn(cover, "renderCover").mockResolvedValue(new Blob(["j"], { type: "image/jpeg" }));
    let done: (p: string) => void = () => {};
    vi.spyOn(cover, "uploadCover").mockReturnValue(new Promise((r) => { done = r; }));
    URL.createObjectURL = vi.fn(() => "blob:preview");
    URL.revokeObjectURL = vi.fn();
    render(
      <NextIntlClientProvider locale="pt-BR" messages={pt}>
        <CoverCard professionalId="doc-1" initialPath={null} />
      </NextIntlClientProvider>,
    );
    fireEvent.change(screen.getByTestId("pc-cover-file"), { target: { files: [new File(["x"], "a.png", { type: "image/png" })] } });
    fireEvent.click(await screen.findByRole("button", { name: P.cover.useThis }));
    expect((await screen.findByRole("button", { name: P.cover.uploading })).hasAttribute("disabled")).toBe(true);
    done("doc-1/new.jpg");
    await waitFor(() => expect(screen.getByRole("button", { name: P.cover.change })).toBeTruthy());
  });
});

describe("12-14: the editor's small things", () => {
  it("12: the 'Renomear' button's name starts with the visible word (WCAG 2.5.3)", () => {
    show(withSymptom);
    const btn = screen.getByRole("button", { name: `${P.symptoms.rename} ${one.name}` });
    fireEvent.click(btn);
    expect(screen.getByRole("textbox", { name: P.symptoms.renameLabel.replace("{name}", one.name) })).toBeTruthy();
    expect(screen.getByRole("button", { name: P.auto.cancel }).className).toContain("whitespace-nowrap");
  });

  it("14: the save bar is compact on phones and full from sm up", () => {
    show(withSymptom);
    fireEvent.click(screen.getByRole("checkbox", { name: P.symptoms.immediate, checked: false }));
    const bar = screen.getByTestId("pc-save-bar").className.split(" ");
    expect(bar).toEqual(expect.arrayContaining(["py-1.5", "sm:py-3", "pr-20"]));
    expect(screen.getByTestId("pc-save").className.split(" ")).toEqual(expect.arrayContaining(["py-1.5", "sm:py-2"]));
  });

  it("pinned on the real bottom edge: offset by <main>'s bottom padding, nothing showing below (WT2 on #697)", () => {
    render(
      <main style={{ paddingBottom: "96px" }}>
        <NextIntlClientProvider locale="pt-BR" messages={pt}>
          <PatientChannelSettings {...EXTRA} templateId="general-side-effects-br" initialRules={withSymptom} initialVersion={2} emergencyNumber="192" />
        </NextIntlClientProvider>
      </main>,
    );
    expect(screen.getByTestId("pc-save-row").style.bottom).toBe("");
    fireEvent.click(screen.getByRole("checkbox", { name: P.symptoms.immediate, checked: false }));
    expect(screen.getByTestId("pc-save-bar").style.bottom).toBe("-96px");
    // Still clear of SolvyAI's opener (fixed bottom-5 right-5): the buttons keep the right padding.
    expect(screen.getByTestId("pc-save-bar").className.split(" ")).toEqual(expect.arrayContaining(["pr-20", "sm:pr-20"]));
  });

  it("the save bar sticks only while there's something to save; solid, never translucent (01, 10-29)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ version: 3, rescored: 0 }) })));
    show(withSymptom);
    const bar = () => screen.getByTestId("pc-save-bar");
    // Nothing changed: a plain row at the end of the form (pc-save-row, as the app), the button there but off.
    expect(screen.queryByTestId("pc-save-bar")).toBeNull();
    expect(screen.getByTestId("pc-save-row")).toHaveAttribute("data-sticky", "false");
    expect(screen.getByTestId("pc-save-row").className.split(" ")).not.toContain("sticky");
    expect(screen.getByTestId("pc-save")).toBeDisabled();
    // A change: stuck to the bottom, solid white with a border and a shadow, not bleeding past the content.
    fireEvent.click(screen.getByRole("checkbox", { name: P.symptoms.immediate, checked: false }));
    expect(bar()).toHaveAttribute("data-sticky", "true");
    const cls = bar().className.split(" ");
    expect(cls).toEqual(expect.arrayContaining(["sticky", "bottom-0", "bg-white", "border-t"]));
    expect(cls.some((c) => c.startsWith("shadow-"))).toBe(true);
    expect(cls.some((c) => c.includes("bg-white/") || c.includes("backdrop-blur") || /^-mx-|:-mx-/.test(c))).toBe(false);
    // Saved: back to the plain row.
    fireEvent.click(screen.getByTestId("pc-save"));
    await waitFor(() => expect(screen.getByTestId("pc-save-row")).toHaveAttribute("data-sticky", "false"));
    vi.unstubAllGlobals();
  });
});
