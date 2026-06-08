import type { NewsProvider } from "./types";
import type { NewsSearchParams, NewsArticle, NewsCategory } from "../../types";

const GNEWS_TOPIC: Record<NewsCategory, string | null> = {
  general: null,
  business: "business",
  technology: "technology",
  sports: "sports",
  entertainment: "entertainment",
  health: "health",
  science: "science",
};

interface GNewsArticle {
  title: string;
  description: string;
  url: string;
  image: string | null;
  publishedAt: string;
  source: { name: string; url: string };
}

interface GNewsResponse {
  totalArticles: number;
  articles: GNewsArticle[];
}

export class GNewsProvider implements NewsProvider {
  readonly name = "GNews";
  readonly supportedCountries: string[] = [];

  constructor(private readonly apiKey: string) {}

  async search(params: NewsSearchParams): Promise<NewsArticle[]> {
    const max = params.pageSize ?? 10;
    const lang = params.language ?? "en";
    const country = params.country?.toLowerCase() ?? "us";

    const url = new URL("https://gnews.io/api/v4/top-headlines");
    url.searchParams.set("lang", lang);
    url.searchParams.set("country", country);
    url.searchParams.set("max", String(max));
    url.searchParams.set("apikey", this.apiKey);
    if (params.query) url.searchParams.set("q", params.query);
    const topic = params.category ? GNEWS_TOPIC[params.category] : null;
    if (topic) url.searchParams.set("topic", topic);

    const res = await fetch(url.toString(), { next: { revalidate: 900 } });
    if (!res.ok) return [];

    const data: GNewsResponse = await res.json();
    return data.articles.map((a) => ({
      id: a.url,
      title: a.title,
      description: a.description,
      url: a.url,
      imageUrl: a.image,
      publishedAt: a.publishedAt,
      source: a.source.name,
      provider: this.name,
    }));
  }
}
