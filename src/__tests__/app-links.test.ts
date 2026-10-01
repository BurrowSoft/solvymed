import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

// Android App Links (Vitor's 1.4.0 test: email links opened the website
// instead of the app; www had no assetlinks.json). Served as a static file
// from public/.well-known (the middleware skips paths with a dot).
const read = (p: string) => readFileSync(join(process.cwd(), "public", ".well-known", p), "utf8");

describe("/.well-known/assetlinks.json", () => {
  const links = JSON.parse(read("assetlinks.json")) as {
    relation: string[];
    target: { namespace: string; package_name: string; sha256_cert_fingerprints: string[] };
  }[];

  it("delegates all URLs to the SolvyMed Android app", () => {
    expect(links).toHaveLength(1);
    expect(links[0].relation).toEqual(["delegate_permission/common.handle_all_urls"]);
    expect(links[0].target).toMatchObject({ namespace: "android_app", package_name: "com.burrowsoft.solvymed" });
  });

  it("carries the Play app-signing key (colon-separated uppercase SHA-256s only)", () => {
    const fps = links[0].target.sha256_cert_fingerprints;
    expect(fps).toContain("80:6E:69:E3:92:E1:48:79:83:27:C4:2B:59:CE:1E:E1:72:97:12:F1:B2:27:26:7F:49:A4:4A:74:B2:F3:98:DD");
    // The EAS key of the preview/internal APKs too (38, build dfb75665).
    expect(fps).toContain("FF:77:A2:E6:09:D2:E9:49:C8:CC:BD:9C:6B:E7:9C:51:6E:51:17:59:F8:8F:8D:88:84:2A:41:35:60:02:8D:DA");
    for (const fp of fps) expect(fp).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
  });

  it("the middleware never redirects it (a path with a dot is skipped)", async () => {
    const { config } = await import("@/middleware");
    const pattern = new RegExp(`^${config.matcher[0].replace(/^\//, "\\/").replace(/\(\?!/, "(?!")}$`);
    expect(pattern.test("/.well-known/assetlinks.json")).toBe(false);
  });
});

describe("/.well-known/apple-app-site-association (iOS)", () => {
  const aasa = JSON.parse(read("apple-app-site-association")) as { applinks: { details: { appIDs: string[]; components: { "/": string }[] }[] } };

  it("is for the SolvyMed app, claiming only /invite/* and /join/* (not the auth callback)", () => {
    expect(aasa.applinks.details).toHaveLength(1);
    expect(aasa.applinks.details[0].appIDs).toEqual(["MWHGM7ZHML.com.burrowsoft.solvymed"]);
    expect(aasa.applinks.details[0].components.map((c) => c["/"])).toEqual(["/invite/*", "/join/*"]);
  });

  it("is served as application/json", () => {
    // Read as text: importing next.config loads the Sentry and next-intl
    // plugins, which took longer than the test timeout under load.
    const config = readFileSync(join(process.cwd(), "next.config.ts"), "utf8").replace(/\s+/g, " ");
    expect(config).toContain('source: "/.well-known/apple-app-site-association", headers: [{ key: "Content-Type", value: "application/json" }]');
  });
});
