import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";
import type { DocFolder } from "@/lib/patientDocuments";

// "Discard changes?" for settings (1.9.0 MUST-fix, 02; the app does the
// same): closing with unsaved changes by any path but the form's own Cancel
// (opening another form in its place, the sidebar / a link, reloading or
// closing the tab) asks first. An explicit Cancel discards without asking.

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: nav.push, refresh: vi.fn() }) }));
vi.mock("@/app/[locale]/(site)/dashboard/settings/actions", () => ({ createProcedure: vi.fn(async () => ({})), updateWorkingHours: vi.fn(async () => ({})) }));
vi.mock("@/lib/setupActions", () => ({ markInviteShared: vi.fn() }));
vi.mock("@/app/[locale]/(site)/dashboard/(gated)/patients/documents-actions", () => ({
  countFolderShared: vi.fn(async () => 0), deleteFolder: vi.fn(), loadFolders: vi.fn(), reorderFolders: vi.fn(), saveFolder: vi.fn(async () => ({ ok: true, data: "f" })),
}));

import { hasUnsavedChanges, leaveGuarded, NavigationGuard, useFormDirty } from "@/components/DiscardGuard";
import { ProceduresPanel, WorkingHoursForm } from "@/app/[locale]/(site)/dashboard/settings/SettingsClient";
import { DocumentFoldersCard } from "@/app/[locale]/(site)/dashboard/settings/DocumentFoldersCard";

const C = pt.common;
const wrap = (ui: React.ReactNode) => render(<NextIntlClientProvider locale="pt-BR" messages={pt}>{ui}</NextIntlClientProvider>);
const leaving = () => { const e = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; };
// The dirty check runs just after the change (controlled fields settle first).
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 5)); });

afterEach(() => { cleanup(); nav.push.mockReset(); });

function Probe() {
  const g = useFormDirty();
  return (
    <form {...g.formProps}>
      <input aria-label="name" name="name" defaultValue="Ana" />
      <button type="button" onClick={g.markClean}>saved</button>
      <span data-testid="state">{g.dirty ? "dirty" : "clean"}</span>
    </form>
  );
}

describe("useFormDirty", () => {
  it("dirty only while the values differ from the loaded ones; the browser asks before leaving meanwhile", async () => {
    wrap(<Probe />);
    expect(leaving()).toBe(false);
    fireEvent.change(screen.getByLabelText("name"), { target: { value: "Ana B" } });
    await settle();
    expect(screen.getByTestId("state")).toHaveTextContent("dirty");
    expect(hasUnsavedChanges()).toBe(true);
    expect(leaving()).toBe(true);
    // Typed back to what it was: nothing to lose.
    fireEvent.change(screen.getByLabelText("name"), { target: { value: "Ana" } });
    await settle();
    expect(screen.getByTestId("state")).toHaveTextContent("clean");
    expect(leaving()).toBe(false);
    // After a save, the saved values are the new start.
    fireEvent.change(screen.getByLabelText("name"), { target: { value: "Bia" } });
    await settle();
    fireEvent.click(screen.getByText("saved"));
    expect(screen.getByTestId("state")).toHaveTextContent("clean");
    expect(hasUnsavedChanges()).toBe(false);
  });
});

describe("the sidebar and links", () => {
  // A raw <a> on purpose: it's what the guard catches (Next's <Link> renders one).
  // eslint-disable-next-line @next/next/no-html-link-for-pages
  const page = () => wrap(<><NavigationGuard /><Probe /><a href="/pt-BR/dashboard/patients">Pacientes</a><a href="#hours">aqui</a></>);

  it("nothing unsaved: links go as usual", async () => {
    page();
    const click = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    screen.getByText("Pacientes").dispatchEvent(click);
    expect(screen.queryByTestId("discard-navigation")).toBeNull();
  });

  it("unsaved changes: asks; Keep editing stays, Discard goes", async () => {
    page();
    fireEvent.change(screen.getByLabelText("name"), { target: { value: "Ana B" } });
    await settle();
    const click = () => { const e = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }); act(() => { screen.getByText("Pacientes").dispatchEvent(e); }); return e.defaultPrevented; };
    expect(click()).toBe(true);
    expect(screen.getByTestId("discard-navigation")).toHaveTextContent(C.discardTitle);
    fireEvent.click(screen.getByRole("button", { name: C.keepEditing }));
    expect(screen.queryByTestId("discard-navigation")).toBeNull();
    expect(nav.push).not.toHaveBeenCalled();
    expect((screen.getByLabelText("name") as HTMLInputElement).value).toBe("Ana B");
    click();
    fireEvent.click(screen.getByRole("button", { name: C.discard }));
    expect(nav.push).toHaveBeenCalledWith("/pt-BR/dashboard/patients");
  });

  it("navigation in code (SolvyAI, the language, signing out, the tour) goes through the same question (ec)", async () => {
    page();
    const go = vi.fn();
    const keep = vi.fn();
    act(() => leaveGuarded(go, keep));
    expect(go).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText("name"), { target: { value: "Ana B" } });
    await settle();
    act(() => leaveGuarded(go, keep));
    expect(go).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: C.keepEditing }));
    expect(keep).toHaveBeenCalledTimes(1);
    act(() => leaveGuarded(go, keep));
    fireEvent.click(screen.getByRole("button", { name: C.discard }));
    expect(go).toHaveBeenCalledTimes(2);
  });

  it("an anchor on the same page or a new tab never asks", async () => {
    page();
    fireEvent.change(screen.getByLabelText("name"), { target: { value: "Ana B" } });
    await settle();
    screen.getByText("aqui").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    screen.getByText("Pacientes").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ctrlKey: true }));
    expect(screen.queryByTestId("discard-navigation")).toBeNull();
  });
});

describe("settings forms", () => {
  it("Working hours: an edit makes leaving ask", async () => {
    wrap(<WorkingHoursForm workingHours={{} as never} country="BR" />);
    expect(leaving()).toBe(false);
    fireEvent.click((screen.getAllByRole("checkbox") as HTMLInputElement[])[5]);
    await settle();
    expect(leaving()).toBe(true);
  });

  it("New procedure: its Cancel discards without asking, and the price doesn't come back", async () => {
    wrap(<ProceduresPanel procedures={[]} currency="BRL" />);
    fireEvent.click(screen.getByRole("button", { name: pt.settings.addProcedure }));
    const price = document.querySelector("input[name=price]") as HTMLInputElement;
    fireEvent.change(price, { target: { value: "150,50" } });
    await settle();
    expect(leaving()).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: pt.settings.cancel }));
    expect(screen.queryByTestId("discard-confirm")).toBeNull();
    await settle();
    expect(leaving()).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: pt.settings.addProcedure }));
    expect((document.querySelector("input[name=price]") as HTMLInputElement).value).toBe("");
  });

  it("Document folders: renaming another folder over a typed name asks first", async () => {
    const F = (id: string, name: string, position: number): DocFolder => ({ id, defaultKey: null, name, position, shared: true, patientCanUpload: false, documentCount: 0 });
    wrap(<DocumentFoldersCard initial={[F("a", "Laudos", 1), F("b", "Termos", 2)]} usedBytes={0} limitBytes={1} loadFailed={false} />);
    const rename = () => screen.getAllByRole("button", { name: pt.docs.settings.rename });
    fireEvent.click(rename()[0]);
    fireEvent.change(screen.getByDisplayValue("Laudos"), { target: { value: "Laudos 2026" } });
    fireEvent.click(rename()[0]);
    await waitFor(() => expect(screen.getByTestId("discard-confirm")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: C.keepEditing }));
    expect(screen.getByDisplayValue("Laudos 2026")).toBeInTheDocument();
    fireEvent.click(rename()[0]);
    fireEvent.click(screen.getByRole("button", { name: C.discard }));
    expect(screen.getByDisplayValue("Termos")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Laudos 2026")).toBeNull();
  });
});
