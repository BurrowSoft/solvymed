import OpenAI from "openai";
import type { AISummary, SearchDomain } from "../types";
import { buildSummaryPrompt } from "./prompts";

let _client: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

export async function summarize(
  domain: SearchDomain,
  results: unknown[],
  country: string
): Promise<AISummary | null> {
  const client = getClient();
  if (!process.env.OPENAI_API_KEY) {
    console.error("[AI] OPENAI_API_KEY not set");
    return null;
  }
  if (!client || results.length === 0) return null;

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: buildSummaryPrompt(domain, results.slice(0, 10), country),
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 500,
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) return null;

    const parsed = JSON.parse(raw) as AISummary;
    return parsed;
  } catch {
    return null;
  }
}
