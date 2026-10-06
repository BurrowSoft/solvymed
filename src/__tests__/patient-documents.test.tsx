import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";
import { accessKindLabelKey } from "@/lib/accessLog";
import { canDeleteOwn, docErrorKey, docMime, docPath, defaultTitle, type DocFolder, type PatientDocument } from "@/lib/patientDocuments";

// 1.8.0 A, the doctor's side on the website (190; flag 'patient_documents'):
// the path 190 accepts, the real-format list, the error mapping, the
// Documents tab (folders, shared / only you, Internal, upload = storage then
// register) and the access-log labels for the new kinds.

const h = vi.hoisted(() => ({ calls: [] as { fn: string; args: unknown[] }[], uploads: [] as { path: string; type?: string }[] }));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/documents-actions", () => {
  const rec = (fn: string, ret: unknown = { ok: true, data: null }) => vi.fn(async (...args: unknown[]) => { h.calls.push({ fn, args }); return ret; });
  return {
    loadPatientDocuments: vi.fn(async () => ({ ok: true, data: { folders: FOLDERS, documents: DOCS } })),
    registerDocument: rec("registerDocument", { ok: true, data: "d9" }),
    setDocumentShared: rec("setDocumentShared"),
    moveDocument: rec("moveDocument"),
    renameDocument: rec("renameDocument"),
    openDocument: rec("openDocument", { ok: true, data: "https://signed" }),
    deleteOwnDocument: rec("deleteOwnDocument"),
    hideDocument: rec("hideDocument"),
    loadFolders: vi.fn(async () => ({ ok: true, data: { folders: FOLDERS, usedBytes: 0, limitBytes: 1 } })),
    countFolderShared: vi.fn(async () => 1),
    saveFolder: rec("saveFolder", { ok: true, data: "f" }),
    reorderFolders: rec("reorderFolders"),
    deleteFolder: rec("deleteFolder"),
  };
});
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ storage: { from: () => ({ upload: vi.fn(async (path: string, _f: File, o: { contentType?: string }) => { h.uploads.push({ path, type: o.contentType }); return { error: null }; }) }) } }),
}));

const F = (id: string, defaultKey: DocFolder["defaultKey"], shared: boolean, position: number): DocFolder =>
  ({ id, defaultKey, name: null, position, shared, patientCanUpload: defaultKey === "exams", documentCount: 0 });
const FOLDERS: DocFolder[] = [F("f-exams", "exams", true, 1), F("f-int", "internal", false, 5)];
const doc = (o: Partial<PatientDocument>): PatientDocument => ({
  id: "d1", folderId: "f-exams", title: "Hemograma", mime: "application/pdf", sizeBytes: 2048, source: "doctor_upload",
  replacesId: null, replaced: false, shared: true, uploadedByRole: "professional", doctorOpenedAt: null,
  createdAt: "2026-10-01T12:00:00Z", storagePath: "doc/pat/d1.pdf", hidden: null, ...o,
});
const DOCS: PatientDocument[] = [
  doc({}),
  doc({ id: "d2", title: "Foto da lesão", uploadedByRole: "patient", source: "patient_upload", shared: true }),
  doc({ id: "d3", folderId: "f-int", title: "Nota interna", shared: false }),
];

import { DocumentFoldersCard } from "@/app/[locale]/(site)/dashboard/settings/DocumentFoldersCard";
import { DocumentsTab } from "@/app/[locale]/(site)/dashboard/(gated)/patients/[id]/DocumentsTab";

const T = pt.docs;
beforeEach(() => { h.calls.length = 0; h.uploads.length = 0; });

describe("lib/patientDocuments", () => {
  it("the path 190 accepts; the real formats; the default title", () => {
    expect(docPath("doc", "pat", "u1", "application/pdf")).toBe("doc/pat/u1.pdf");
    expect(docPath("doc", "pat", "u1", "image/jpeg")).toBe("doc/pat/u1.jpg");
    expect(docMime({ type: "", name: "IMG_1.HEIC" })).toBe("image/heic");
    expect(docMime({ type: "image/jpg", name: "a" })).toBe("image/jpeg");
    expect(docMime({ type: "text/plain", name: "a.txt" })).toBeNull();
    expect(defaultTitle("Exame de sangue.pdf")).toBe("Exame de sangue");
  });

  it("server codes → messages; the doctor's own 24 h delete only", () => {
    expect(docErrorKey("storage_full", true)).toBe("ownStorageFull");
    expect(docErrorKey("storage_full")).toBe("storageFull");
    expect(docErrorKey("daily_limit")).toBe("dailyLimit");
    expect(docErrorKey("folder_not_empty")).toBe("folderNotEmpty");
    const now = Date.parse("2026-10-01T13:00:00Z");
    expect(canDeleteOwn(doc({}), now)).toBe(true);
    expect(canDeleteOwn(doc({ uploadedByRole: "patient", source: "patient_upload" }), now)).toBe(false);
    expect(canDeleteOwn(doc({ source: "prescription" }), now)).toBe(false);
    expect(canDeleteOwn(doc({}), Date.parse("2026-10-02T12:30:00Z"))).toBe(false);
  });

  it("access-log labels for the new kinds (cf's wording)", () => {
    expect(accessKindLabelKey("shared_document")).toBe("accessKindSharedDocument");
    expect(accessKindLabelKey("patient_upload")).toBe("accessKindPatientUpload");
    expect(accessKindLabelKey("patient_upload_removed")).toBe("accessKindUploadRemoved");
    expect(accessKindLabelKey("file_deleted")).toBe("accessKindFileDeleted");
    expect(accessKindLabelKey("document")).toBe("accessKindDocument");
    expect(accessKindLabelKey("patient")).toBe("accessKindPatient");
    expect(pt.patientDetail.accessKindSharedDocument).toBe("Abriu um documento compartilhado");
  });
});

describe("Documents tab", () => {
  const tab = () => render(
    <NextIntlClientProvider locale="pt-BR" messages={pt}>
      <DocumentsTab patientId="pat" doctorId="doc" isArchived={false} locale="pt-BR" />
    </NextIntlClientProvider>,
  );

  it("documents by folder; shared / only you; Internal never offers sharing; the patient's upload is marked", async () => {
    tab();
    const exams = await screen.findByRole("region", { name: T.folder.exams });
    expect(within(exams).getByText("Hemograma")).toBeInTheDocument();
    expect(within(exams).getAllByText(T.shared)).toHaveLength(2);
    expect(within(exams).getByText(T.uploadedByPatient)).toBeInTheDocument();
    const internal = screen.getByRole("region", { name: T.folder.internal });
    expect(within(internal).queryByText(T.notShared)).toBeNull();
    expect(within(internal).queryByRole("button", { name: T.share })).toBeNull();
    fireEvent.click(within(exams).getAllByRole("button", { name: T.hideFromPatient })[0]);
    await waitFor(() => expect(h.calls.find((c) => c.fn === "setDocumentShared")?.args).toEqual(["d1", false]));
  });

  it("upload: stored at <doctor>/<patient>/<uuid>.pdf, then registered with the title, folder and share switch", async () => {
    tab();
    await screen.findByRole("region", { name: T.folder.exams });
    const file = new File(["%PDF-1.4"], "Laudo.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText(pt.patientDetail.filesUpload, { selector: "input" }), { target: { files: [file] } });
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText(T.titleLabel)).toHaveValue("Laudo");
    expect(within(dialog).getByRole("checkbox", { name: T.share })).toBeChecked();
    // Internal: no share switch, the note instead.
    fireEvent.change(within(dialog).getByLabelText(T.uploadFolder), { target: { value: "f-int" } });
    expect(within(dialog).queryByRole("checkbox", { name: T.share })).toBeNull();
    expect(within(dialog).getByText(T.internalNote)).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText(T.uploadFolder), { target: { value: "f-exams" } });
    fireEvent.click(within(dialog).getByRole("button", { name: pt.patientDetail.filesUpload }));
    await waitFor(() => expect(h.calls.some((c) => c.fn === "registerDocument")).toBe(true));
    expect(h.uploads[0].path).toMatch(/^doc\/pat\/[0-9a-f-]{36}\.pdf$/);
    expect(h.uploads[0].type).toBe("application/pdf");
    const [pid, input] = h.calls.find((c) => c.fn === "registerDocument")!.args as [string, { path: string; folderId: string; title: string; shared: boolean }];
    expect(pid).toBe("pat");
    expect(input).toEqual({ path: h.uploads[0].path, folderId: "f-exams", title: "Laudo", shared: true });
  });

  it("a type the server would refuse is stopped before uploading", async () => {
    tab();
    await screen.findByRole("region", { name: T.folder.exams });
    fireEvent.change(screen.getByLabelText(pt.patientDetail.filesUpload, { selector: "input" }), { target: { files: [new File(["x"], "a.docx", { type: "application/msword" })] } });
    expect(screen.getByRole("alert")).toHaveTextContent(T.err.type);
    expect(h.uploads).toHaveLength(0);
  });
});

describe("Settings → Pastas de documentos", () => {
  it("the arrows have real labels (f0); the off-confirm is a plural; turning a folder off asks first", async () => {
    render(
      <NextIntlClientProvider locale="pt-BR" messages={pt}>
        <DocumentFoldersCard initial={FOLDERS} usedBytes={0} limitBytes={1} loadFailed={false} />
      </NextIntlClientProvider>,
    );
    expect(screen.getAllByRole("button", { name: "Mover para cima" })).toHaveLength(2);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(screen.getByRole("checkbox", { name: T.settings.shared }));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith("1 documento deixará de aparecer para os pacientes."));
    expect(h.calls.some((c) => c.fn === "saveFolder")).toBe(false);
    confirm.mockRestore();
  });
});
