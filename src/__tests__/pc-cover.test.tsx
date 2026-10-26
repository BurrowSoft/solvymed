import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// The Patient Channel cover (246; 01's design and strings, 10-27): a 3:1 banner
// cropped in the browser, staged in brand-staging and published by brand-asset
// (kind pc_cover); previewed before it's used; public once saved; shown to the
// patient as a banner with pageBg "cover" / "both"; removed on account close.

const h = vi.hoisted(() => ({
  render: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  storageUpload: vi.fn(),
  invoke: vi.fn(),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    storage: { from: (bucket: string) => ({ upload: (...a: unknown[]) => h.storageUpload(bucket, ...a), getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cdn.test/${bucket}/${p}` } }) }) },
    functions: { invoke: h.invoke },
  }),
}));

import * as cover from "@/lib/patientChannel/cover";
import { CoverCard } from "@/app/[locale]/(site)/dashboard/settings/patient-channel/CoverCard";
import { PatientChannelFlow } from "@/components/patientChannel/PatientChannelFlow";
import { inkFor, pageLook } from "@/lib/patientChannel/pageLook";

describe("the 3:1 crop", () => {
  it("a wide picture keeps its middle third-by-one, scaled down to 1800×600", () => {
    expect(cover.coverPlacement(4000, 1000)).toEqual({ sx: 500, sy: 0, sw: 3000, sh: 1000, w: 1800, h: 600 });
  });
  it("a tall picture keeps a centred band, never scaled up", () => {
    expect(cover.coverPlacement(1000, 2000)).toEqual({ sx: 0, sy: 834, sw: 1000, sh: 333, w: 1000, h: 333 });
  });
  it("an exact 3:1 picture is used as it is", () => {
    expect(cover.coverPlacement(900, 300)).toEqual({ sx: 0, sy: 0, sw: 900, sh: 300, w: 900, h: 300 });
  });
});

describe("checks before any drawing", () => {
  it("only PNG, JPEG or WebP, at most 3 MB", async () => {
    await expect(cover.renderCover(new File(["x"], "a.gif", { type: "image/gif" }))).rejects.toMatchObject({ code: "bad_type" });
    const big = new File([new Uint8Array(3 * 1024 * 1024 + 1)], "a.png", { type: "image/png" });
    await expect(cover.renderCover(big)).rejects.toMatchObject({ code: "too_large" });
  });

  it("brand-asset's refusals map to the approved messages", () => {
    expect(cover.coverErrorCode("too_large")).toBe("too_large");
    expect(cover.coverErrorCode("not_an_image")).toBe("bad_type");
    expect(cover.coverErrorCode("pc_not_set_up")).toBe("not_set_up");
    expect(cover.coverErrorCode("not_enabled")).toBe("generic");
    expect(cover.coverErrorCode(null)).toBe("generic");
  });
});

describe("upload: staged as a JPEG, published as pc_cover", () => {
  beforeEach(() => {
    h.storageUpload.mockReset().mockResolvedValue({ error: null });
    h.invoke.mockReset();
  });
  const db = () => ({
    storage: { from: (b: string) => ({ upload: (...a: unknown[]) => h.storageUpload(b, ...a) }) },
    functions: { invoke: h.invoke },
  }) as never;

  it("brand-staging/<uid>/<uuid>.jpg, then brand-asset publish → the pc-covers path", async () => {
    h.invoke.mockResolvedValue({ data: { ok: true, path: "doc-1/new.jpg" }, error: null });
    expect(await cover.uploadCover(db(), "doc-1", new Blob(["j"], { type: "image/jpeg" }))).toBe("doc-1/new.jpg");
    const [bucket, path, , opts] = h.storageUpload.mock.calls[0];
    expect(bucket).toBe("brand-staging");
    expect(path).toMatch(/^doc-1\/[0-9a-f-]{36}\.jpg$/);
    expect(opts).toEqual({ contentType: "image/jpeg", upsert: false });
    expect(h.invoke).toHaveBeenCalledWith("brand-asset", { body: { action: "publish", kind: "pc_cover", staging_path: path } });
  });

  it("409 pc_not_set_up → its own message", async () => {
    h.invoke.mockResolvedValue({ data: null, error: { context: new Response(JSON.stringify({ error: "pc_not_set_up" }), { status: 409 }) } });
    await expect(cover.uploadCover(db(), "doc-1", new Blob(["j"]))).rejects.toMatchObject({ code: "not_set_up" });
  });

  it("remove asks brand-asset to remove kind pc_cover", async () => {
    h.invoke.mockResolvedValue({ data: { ok: true }, error: null });
    await cover.removeCover(db());
    expect(h.invoke).toHaveBeenCalledWith("brand-asset", { body: { action: "remove", kind: "pc_cover" } });
  });
});

describe("the settings card", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    h.invoke.mockReset().mockResolvedValue({ data: { ok: true }, error: null });
  });
  const show = (path: string | null) =>
    render(
      <NextIntlClientProvider locale="pt-BR" messages={pt}>
        <CoverCard professionalId="doc-1" initialPath={path} />
      </NextIntlClientProvider>,
    );

  it("no cover: the hint (public once saved) and 'Enviar imagem'", () => {
    show(null);
    expect(screen.getByText("Aparece no topo da página do seu canal. É pública depois de salva (como o logo).")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enviar imagem" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remover" })).toBeNull();
    expect(screen.queryByTestId("pc-cover-image")).toBeNull();
  });

  it("a chosen file is previewed first; 'Usar esta imagem' uploads it", async () => {
    vi.spyOn(cover, "renderCover").mockResolvedValue(new Blob(["j"], { type: "image/jpeg" }));
    const up = vi.spyOn(cover, "uploadCover").mockResolvedValue("doc-1/new.jpg");
    URL.createObjectURL = vi.fn(() => "blob:preview");
    URL.revokeObjectURL = vi.fn();
    show(null);
    fireEvent.change(screen.getByTestId("pc-cover-file"), { target: { files: [new File(["x"], "a.png", { type: "image/png" })] } });
    await waitFor(() => expect(screen.getByTestId("pc-cover-image").getAttribute("src")).toBe("blob:preview"));
    expect(up).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Usar esta imagem" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Trocar imagem" })).toBeTruthy());
    expect(up).toHaveBeenCalledWith(expect.anything(), "doc-1", expect.any(Blob));
    expect(screen.getByTestId("pc-cover-image").getAttribute("src")).toBe("https://cdn.test/pc-covers/doc-1/new.jpg");
  });

  it("a wrong file shows the approved message", async () => {
    vi.spyOn(cover, "renderCover").mockRejectedValue(new cover.CoverError("bad_type"));
    show(null);
    fireEvent.change(screen.getByTestId("pc-cover-file"), { target: { files: [new File(["x"], "a.gif", { type: "image/gif" })] } });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Use um arquivo PNG, JPEG ou WebP."));
  });

  it("Remover asks first; the error goes below the buttons", async () => {
    const rm = vi.spyOn(cover, "removeCover").mockRejectedValueOnce(new cover.CoverError("generic")).mockResolvedValueOnce();
    show("doc-1/old.jpg");
    fireEvent.click(screen.getByRole("button", { name: "Remover" }));
    expect(screen.getByText("Remover a imagem de capa?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remover" }));
    const alert = await screen.findByRole("alert");
    const buttons = screen.getAllByRole("button");
    expect(buttons[buttons.length - 1].compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remover" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Enviar imagem" })).toBeTruthy());
    expect(rm).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId("pc-cover-image")).toBeNull();
  });
});

describe("the patient's channel page", () => {
  const page = {
    doctorName: "Dra. Ana", practiceLine: "Clínica Sol", emergencyNumber: "192", slaBusinessDays: 2, welcome: "",
    reasons: [], faq: [], vocabulary: { symptoms: [], medicines: [] },
  };
  const show = (extra: object) =>
    render(
      <NextIntlClientProvider locale="pt-BR" messages={pt}>
        <PatientChannelFlow page={{ ...page, ...extra }} preview={vi.fn()} submit={vi.fn()} onSelfServe={vi.fn()} loadRequests={vi.fn().mockResolvedValue([])} />
      </NextIntlClientProvider>,
    );

  const LOGO = "https://cdn.test/brand-assets/doc-1/logo.png";
  const COVER = "https://cdn.test/pc-covers/doc-1/c.jpg";
  const look = (bg: string, o: { logo?: boolean; cover?: boolean; color?: string } = {}) =>
    pageLook(bg, { color: o.color ?? "#7C3AED", logoUrl: o.logo ? LOGO : null, coverUrl: o.cover ? COVER : null, coverAlt: "Clínica Sol" });

  it("'cover' with an image: the 3:1 band on top, the practice name as its text, the logo over its edge", () => {
    show({ look: look("cover", { cover: true, logo: true }) });
    const img = screen.getByTestId("pc-cover");
    expect(img.getAttribute("alt")).toBe("Clínica Sol");
    expect(screen.getByTestId("pc-band").className).toContain("aspect-[3/1]");
    expect(screen.queryByTestId("pc-watermark")).toBeNull();
  });

  it("'cover' with no image: a shorter strip in the brand colour", () => {
    show({ look: look("cover") });
    expect(screen.queryByTestId("pc-cover")).toBeNull();
    expect(screen.getByTestId("pc-band").className).toContain("h-[86px]");
  });

  it("'both': band + the logo watermark; 'watermark': the watermark alone; neither without a logo", () => {
    const { unmount } = show({ look: look("both", { logo: true, cover: true }) });
    expect(screen.getByTestId("pc-band")).toBeTruthy();
    expect(screen.getByTestId("pc-watermark").getAttribute("style")).toContain("logo.png");
    unmount();
    const w = show({ look: look("watermark", { logo: true, cover: true }) });
    expect(screen.queryByTestId("pc-band")).toBeNull();
    expect(screen.queryByTestId("pc-cover")).toBeNull();
    expect(screen.getByTestId("pc-watermark")).toBeTruthy();
    w.unmount();
    show({ look: look("watermark") });
    expect(screen.queryByTestId("pc-watermark")).toBeNull();
  });

  it("'plain' and no look: today's page, no band, no watermark", () => {
    const { unmount } = show({ look: look("plain", { logo: true, cover: true }) });
    expect(screen.queryByTestId("pc-band")).toBeNull();
    expect(screen.queryByTestId("pc-watermark")).toBeNull();
    unmount();
    show({});
    expect(screen.queryByTestId("pc-band")).toBeNull();
  });

  it("the brand colour fills the main button, with readable ink", () => {
    show({ look: look("plain", { color: "#FDE68A" }) });
    const vars = screen.getByTestId("pc-page").getAttribute("style") ?? "";
    expect(vars).toContain("--pc-brand: #FDE68A");
    expect(vars).toContain("--pc-ink: #13232E");
    expect(screen.getByTestId("pc-start").className).toContain("bg-[var(--pc-brand)]");
  });
});

describe("pageLook", () => {
  it("the prototype's ink: dark on light colours, white on dark ones", () => {
    expect(inkFor("#FFFFFF")).toBe("#13232E");
    expect(inkFor("#FDE68A")).toBe("#13232E");
    expect(inkFor("#116E99")).toBe("#FFFFFF");
    expect(inkFor("#1F2937")).toBe("#FFFFFF");
  });
  it("no valid brand colour → SolvyMed blue; an unknown background → 'both' (the default)", () => {
    expect(pageLook("cover", { color: "red" }).color).toBe("#116e99");
    expect(pageLook("nonsense", { logoUrl: "x" })).toMatchObject({ band: true, watermark: true });
    expect(pageLook("watermark", { coverUrl: "c" }).coverUrl).toBeNull();
  });
});

describe("account close", () => {
  it("removes the professional's pc-covers/<uid>/ like the other image buckets", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync("src/app/api/account/close/route.ts", "utf8");
    expect(src).toMatch(/PROFESSIONAL_IMAGE_BUCKETS = \[[^\]]*"pc-covers"[^\]]*\]/);
  });
});

describe("Testar como paciente shows the page as patients see it (01)", () => {
  it("the saved band, cover and logo frame the test form; the send button in the brand colour", async () => {
    const { PatientChannelTest } = await import("@/app/[locale]/(site)/dashboard/settings/patient-channel/PatientChannelTest");
    const { EMPTY_RULES } = await import("@/lib/patientChannel/rules");
    const look = pageLook("both", { color: "#7C3AED", logoUrl: "https://cdn.test/logo.png", coverUrl: "https://cdn.test/pc-covers/c.jpg", coverAlt: "Clínica Sol" });
    render(
      <NextIntlClientProvider locale="pt-BR" messages={pt}>
        <PatientChannelTest rules={{ ...EMPTY_RULES, country: "BR" }} emergencyNumber="192" onBack={vi.fn()} patientView={{ doctorName: "Dra. Ana", practiceLine: "Clínica Sol", look }} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId("pc-test-page").getAttribute("style")).toContain("--pc-brand: #7C3AED");
    expect(screen.getByTestId("pc-cover").getAttribute("alt")).toBe("Clínica Sol");
    expect(screen.getByTestId("pc-watermark")).toBeTruthy();
    expect(screen.getByText("Dra. Ana")).toBeTruthy();
  });
});
