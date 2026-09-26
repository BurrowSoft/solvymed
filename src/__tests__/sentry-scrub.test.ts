import { describe, it, expect } from "vitest";
import type { ErrorEvent } from "@sentry/nextjs";
import { scrubBreadcrumb, scrubEvent, scrubText } from "@/lib/sentryScrub";

describe("scrubText", () => {
  it("masks emails, CPFs and phone numbers", () => {
    expect(scrubText("user ana.silva@gmail.com failed")).toBe("user [email] failed");
    expect(scrubText("cpf 123.456.789-00 and 12345678900")).toBe("cpf [cpf] and [cpf]");
    expect(scrubText("call +55 11 99999-1234")).toBe("call [phone]");
  });

  it("keeps ordinary error text", () => {
    expect(scrubText('duplicate key value violates unique constraint "patients_professional_cpf_key"')).toBe(
      'duplicate key value violates unique constraint "patients_professional_cpf_key"',
    );
  });
});

describe("scrubEvent", () => {
  it("drops request bodies, headers, cookies and query values; keeps only the user id", () => {
    const event = {
      type: undefined,
      request: {
        url: "https://www.solvymed.com/pt-BR/dashboard/patients?q=Maria%20Silva#x",
        method: "POST",
        data: { full_name: "Maria Silva" },
        headers: { cookie: "sb=secret" },
        cookies: { sb: "secret" },
        query_string: "q=Maria",
      },
      user: { id: "u-1", email: "ana@gmail.com", ip_address: "1.2.3.4" },
      extra: { form: { cpf: "123.456.789-00" } },
      exception: { values: [{ type: "Error", value: "save failed for ana@gmail.com" }] },
    } as unknown as ErrorEvent;

    const out = scrubEvent(event);
    expect(out.request).toEqual({
      url: "https://www.solvymed.com/pt-BR/dashboard/patients",
      method: "POST",
    });
    expect(out.user).toEqual({ id: "u-1" });
    expect(out.extra).toBeUndefined();
    expect(out.exception?.values?.[0].value).toBe("save failed for [email]");
  });

  it("redacts invite codes in URLs and transaction names", () => {
    const event = {
      type: undefined,
      request: { url: "https://www.solvymed.com/pt-BR/invite/AB12CD" },
      transaction: "/pt-BR/join/secretary/S-ABCD2345",
    } as unknown as ErrorEvent;
    const out = scrubEvent(event);
    expect(out.request?.url).toBe("https://www.solvymed.com/pt-BR/invite/[code]");
    expect(out.transaction).toBe("/pt-BR/join/secretary/[code]");
  });

  it("keeps no query string, invite code or email anywhere in a server error", () => {
    const event = {
      type: undefined,
      request: { url: "https://www.solvymed.com/pt-BR/auth/signup?email=ana%40gmail.com&secretary=S-ABCD2345", method: "GET" },
      transaction: "/pt-BR/invite/AB12CD",
      contexts: {
        // What onRequestError attaches: the raw path, query included.
        nextjs: { request_path: "/pt-BR/dashboard/patients?q=Maria%20Silva", router_kind: "App Router" },
        trace: { trace_id: "t1", span_id: "s1", op: "http.server", data: { "url.full": "https://x/?q=Maria" } },
        os: { name: "Linux" },
        runtime: { name: "node", version: "v22" },
      },
      tags: { url: "/pt-BR/join/AB12CD?email=ana%40gmail.com", note: "for ana@gmail.com", level: 3 },
      logentry: { message: "lookup %s", params: ["Maria Silva"] },
      breadcrumbs: [{ category: "navigation", data: { from: "/invite/AB12CD", to: "/pt-BR/dashboard/patients?q=Maria" } }],
    } as unknown as ErrorEvent;

    const out = scrubEvent(event);
    const json = JSON.stringify(out);
    for (const leak of ["Maria", "ana", "gmail", "AB12CD", "S-ABCD2345", "?", "url.full"]) {
      expect(json).not.toContain(leak);
    }
    expect(out.contexts).toEqual({
      trace: { trace_id: "t1", span_id: "s1", op: "http.server" },
      os: { name: "Linux" },
      runtime: { name: "node", version: "v22" },
    });
    expect(out.request?.url).toBe("https://www.solvymed.com/pt-BR/auth/signup");
    expect(out.tags).toEqual({ url: "/pt-BR/join/[code]", note: "for [email]", level: 3 });
  });

  it("drops spans, which carry full request URLs", () => {
    const event = {
      type: "transaction",
      spans: [{ description: "GET https://db.supabase.co/rest/v1/patients?full_name=ilike.%25Maria%25", data: { "url.query": "full_name=ilike.%Maria%" } }],
    } as unknown as ErrorEvent;
    const out = scrubEvent(event) as unknown as { spans?: unknown };
    expect(out.spans).toBeUndefined();
  });
});

describe("scrubBreadcrumb", () => {
  it("drops console breadcrumbs", () => {
    expect(scrubBreadcrumb({ category: "console", message: "Maria Silva" })).toBeNull();
  });

  it("keeps only safe data and redacts URLs", () => {
    const out = scrubBreadcrumb({
      category: "fetch",
      data: { url: "/rest/v1/patients?email=eq.ana%40gmail.com", method: "GET", status_code: 200, body: "x" },
    });
    expect(out?.data).toEqual({ url: "/rest/v1/patients", method: "GET", status_code: 200 });
  });
});
