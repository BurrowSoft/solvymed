import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { FOUNDER_DAILY_URLS, contentTypeFor, mapRegisterError, safeFileName } from "@/lib/foundersUpload";

// Founders stage 2 (migration 132): the signed-URL and register routes.

const flags = vi.hoisted(() => ({ founders: true }));
vi.mock("@/lib/liveFeatures", async (orig) => {
  const real = await orig<typeof import("@/lib/liveFeatures")>();
  return { ...real, liveFeatures: new Proxy(real.liveFeatures, { get: (t, k) => (k === "founders" ? flags.founders : (t as Record<string, unknown>)[k as string]) }) };
});
const h = vi.hoisted(() => ({
  user: { id: "u1", email: "doc@example.com" } as { id: string; email: string } | null,
  check: { data: { allowed: true, folder: "u1/", uploads_left: 20 } as unknown, error: null as unknown },
  register: { data: "sample-1" as unknown, error: null as unknown },
  rpc: [] as { fn: string; args?: Record<string, unknown> }[],
  objects: [] as { name: string }[],
  listError: null as unknown,
  signed: [] as string[],
  notices: [] as unknown[],
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: h.user } }) },
    rpc: async (fn: string, args?: Record<string, unknown>) => {
      h.rpc.push({ fn, args });
      return fn === "founder_upload_check" ? h.check : h.register;
    },
  }),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        list: async () => ({ data: h.objects, error: h.listError }),
        createSignedUploadUrl: async (path: string) => { h.signed.push(path); return { data: { token: "tok", path }, error: null }; },
      }),
    },
  }),
}));
vi.mock("@/lib/foundersEmail", () => ({ sendFounderUploadNotice: async (a: unknown) => { h.notices.push(a); } }));

import { POST as uploadUrl } from "@/app/api/founders/upload-url/route";
import { POST as register } from "@/app/api/founders/register/route";

const req = (url: string, body: unknown) =>
  new NextRequest(`https://www.solvymed.com${url}`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const ask = (body: unknown = { fileName: "Pacientes Exportação.xlsx", size: 1000, confirmed: true }) => uploadUrl(req("/api/founders/upload-url", body));

beforeEach(() => {
  flags.founders = true;
  h.user = { id: "u1", email: "doc@example.com" };
  h.check = { data: { allowed: true, folder: "u1/", uploads_left: 20 }, error: null };
  h.register = { data: "sample-1", error: null };
  h.rpc = []; h.objects = []; h.listError = null; h.signed = []; h.notices = [];
});

describe("founders upload helpers", () => {
  it("accepts CSV / XLS / XLSX / ZIP only, and stores a safe name with its extension", () => {
    expect(contentTypeFor("a.CSV")).toBe("text/csv");
    expect(contentTypeFor("a.xlsx")).toContain("spreadsheetml");
    expect(contentTypeFor("a.zip")).toBe("application/zip");
    expect(contentTypeFor("a.pdf")).toBeNull();
    expect(contentTypeFor("csv")).toBeNull();
    expect(safeFileName("Pacientes Exportação (1).xlsx")).toBe("Pacientes-Exportacao-1.xlsx");
    expect(safeFileName("../../etc/passwd.csv")).toBe("etc-passwd.csv");
    expect(safeFileName("..csv")).toBe("export.csv");
  });

  it("maps 132's register errors", () => {
    expect(mapRegisterError("too_many_files")).toBe("too_many_files");
    expect(mapRegisterError("not_allowed")).toBe("not_allowed");
    expect(mapRegisterError("confirmation_required")).toBe("confirmation_required");
    expect(mapRegisterError("boom")).toBe("generic");
  });
});

describe("POST /api/founders/upload-url", () => {
  it("404 while the Founders page isn't live", async () => {
    flags.founders = false;
    expect((await ask()).status).toBe(404);
  });

  it("needs the re-confirmation, a known type and a size up to 20 MB, before touching the database", async () => {
    expect(await (await ask({ fileName: "a.csv", size: 10 })).json()).toEqual({ code: "confirmation_required" });
    expect(await (await ask({ fileName: "a.pdf", size: 10, confirmed: true })).json()).toEqual({ code: "type" });
    expect(await (await ask({ fileName: "a.csv", size: 20 * 1024 * 1024 + 1, confirmed: true })).json()).toEqual({ code: "size" });
    expect(await (await ask({ fileName: "a.csv", size: 0, confirmed: true })).json()).toEqual({ code: "size" });
    expect(h.rpc).toEqual([]);
  });

  it("signs a path in the founder's own folder, built on the server", async () => {
    const res = await ask({ fileName: "../other/Export.csv", size: 10, confirmed: true });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.path).toMatch(/^u1\/\d+-other-Export\.csv$/);
    expect(body).toMatchObject({ token: "tok", contentType: "text/csv", uploadsLeft: 20 });
    expect(h.signed).toEqual([body.path]);
  });

  it("refuses a signed-out user, a non-founder, a founder with no uploads left and a foreign folder", async () => {
    h.user = null;
    expect((await ask()).status).toBe(401);
    h.user = { id: "u1", email: "" };
    h.check = { data: [{ allowed: false, uploads_left: 20 }], error: null };
    expect(await (await ask()).json()).toEqual({ code: "not_allowed" });
    h.check = { data: { allowed: false, uploads_left: 0 }, error: null };
    expect(await (await ask()).json()).toEqual({ code: "too_many_files" });
    h.check = { data: { allowed: true, folder: "u2/", uploads_left: 5 }, error: null };
    expect((await ask()).status).toBe(500);
    h.check = { data: null, error: { message: "function missing" } };
    expect(await (await ask()).json()).toEqual({ code: "generic" });
    expect(h.signed).toEqual([]);
  });

  it("caps the URLs of the last 24 hours, counted from the folder", async () => {
    const now = Date.now();
    h.objects = [
      ...Array.from({ length: FOUNDER_DAILY_URLS - 1 }, (_, i) => ({ name: `${now - i * 1000}-a.csv` })),
      { name: `${now - 25 * 60 * 60 * 1000}-old.csv` },
    ];
    expect((await ask()).status).toBe(200);
    h.objects.push({ name: `${now}-b.csv` });
    const res = await ask();
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ code: "daily_limit" });
    h.objects = []; h.listError = { message: "down" };
    expect((await ask()).status).toBe(500);
  });
});

describe("POST /api/founders/register", () => {
  const reg = (body: unknown) => register(req("/api/founders/register", body));

  it("registers the founder's own file with the confirmation, then tells the team", async () => {
    const res = await reg({ path: "u1/1700000000000-a.csv", confirmed: true });
    expect(res.status).toBe(200);
    expect(h.rpc).toEqual([{ fn: "founder_register_sample", args: { p_object_path: "u1/1700000000000-a.csv", p_confirmed_test_only: true } }]);
    expect(h.notices).toEqual([{ userId: "u1", email: "doc@example.com", path: "u1/1700000000000-a.csv", sampleId: "sample-1" }]);
  });

  it("refuses without the confirmation, outside the founder's folder, or signed out", async () => {
    expect((await reg({ path: "u1/x.csv" })).status).toBe(400);
    expect((await reg({ path: "u2/x.csv", confirmed: true })).status).toBe(403);
    expect((await reg({ path: "u1/../u2/x.csv", confirmed: true })).status).toBe(403);
    h.user = null;
    expect((await reg({ path: "u1/x.csv", confirmed: true })).status).toBe(401);
    expect(h.rpc).toEqual([]);
    expect(h.notices).toEqual([]);
  });

  it("maps the database's refusals and sends no notice", async () => {
    h.register = { data: null, error: { message: "too_many_files" } };
    const res = await reg({ path: "u1/x.csv", confirmed: true });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ code: "too_many_files" });
    h.register = { data: null, error: { message: "not_allowed" } };
    expect((await reg({ path: "u1/x.csv", confirmed: true })).status).toBe(403);
    expect(h.notices).toEqual([]);
  });
});
