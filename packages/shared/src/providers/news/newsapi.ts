import type { NewsProvider } from "./types";
import type { NewsSearchParams, NewsArticle, NewsCategory } from "../../types";

const NEWSAPI_CATEGORY: Record<NewsCategory, string> = {
  general: "general",
  business: "business",
  technology: "technology",
  sports: "sports",
  entertainment: "entertainment",
  health: "health",
  science: "science",
};

interface NewsApiArticle {
  title: string;
  description: string | null;
  url: string;
  urlToImage: string | null;
  publishedAt: string;
  source: { id: string | null; name: string };
}

interface NewsApiResponse {
  status: string;
  totalResults: number;
  articles: NewsApiArticle[];
}

export class NewsAPIProvider implements NewsProvider {
  readonly name = "NewsAPI";
  readonly supportedCountries: string[] = []; // all countries

  constructor(private readonly apiKey: string) {}

  async search(params: NewsSearchParams): Promise<NewsArticle[]> {
    const pageSize = params.pageSize ?? 30;
    const language = params.language ?? "en";

    const url = new URL("https://newsapi.org/v2/top-headlines");
    url.searchParams.set("language", language);
    url.searchParams.set("pageSize", String(pageSize));
    if (params.query) url.searchParams.set("q", params.query);
    if (params.category) url.searchParams.set("category", NEWSAPI_CATEGORY[params.category]);
    url.searchParams.set("apiKey", this.apiKey);

    const res = await fetch(url.toString(), { next: { revalidate: 900 } });
    if (!res.ok) return [];

    const data: NewsApiResponse = await res.json();
    return data.articles
      .filter((a) => a.title && a.title !== "[Removed]" && a.url)
      .map((a) => ({
        id: a.url,
        title: a.title,
        description: a.description,
        url: a.url,
        imageUrl: a.urlToImage,
        publishedAt: a.publishedAt,
        source: a.source.name,
        provider: this.name,
      }));
  }
}
