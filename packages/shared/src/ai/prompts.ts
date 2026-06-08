import type { SearchDomain } from "../types";

export function buildSummaryPrompt(
  domain: SearchDomain,
  results: unknown[],
  country: string
): string {
  const domainLabel: Record<SearchDomain, string> = {
    flights: "flight options",
    hotels: "hotel options",
    cars: "car rental options",
    news: "news articles",
    shopping: "shopping results",
  };

  const label = domainLabel[domain];

  return `You are a helpful travel and information assistant for BurrowSoft.

The user is from country code: ${country}

Here are ${results.length} ${label}:
${JSON.stringify(results, null, 2)}

Provide a concise analysis in JSON matching this exact schema:
{
  "summary": "2-3 sentence overview of the options",
  "highlights": ["key point 1", "key point 2", "key point 3"],
  "recommendation": "1 sentence actionable recommendation",
  "countryNote": "optional: any country-specific tip relevant to ${country} users, or null"
}

Be specific, factual, and helpful. Do not invent data not present in the results.`;
}
