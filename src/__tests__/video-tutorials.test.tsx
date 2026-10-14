import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";
import { countryProfile } from "@/lib/country";
import { videoTutorialsUrl } from "@/lib/videoTutorials";

// "Video tutorials" (specs/video-tutorials.md): the practice country's
// YouTube playlist (signed in), else the site language's country (visitors);
// per-country config with an explicit default (no playlist = no entry);
// linked out in a new tab, never embedded.

vi.mock("next/navigation", () => ({ usePathname: () => "/pt-BR/dashboard", useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: { signOut: vi.fn() } }) }));

import { DashboardSidebar } from "@/components/DashboardSidebar";

const BR = "https://www.youtube.com/playlist?list=PLGStjTQLFN3M";
const TH = "https://www.youtube.com/playlist?list=PLI6329of7MSY";

describe("which playlist", () => {
  it("per country, with an explicit default that has none", () => {
    expect(countryProfile("BR").videoTutorialsUrl).toBe(BR);
    expect(countryProfile("TH").videoTutorialsUrl).toBe(TH);
    expect(countryProfile("US").videoTutorialsUrl).toBeNull();
  });

  it("signed in: the practice country, whatever the language", () => {
    expect(videoTutorialsUrl({ country: "TH", locale: "pt-BR" })).toBe(TH);
    expect(videoTutorialsUrl({ country: "BR", locale: "en" })).toBe(BR);
    expect(videoTutorialsUrl({ country: "US", locale: "pt-BR" })).toBeNull();
  });

  it("visitors: the site language's country; English has none yet", () => {
    expect(videoTutorialsUrl({ locale: "pt-BR" })).toBe(BR);
    expect(videoTutorialsUrl({ locale: "th" })).toBe(TH);
    expect(videoTutorialsUrl({ locale: "en" })).toBeNull();
    expect(videoTutorialsUrl({ locale: "es" })).toBeNull();
    expect(videoTutorialsUrl({})).toBeNull();
  });
});

describe("the dashboard side menu", () => {
  const sidebar = (url: string | null) => render(
    <NextIntlClientProvider locale="pt-BR" messages={pt}>
      <DashboardSidebar locale="pt-BR" firstName="Ana" email="a@example.invalid" videoTutorialsUrl={url} />
    </NextIntlClientProvider>,
  );

  it("the practice's playlist, in a new tab, never embedded", () => {
    sidebar(BR);
    const links = screen.getAllByTestId("nav-video-tutorials");
    expect(links.length).toBeGreaterThan(0);
    for (const a of links) {
      expect(a).toHaveAttribute("href", BR);
      expect(a).toHaveAttribute("target", "_blank");
      expect(a.getAttribute("rel")).toContain("noopener");
      expect(a).toHaveTextContent(pt.videoTutorials.title);
    }
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("a country without a playlist: no item", () => {
    sidebar(null);
    expect(screen.queryByTestId("nav-video-tutorials")).toBeNull();
  });
});

describe("strings", () => {
  it("every locale has the title and subtitle; en/pt/th as approved", async () => {
    const files = ["ar", "de", "en", "es", "fr", "id", "it", "ja", "ko", "pt-BR", "ru", "th", "vi", "zh", "zh-TW"];
    for (const l of files) {
      const m = (await import(`@/messages/${l}.json`)).default as { videoTutorials?: { title: string; subtitle: string } };
      expect(m.videoTutorials?.title, l).toBeTruthy();
      expect(m.videoTutorials?.subtitle, l).toBeTruthy();
    }
    expect(pt.videoTutorials).toEqual({ title: "Vídeos tutoriais", subtitle: "Vídeos curtos mostrando cada parte do SolvyMed" });
  });
});
