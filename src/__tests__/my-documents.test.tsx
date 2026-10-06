import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// 1.8.0 A, the patient's side on the website (Minhas consultas →
// Documentos): the shared folders and documents of each doctor, "Corrigido
// em", sending (upload_start → the signed upload URL → upload_finish) and
// removing an own upload while the server allows it.

const h = vi.hoisted(() => ({ calls: [] as { fn: string; args: unknown[] }[], puts: [] as { path: string; token: string; type?: string }[] }));
vi.mock("@/app/[locale]/(site)/my-appointments/document-actions", () => {
  const rec = (fn: string, ret: unknown) => vi.fn(async (...args: unknown[]) => { h.calls.push({ fn, args }); return ret; });
  return {
    loadMyDocuments: vi.fn(async () => ({ ok: true, data: FOLDERS })),
    openMyDocument: rec("openMyDocument", { ok: true, data: "https://signed" }),
    startUpload: rec("startUpload", { ok: true, data: { documentId: "new1", path: "doc/pat/new1.pdf", token: "tok" } }),
    finishUpload: rec("finishUpload", { ok: true, data: null }),
    removeMyUpload: rec("removeMyUpload", { ok: true, data: null }),
  };
});
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ storage: { from: () => ({ uploadToSignedUrl: vi.fn(async (path: string, token: string, _f: File, o: { contentType?: string }) => { h.puts.push({ path, token, type: o.contentType }); return { error: null }; }) }) } }),
}));

const FOLDERS = [
  { id: "f-start", defaultKey: "start", name: null, canUpload: false, documents: [
    { id: "d1", title: "Orientações", mime: "application/pdf", sizeBytes: 4096, createdAt: "2026-10-05T10:00:00Z", corrected: true, sentByMe: false, canRemove: false },
  ] },
  { id: "f-exams", defaultKey: "exams", name: null, canUpload: true, documents: [
    { id: "d2", title: "Meu exame", mime: "image/jpeg", sizeBytes: 2048, createdAt: "2026-10-07T10:00:00Z", corrected: false, sentByMe: true, canRemove: true },
  ] },
];

import { MyDocuments } from "@/app/[locale]/(site)/my-appointments/MyDocuments";

const T = pt.docs;
const doctor = { professionalId: "00000000-0000-4000-8000-000000000001", doctor: "Dra. Ana", documentCount: 2, canUpload: true };
const view = () => render(
  <NextIntlClientProvider locale="pt-BR" messages={pt}>
    <MyDocuments doctors={[doctor]} />
  </NextIntlClientProvider>,
);
beforeEach(() => { h.calls.length = 0; h.puts.length = 0; });

describe("Minhas consultas → Documentos", () => {
  it("one doctor opens by itself: shared folders, \"Corrigido em\", the own upload with Remover and its hint", async () => {
    view();
    const start = await screen.findByRole("group", { name: T.folder.start });
    expect(within(start).getByText("Orientações")).toBeInTheDocument();
    expect(within(start).getByText(/Corrigido em/)).toBeInTheDocument();
    expect(within(start).queryByRole("button", { name: T.removeUpload })).toBeNull();
    const exams = screen.getByRole("group", { name: T.folder.exams });
    expect(within(exams).getByText(T.removeUploadHint)).toBeInTheDocument();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(within(exams).getByRole("button", { name: T.removeUpload }));
    await waitFor(() => expect(h.calls.find((c) => c.fn === "removeMyUpload")?.args).toEqual(["d2"]));
  });

  it("send: upload_start, then the file to the signed URL with its type, then upload_finish; \"Enviado para {doctor}.\"", async () => {
    view();
    await screen.findByRole("group", { name: T.folder.exams });
    fireEvent.change(screen.getByLabelText(T.upload, { selector: "input" }), { target: { files: [new File(["%PDF"], "Raio-X.pdf", { type: "application/pdf" })] } });
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText(T.titleLabel)).toHaveValue("Raio-X");
    fireEvent.click(within(dialog).getByRole("button", { name: T.upload }));
    await screen.findByText("Enviado para Dra. Ana.");
    const start = h.calls.find((c) => c.fn === "startUpload")!.args[0];
    expect(start).toEqual({ professionalId: doctor.professionalId, folderId: "f-exams", title: "Raio-X", mime: "application/pdf", size: 4 });
    expect(h.puts).toEqual([{ path: "doc/pat/new1.pdf", token: "tok", type: "application/pdf" }]);
    expect(h.calls.find((c) => c.fn === "finishUpload")?.args).toEqual(["new1"]);
  });

  it("a file the server would refuse is stopped before anything is sent", async () => {
    view();
    await screen.findByRole("group", { name: T.folder.exams });
    fireEvent.change(screen.getByLabelText(T.upload, { selector: "input" }), { target: { files: [new File(["x"], "nota.txt", { type: "text/plain" })] } });
    expect(screen.getByRole("alert")).toHaveTextContent(T.err.type);
    expect(h.calls.some((c) => c.fn === "startUpload")).toBe(false);
  });
});
