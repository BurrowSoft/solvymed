// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import type { Design } from "@/lib/studio/design";

// Document Studio: the signature image (02, 10-13, option A). It appears
// ONLY on the patient's copy made when a document is issued; every
// on-demand render (a re-share after an edit, print, download) shows the
// typed stamp only, even with studio_signature_image on and an image saved.

const FIX = join(process.cwd(), "src", "__tests__", "fixtures", "studio");
const read = (p: string) => new Uint8Array(readFileSync(join(process.cwd(), "public", p)));
const design = (): Design => ({ ...JSON.parse(readFileSync(join(FIX, "designs", "classic.json"), "utf8")), signature: { stamp: true, image: true, imagePath: "u1/signature.png" } });

function signaturePng(): Uint8Array {
  const png = new PNG({ width: 120, height: 40 });
  for (let i = 0; i < png.data.length; i += 4) { png.data[i] = 20; png.data[i + 1] = 20; png.data[i + 2] = 60; png.data[i + 3] = (i / 4) % 7 === 0 ? 255 : 0; }
  return new Uint8Array(PNG.sync.write(png));
}

// The patient's copy of a prescription: only an issued one reads the image.
const sigBytes = vi.fn(async () => signaturePng());
const rendered: { signatureImage?: Uint8Array | null }[] = [];
vi.mock("@/lib/studio/signature", () => ({ signatureBytes: (...a: unknown[]) => sigBytes(...(a as [])) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("@/lib/shareSnapshot", () => ({ shareSnapshot: async () => "shared" }));
vi.mock("@/lib/pdf/fonts", async (orig) => ({ ...(await orig<typeof import("@/lib/pdf/fonts")>()), loadDesignFontBytes: async () => ({ regular: new Uint8Array(), bold: new Uint8Array() }) }));
vi.mock("@/lib/pdf/designed", async (orig) => ({
  ...(await orig<typeof import("@/lib/pdf/designed")>()),
  renderDesignedDocument: async (input: { signatureImage?: Uint8Array | null }) => { rendered.push(input); return new Uint8Array([1]); },
}));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/snapshot-actions", () => ({
  prescriptionSnapshotData: async () => ({
    ok: true,
    data: {
      iso: "2026-10-12", date: "12/10/2026", patientName: "B", items: [{ name: "X", dosage: "", frequency: "", duration: "" }], notes: null,
      studio: { design: design(), practice: { displayName: "D", specialty: null, registrationLine: null, clinicName: null, locations: [] }, logos: { square: null, wide: null, reversed: null }, texts: { header: null, footer: null }, signaturePath: "u1/signature.png" },
    },
  }),
}));

// The special control prescription: its fixed legal layout, never the image
// (and the Thai receipt is the app's legal one: the website makes none).
const controlled = vi.fn(async () => new Uint8Array([2]));
vi.mock("@/lib/pdf/controlledPrescription", () => ({ renderControlledPrescriptionPdf: (...a: unknown[]) => controlled(...(a as [])) }));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/medical-documents-actions", () => ({
  createMedicalDocument: vi.fn(), updateMedicalDocument: vi.fn(), correctMedicalDocument: vi.fn(),
  documentPrintData: async () => ({
    ok: true,
    data: {
      fontId: "sarabun", template: { primaryColor: "#000000", logoUrl: null }, brand: null, idKind: "cpf", locationLines: [],
      patient: { name: "B", cpf: "12345678909", passport: null, thId: null },
      doctor: { name: "D", registration: "CRM 1/SP", state: "SP", address: "", city: "", phone: null, clinicName: null },
      studio: { design: design(), practice: { displayName: "D", specialty: null, registrationLine: null, clinicName: null, locations: [] }, logos: { square: null, wide: null, reversed: null }, texts: { header: null, footer: null }, signaturePath: "u1/signature.png" },
    },
  }),
}));

// The renderers' modules, imported once before the tests: the first import
// is slow when the whole suite loads the machine (it passed 60 s inside the
// first test on 10-15, as saved-once did); the tests reuse the cache.
beforeAll(async () => {
  await Promise.all([
    import("@/app/[locale]/(site)/dashboard/(gated)/patients/[id]/MedicalDocuments"),
    import("@/app/[locale]/(site)/dashboard/(gated)/patients/[id]/snapshots"),
  ]);
}, 180_000);

describe("legal layouts never take the image", () => {
  it("the special control prescription, issued with the flag on and an image saved: no image read", async () => {
    sigBytes.mockClear();
    const { makeDocumentPdf } = await import("@/app/[locale]/(site)/dashboard/(gated)/patients/[id]/MedicalDocuments");
    const r = await makeDocumentPdf("p", { id: "d", doc_type: "controlled_prescription", language: "pt-BR", fields: { items: [] }, body: null, created_at: "2026-10-12T12:00:00Z" } as never, { footer: "F", unsignedCopy: "U", imageCopy: "I", demoFooter: "DEMO" }, { withSignature: true });
    expect(r.ok).toBe(true);
    expect(controlled).toHaveBeenCalledTimes(1);
    expect(sigBytes).not.toHaveBeenCalled();
  }, 60_000);
});

describe("the patient's copy of a prescription", () => {
  beforeEach(() => { sigBytes.mockClear(); rendered.length = 0; });
  const labels = { title: "Receita", patient: "P", date: "D", medications: "M", medication: "M", dosage: "D", frequency: "F", duration: "D", notes: "N", footer: "F", corrected: "C", unsignedCopy: "U", imageCopy: "I" };

  it("issued now (new / correction): the image is read and embedded", async () => {
    const { shareRxSnapshot } = await import("@/app/[locale]/(site)/dashboard/(gated)/patients/[id]/snapshots");
    expect(await shareRxSnapshot({ doctorId: "u1", patientId: "p", rxId: "r", correctsId: null, locale: "pt-BR", labels, title: () => "t", issued: true })).toBe("shared");
    expect(sigBytes).toHaveBeenCalledTimes(1);
    expect(rendered[0].signatureImage).toBeInstanceOf(Uint8Array);
    expect((rendered[0] as { doc?: { imageCopyLine?: string | null } }).doc?.imageCopyLine).toBe("I");
  }, 60_000);

  it("a re-share (an edit): no image, even with the flag on and an image saved", async () => {
    const { shareRxSnapshot } = await import("@/app/[locale]/(site)/dashboard/(gated)/patients/[id]/snapshots");
    expect(await shareRxSnapshot({ doctorId: "u1", patientId: "p", rxId: "r", correctsId: "r", locale: "pt-BR", labels, title: () => "t", issued: false })).toBe("shared");
    expect(sigBytes).not.toHaveBeenCalled();
    expect(rendered[0].signatureImage ?? null).toBeNull();
    expect((rendered[0] as { doc?: { imageCopyLine?: string | null } }).doc?.imageCopyLine ?? null).toBeNull();
  }, 60_000);
});

