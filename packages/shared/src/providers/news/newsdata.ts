import type { NewsProvider } from "./types";
import type { NewsSearchParams, NewsArticle, NewsCategory } from "../../types";

const CATEGORY_MAP: Record<NewsCategory, string> = {
  general:       "top",
  business:      "business",
  technology:    "technology",
  sports:        "sports",
  entertainment: "entertainment",
  health:        "health",
  science:       "science",
};

interface NewsDataArticle {
  title: string;
  description: string | null;
  link: string;
  image_url: string | null;
  pubDate: string;
  source_name: string;
}

interface NewsDataResponse {
  status: string;
  results: NewsDataArticle[];
}

export class NewsDataProvider implements NewsProvider {
  readonly name = "NewsData";
  readonly supportedCountries: string[] = [];

  constructor(
    private readonly apiKey: string,
    private readonly country: string,
    private readonly language: string
  ) {}

  async search(params: NewsSearchParams): Promise<NewsArticle[]> {
    if (!this.apiKey) {
      console.error("[NewsData] API key is missing");
      return [];
    }

    const category = CATEGORY_MAP[params.category ?? "general"];
    const url = new URL("https://newsdata.io/api/1/news");
    url.searchParams.set("apikey", this.apiKey);
    url.searchParams.set("country", this.country.toLowerCase());
    url.searchParams.set("language", this.language);
    url.searchParams.set("category", category);
    url.searchParams.set("size", String(Math.min(params.pageSize ?? 10, 10))); // free plan max 10

    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) {
      const text = await res.text();
      console.error("[NewsData] API error:", res.status, text.slice(0, 200));
      return [];
    }

    const data: NewsDataResponse = await res.json();
    if (data.status !== "success" || !data.results) {
      console.warn("[NewsData] No results or error status:", data.status);
      return [];
    }

    return data.results.map((a): NewsArticle => ({
      id: a.link,
      title: a.title,
      description: a.description ?? null,
      url: a.link,
      imageUrl: a.image_url,
      publishedAt: a.pubDate,
      source: a.source_name,
      provider: this.name,
    }));
  }
}
