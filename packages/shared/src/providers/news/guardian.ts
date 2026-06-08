import type { NewsProvider } from "./types";
import type { NewsSearchParams, NewsArticle, NewsCategory } from "../../types";

interface GuardianFields {
  thumbnail?: string;
  trailText?: string;
  byline?: string;
}

interface GuardianResult {
  id: string;
  webTitle: string;
  webUrl: string;
  webPublicationDate: string;
  sectionName: string;
  fields?: GuardianFields;
}

interface GuardianResponse {
  response: {
    status: string;
    total: number;
    results: GuardianResult[];
  };
}

const GUARDIAN_SECTION: Record<NewsCategory, string | null> = {
  general: null,
  business: "business",
  technology: "technology",
  sports: "sport",
  entertainment: "culture",
  health: "lifeandstyle",
  science: "science",
};

export class GuardianNewsProvider implements NewsProvider {
  readonly name = "The Guardian";
  readonly supportedCountries: string[] = [];

  constructor(private readonly apiKey: string) {}

  async search(params: NewsSearchParams): Promise<NewsArticle[]> {
    const pageSize = params.pageSize ?? 20;

    const url = new URL("https://content.guardianapis.com/search");
    url.searchParams.set("api-key", this.apiKey);
    url.searchParams.set("show-fields", "thumbnail,trailText,byline");
    url.searchParams.set("page-size", String(pageSize));
    url.searchParams.set("order-by", "newest");
    if (params.query) url.searchParams.set("q", params.query);
    const section = params.category ? GUARDIAN_SECTION[params.category] : null;
    if (section) url.searchParams.set("section", section);

    const res = await fetch(url.toString(), { next: { revalidate: 900 } });
    if (!res.ok) return [];

    const data: GuardianResponse = await res.json();
    if (data.response.status !== "ok") return [];

    return data.response.results.map((a) => ({
      id: a.id,
      title: a.webTitle,
      description: a.fields?.trailText ?? null,
      url: a.webUrl,
      imageUrl: a.fields?.thumbnail ?? null,
      publishedAt: a.webPublicationDate,
      source: "The Guardian",
      provider: this.name,
    }));
  }
}
