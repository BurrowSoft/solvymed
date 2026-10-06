import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// Configurações → Minha marca (1.5.0, behind liveFeatures.myBrand; e7's
// screen): the fields go to save_my_brand; the square logo, the wide logo
// and the photo are separate uploads, each staged then published by the
// brand-asset function; Remover (after a confirmation) only for own images.

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  upload: vi.fn(),
  invoke: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/navigation", async (orig) => ({
  ...(await orig<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn(), refresh: h.refresh }),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    rpc: h.rpc,
    storage: { from: () => ({ upload: h.upload }) },
    functions: { invoke: h.invoke },
  }),
}));
// Canvas isn't in jsdom: the shaping is tested in brand-image.test.
vi.mock("@/lib/brandImage", async (orig) => ({
  ...(await orig<typeof import("@/lib/brandImage")>()),
  renderBrandImage: vi.fn(async () => new Blob(["png"], { type: "image/png" })),
}));

import { BrandCard } from "@/app/[locale]/(site)/dashboard/settings/BrandCard";
import type { Brand } from "@/lib/brand";

const t = pt.brand;

// 1.8.0 G: a picked image goes through the crop first. jsdom decodes no
// images and has no canvas: a stand-in Image (1200×400) and canvas.
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 1200;
  naturalHeight = 400;
  set src(_v: string) { setTimeout(() => this.onload?.(), 0); }
}
vi.stubGlobal("Image", FakeImage);
URL.createObjectURL = vi.fn(() => "blob:picked");
URL.revokeObjectURL = vi.fn();
HTMLCanvasElement.prototype.getContext = (() => ({ fillRect: () => {}, drawImage: () => {}, set fillStyle(_v: string) {}, set imageSmoothingQuality(_v: string) {} })) as never;
HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback, type?: string) { cb(new Blob(["x"], { type: type ?? "image/png" })); };

// Picks a file and confirms the crop as it opens ("Usar imagem").
async function pickAndUse(testid: string, file: File) {
  fireEvent.change(screen.getByTestId(testid).querySelector("input[type=file]") as HTMLInputElement, { target: { files: [file] } });
  const dialog = await screen.findByTestId("brand-crop");
  const use = within(dialog).getByRole("button", { name: pt.brandCrop.use });
  await waitFor(() => expect(use).not.toBeDisabled());
  fireEvent.click(use);
}
const show = (brand: Brand | null = null) =>
  render(
    <NextIntlClientProvider locale="pt-BR" messages={pt}>
      <BrandCard uid="u-1" brand={brand} fallback={{ fullName: "Ana Souza", specialty: "Dermatologia", registration: "CRM 1/SP" }} />
    </NextIntlClientProvider>,
  );

beforeEach(() => {
  h.rpc.mockReset().mockResolvedValue({ data: null, error: null });
  h.upload.mockReset().mockResolvedValue({ data: {}, error: null });
  h.invoke.mockReset().mockResolvedValue({ data: { path: "u-1/x.png" }, error: null });
  h.refresh.mockReset();
});

describe("Minha marca", () => {
  it("saves the fields and the chosen preset through save_my_brand", async () => {
    show();
    fireEvent.change(screen.getByLabelText(t.titleLabel), { target: { value: "Dra." } });
    fireEvent.change(screen.getByLabelText(t.displayName), { target: { value: "Ana Souza " } });
    fireEvent.click(screen.getByRole("radio", { name: "#7c3aed" }));
    fireEvent.click(screen.getByRole("button", { name: t.save }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(t.saved));
    expect(h.rpc).toHaveBeenCalledWith("save_my_brand", {
      p_display_name: "Ana Souza", p_title: "Dra.", p_specialty: "", p_registration_line: "", p_accent_color: "#7c3aed",
    });
  });

  it("text typed before hydration (no events) is kept and saved; typing updates the preview", async () => {
    show();
    (document.getElementById("brand-specialty") as HTMLInputElement).value = "Pediatria"; // no event, as autofill
    fireEvent.input(screen.getByLabelText(t.displayName), { target: { value: "Bia Lima" } });
    expect(screen.getByTestId("brand-preview-light")).toHaveTextContent("Bia Lima");
    fireEvent.click(screen.getByRole("button", { name: t.save }));
    await waitFor(() => expect(h.rpc).toHaveBeenCalled());
    expect(h.rpc.mock.calls[0][1]).toMatchObject({ p_display_name: "Bia Lima", p_specialty: "Pediatria" });
    expect((document.getElementById("brand-specialty") as HTMLInputElement).value).toBe("Pediatria");
  });

  it("never saved: the fields are empty (the profile only as placeholders); Save doesn't copy the profile in (d7)", async () => {
    // get_practice_brand's fallbacks (the profile's own) come in `brand`; no raw row.
    render(
      <NextIntlClientProvider locale="pt-BR" messages={pt}>
        <BrandCard uid="u-1" values={null}
          brand={{ displayName: "Ana Souza", title: "", specialty: "Dermatologia", registrationLine: "CRM 1/SP", accentColor: null, logoSquareUrl: null, logoWideUrl: null, photoUrl: null, own: { logo_square: false, logo_wide: false, photo: false }, saved: false }}
          fallback={{ fullName: "Ana Souza", specialty: "Dermatologia", registration: "CRM 1/SP" }} />
      </NextIntlClientProvider>,
    );
    const name = screen.getByLabelText(t.displayName) as HTMLInputElement;
    expect(name.value).toBe("");
    expect(name.placeholder).toBe("Ana Souza");
    expect((screen.getByLabelText(t.specialty) as HTMLInputElement).value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: t.save }));
    await waitFor(() => expect(h.rpc).toHaveBeenCalled());
    expect(h.rpc.mock.calls[0][1]).toMatchObject({ p_display_name: "", p_specialty: "", p_registration_line: "" });
  });

  it("the saved values couldn't be read: an error and no Save (it would wipe them; 9a)", () => {
    render(
      <NextIntlClientProvider locale="pt-BR" messages={pt}>
        <BrandCard uid="u-1" brand={null} values={null} valuesFailed
          fallback={{ fullName: "Ana Souza", specialty: "", registration: "" }} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId("brand-load-error")).toHaveTextContent(pt.settings.loadError);
    expect(screen.getByRole("button", { name: t.save })).toBeDisabled();
  });

  it("saved values (the raw row) fill the fields", () => {
    render(
      <NextIntlClientProvider locale="pt-BR" messages={pt}>
        <BrandCard uid="u-1" brand={null} values={{ display_name: "Ana S.", title: "Dra.", specialty: null, registration_line: "CRM 9", accent_color: "#7c3aed" }}
          fallback={{ fullName: "Ana Souza", specialty: "Dermatologia", registration: "CRM 1/SP" }} />
      </NextIntlClientProvider>,
    );
    expect((screen.getByLabelText(t.displayName) as HTMLInputElement).value).toBe("Ana S.");
    expect((screen.getByLabelText(t.titleLabel) as HTMLInputElement).value).toBe("Dra.");
    expect((screen.getByLabelText(t.specialty) as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("radio", { name: "#7c3aed" })).toHaveAttribute("aria-checked", "true");
  });

  it("the default blue is saved as no colour (the app's default)", async () => {
    show({ displayName: "", title: "", specialty: "", registrationLine: "", accentColor: "#dc2626", logoSquareUrl: null, logoWideUrl: null, photoUrl: null, own: { logo_square: false, logo_wide: false, photo: false }, saved: true });
    fireEvent.click(screen.getByRole("radio", { name: "#116e99" }));
    fireEvent.click(screen.getByRole("button", { name: t.save }));
    await waitFor(() => expect(h.rpc).toHaveBeenCalled());
    expect(h.rpc.mock.calls[0][1].p_accent_color).toBe("");
  });

  it("a colour too light for text says how it's shown", () => {
    show();
    expect(screen.queryByTestId("accent-adjusted")).toBeNull();
    fireEvent.change(screen.getByLabelText(t.accentCustom), { target: { value: "#ffff00" } });
    expect(screen.getByTestId("accent-adjusted")).toHaveTextContent(t.accentAdjusted);
  });

  it("the preview shows the profile's name and specialty when fields are empty", () => {
    show();
    expect(screen.getByTestId("brand-preview-light")).toHaveTextContent("Ana Souza");
    expect(screen.getByTestId("brand-preview-light")).toHaveTextContent("Dermatologia");
    expect(screen.getByTestId("brand-preview-light")).toHaveTextContent("AS");
  });

  it.each([["brand-logo-square", "logo_square"], ["brand-logo-wide", "logo_wide"], ["brand-photo", "photo"]])(
    "%s: one upload, staged then published as %s",
    async (testid, kind) => {
      show();
      await pickAndUse(testid, new File(["x"], "img.png", { type: "image/png" }));
      await waitFor(() => expect(h.refresh).toHaveBeenCalled());
      expect(h.upload).toHaveBeenCalledTimes(1);
      // Staged as the pipeline's PNG, whatever the crop's format.
      expect(h.upload.mock.calls[0][0]).toMatch(/^u-1\/[0-9a-f-]+\.png$/);
      expect(h.invoke).toHaveBeenCalledWith("brand-asset", { body: { action: "publish", kind, staging_path: h.upload.mock.calls[0][0] } });
    },
  );

  it("the 8 presets (e7, the same as the app)", () => {
    show();
    expect(screen.getAllByRole("radio").map((r) => r.getAttribute("aria-label"))).toEqual(["#116e99", "#0d9488", "#7c3aed", "#db2777", "#dc2626", "#ea580c", "#16a34a", "#334155"]);
  });

  it("a non-image is refused before any upload", async () => {
    show();
    const input = screen.getByTestId("brand-photo").querySelector("input[type=file]") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "a.gif", { type: "image/gif" })] } });
    expect(await screen.findByRole("alert")).toHaveTextContent(t.badType);
    expect(h.upload).not.toHaveBeenCalled();
  });

  it("Remover asks first; Cancelar keeps the image, Remover removes it", async () => {
    show({ displayName: "", title: "", specialty: "", registrationLine: "", accentColor: null, logoSquareUrl: null, logoWideUrl: null, photoUrl: "https://x/p.png", own: { logo_square: false, logo_wide: false, photo: true }, saved: true });
    const photo = screen.getByTestId("brand-photo");
    fireEvent.click(within(photo).getByRole("button", { name: t.remove }));
    expect(screen.getByTestId("brand-photo-remove")).toHaveTextContent(t.removeTitle);
    fireEvent.click(within(photo).getByRole("button", { name: t.cancel }));
    expect(screen.queryByTestId("brand-photo-remove")).toBeNull();
    expect(h.invoke).not.toHaveBeenCalled();
    fireEvent.click(within(photo).getByRole("button", { name: t.remove }));
    fireEvent.click(within(screen.getByTestId("brand-photo-remove")).getByRole("button", { name: t.removeConfirm }));
    await waitFor(() => expect(h.invoke).toHaveBeenCalledWith("brand-asset", { body: { action: "remove", kind: "photo" } }));
  });

  it("over 5 MB is refused before any upload", async () => {
    show();
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.png", { type: "image/png" });
    fireEvent.change(screen.getByTestId("brand-logo-square").querySelector("input[type=file]")!, { target: { files: [big] } });
    expect(await screen.findByRole("alert")).toHaveTextContent(t.tooLarge);
    expect(h.upload).not.toHaveBeenCalled();
  });

  it("the function's too_large refusal shows the size message", async () => {
    h.invoke.mockResolvedValue({ data: null, error: { context: new Response(JSON.stringify({ error: "too_large" }), { status: 400 }) } });
    show();
    await pickAndUse("brand-photo", new File(["x"], "p.jpg", { type: "image/jpeg" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(t.tooLarge);
  });

  it("Remover only for the doctor's own images (not a legacy one)", () => {
    show({ displayName: "", title: "", specialty: "", registrationLine: "", accentColor: null, logoSquareUrl: "https://x/legacy.png", logoWideUrl: null, photoUrl: "https://x/p.png", own: { logo_square: false, logo_wide: false, photo: true }, saved: true });
    expect(screen.getByTestId("brand-logo-square")).not.toHaveTextContent(t.remove);
    expect(screen.getByTestId("brand-photo")).toHaveTextContent(t.remove);
  });

  it("1.8.0 G: the crop opens first; Cancel uploads nothing; a small crop warns; Ajustar re-opens it", async () => {
    show();
    fireEvent.change(screen.getByTestId("brand-logo-wide").querySelector("input[type=file]") as HTMLInputElement, { target: { files: [new File(["x"], "w.png", { type: "image/png" })] } });
    const dialog = await screen.findByTestId("brand-crop");
    expect(dialog).toHaveTextContent(pt.brandCrop.title);
    fireEvent.click(within(dialog).getByRole("button", { name: t.cancel }));
    expect(screen.queryByTestId("brand-crop")).toBeNull();
    expect(h.upload).not.toHaveBeenCalled();
  });

  it("1.8.0 G: picking a second kind keeps the first's original; Ajustar opens that one (c6)", async () => {
    let n = 0;
    vi.mocked(URL.createObjectURL).mockImplementation(() => `blob:pick-${++n}`);
    vi.mocked(URL.revokeObjectURL).mockClear();
    // Ajustar shows next to a saved image (the page's refresh brings the new URL).
    show({ displayName: "", title: "", specialty: "", registrationLine: "", accentColor: null, logoSquareUrl: "https://x/sq.png", logoWideUrl: "https://x/w.png", photoUrl: null, own: { logo_square: true, logo_wide: true, photo: false }, saved: true });
    await pickAndUse("brand-logo-square", new File(["x"], "sq.png", { type: "image/png" }));
    await waitFor(() => expect(h.refresh).toHaveBeenCalledTimes(1));
    await pickAndUse("brand-logo-wide", new File(["x"], "w.png", { type: "image/png" }));
    await waitFor(() => expect(h.refresh).toHaveBeenCalledTimes(2));
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith("blob:pick-1");
    fireEvent.click(screen.getByTestId("brand-logo-square-adjust"));
    const dialog = await screen.findByTestId("brand-crop");
    expect(dialog.querySelector("img")).toHaveAttribute("src", "blob:pick-1");
    vi.mocked(URL.createObjectURL).mockImplementation(() => "blob:picked");
  });
});
