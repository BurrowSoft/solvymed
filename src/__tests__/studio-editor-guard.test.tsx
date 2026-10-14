import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";
import { DEFAULT_DESIGN } from "@/lib/studio/design";

// Document Studio (02, #548): leaving the editor with unsaved design changes
// by the sidebar or any dashboard link asks "Discard changes?" (#530's
// guard), as Settings' forms do; a successful save clears it.

const save = vi.fn();
vi.mock("@/app/[locale]/(site)/dashboard/settings/studio-actions", () => ({ saveMyDesign: (...a: unknown[]) => save(...a) }));
vi.mock("@/app/[locale]/(site)/dashboard/settings/studio/StudioPreview", () => ({ StudioPreview: () => null }));
vi.mock("@/app/[locale]/(site)/dashboard/settings/studio/StudioPosters", () => ({ StudioPosters: () => null }));
const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: nav.push, refresh: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));

const { StudioEditor } = await import("@/app/[locale]/(site)/dashboard/settings/studio/StudioEditor");
const { NavigationGuard, hasUnsavedChanges } = await import("@/components/DiscardGuard");

function show() {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <NavigationGuard />
      {/* A plain dashboard link, as the sidebar renders (the guard catches anchors). */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/dashboard/patients">Patients</a>
      <StudioEditor
        initial={{ ...structuredClone(DEFAULT_DESIGN), font: "sarabun" }} saved={true} version={3} country="BR"
        practice={{ displayName: "Dr. Test", specialty: null, registrationLine: null, clinicName: null, locations: [] }}
        logos={{ square: null, wide: null, reversed: null }} textTypes={["prescription"]} backHref="/dashboard/settings" posterHours={null} inviteUrl={null} uid="u1" signatureOn={false}
      />
    </NextIntlClientProvider>,
  );
}

afterEach(() => cleanup());

describe("Studio editor: leaving with unsaved changes", () => {
  it("a change counts as unsaved; a link then asks first; a save clears it", async () => {
    save.mockResolvedValue({ ok: true, version: 4 });
    show();
    expect(hasUnsavedChanges()).toBe(false);
    fireEvent.click(screen.getAllByRole("radio", { name: en.studio.layouts.elegant })[0]);
    expect(hasUnsavedChanges()).toBe(true);

    fireEvent.click(screen.getByText("Patients"));
    expect((await screen.findAllByText(en.common.discardTitle)).length).toBeGreaterThan(0);
    expect(nav.push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: en.common.keepEditing }));

    await act(async () => { fireEvent.click(screen.getByTestId("studio-save")); });
    expect(hasUnsavedChanges()).toBe(false);
  });
});
