import { describe, expect, it } from "vitest";
import { handleAssistant, type Deps } from "@/lib/assistant/server/handle";
import { fakeModelClient, type ModelClient } from "@/lib/assistant/server/model";
import { plainForApp, plainLine } from "@/lib/assistant/server/plainText";
import type { AnswerChunk } from "@/lib/assistant/types";

// Vitor in the released app (6 Oct): "Como convido minha secretária?" showed
// "**Configurações → Equipe → Convidar**" with the asterisks (the app renders
// no markdown), and "Abrir tela" opened Settings instead of the Team sheet.

function rpcClient(answers: Record<string, { data: unknown; error: null }>) {
  return { rpc: (fn: string) => Promise.resolve(answers[fn] ?? { data: null, error: null }) };
}
const ALLOWED = { allowed: true, used: 3, limit: 20, resets_at: "2026-09-30T03:00:00Z", actions: false };
const deps = (client: "web" | "app", text: string) => {
  const db = rpcClient({ assistant_consume_message: { data: ALLOWED, error: null }, assistant_budget_state: { data: { configured: false, over_80: false, over_budget: false }, error: null } });
  return { enabled: true, userId: "doc-1", db, service: rpcClient({}), model: fakeModelClient(() => text) as ModelClient, client } as unknown as Deps;
};
const ask = { messages: [{ role: "user", text: "Como convido minha secretária?" }], screen: "settings", locale: "pt-BR", conversationTurns: 0 };
async function run(client: "web" | "app", text: string) {
  const out = await handleAssistant(ask, deps(client, text));
  if (!("stream" in out)) throw new Error("no stream");
  const chunks: AnswerChunk[] = [];
  for await (const c of out.stream) chunks.push(c);
  return chunks;
}
const textOf = (chunks: AnswerChunk[]) => chunks.map((c) => (c.kind === "delta" ? c.text : "")).join("");

describe("plain text for the app", () => {
  it("markdown becomes plain words", () => {
    expect(plainLine("Vá em **Configurações → Equipe → Convidar**.")).toBe("Vá em Configurações → Equipe → Convidar.");
    expect(plainLine("## Passos")).toBe("Passos");
    expect(plainLine("- Toque em *Convidar*")).toBe("• Toque em Convidar");
    expect(plainLine("Veja [a Ajuda](https://x.y/help) e `Equipe`")).toBe("Veja a Ajuda e Equipe");
    // Never touches a lone asterisk, numbers or "1." steps.
    expect(plainLine("1. R$ 1.500 * 2")).toBe("1. R$ 1.500 * 2");
  });

  it("a marker split across streamed pieces is still removed", async () => {
    async function* pieces(): AsyncIterable<AnswerChunk> {
      for (const t of ["Abra **Configu", "rações → Equipe*", "*.\nDepois - n", "ão\n"]) yield { kind: "delta", text: t };
      yield { kind: "done" } as AnswerChunk;
    }
    const out: AnswerChunk[] = [];
    for await (const c of plainForApp(pieces())) out.push(c);
    expect(textOf(out)).toBe("Abra Configurações → Equipe.\nDepois - não\n");
    expect(out.at(-1)).toEqual({ kind: "done" });
  });

  it("the route: the app gets plain text, the website keeps its markdown", async () => {
    const answer = "Em **Configurações → Equipe**, toque em **Convidar**.\n[[open:C4]]";
    expect(textOf(await run("app", answer))).toBe("Em Configurações → Equipe, toque em Convidar.\n");
    expect(textOf(await run("web", answer))).toBe("Em **Configurações → Equipe**, toque em **Convidar**.\n");
  });
});

describe("the app's Open screen goes to the right Settings sheet", () => {
  it("C4 (invite a secretary) → Settings with section team", async () => {
    const open = (await run("app", "Veja.\n[[open:C4]]")).find((c) => c.kind === "block" && c.block.type === "open");
    expect(open && open.kind === "block" && open.block.type === "open" ? open.block.target : null).toEqual({ screen: "settings", params: { section: "team" } });
  });

  it("C2 (working hours) → section hours; a plain settings article → no section", async () => {
    const target = async (id: string) => {
      const o = (await run("app", `Veja.\n[[open:${id}]]`)).find((c) => c.kind === "block" && c.block.type === "open");
      return o && o.kind === "block" && o.block.type === "open" ? o.block.target : null;
    };
    expect(await target("C2")).toEqual({ screen: "settings", params: { section: "hours" } });
    expect(await target("C8")).toEqual({ screen: "settings" });
  });
});
