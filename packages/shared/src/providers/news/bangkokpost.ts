import type { NewsProvider } from "./types";
import type { NewsSearchParams, NewsArticle, NewsCategory } from "../../types";
import { fetchRSSFeed } from "./rss";

const FEED_BY_CATEGORY: Record<NewsCategory, string> = {
  general:       "https://www.bangkokpost.com/rss/data/topstories.xml",
  business:      "https://www.bangkokpost.com/rss/data/business.xml",
  technology:    "https://www.bangkokpost.com/rss/data/tech.xml",
  sports:        "https://www.bangkokpost.com/rss/data/sports.xml",
  entertainment: "https://www.bangkokpost.com/rss/data/topstories.xml",
  health:        "https://www.bangkokpost.com/rss/data/topstories.xml",
  science:       "https://www.bangkokpost.com/rss/data/topstories.xml",
};

export class BangkokPostRSSProvider implements NewsProvider {
  readonly name = "Bangkok Post";
  readonly supportedCountries = ["TH"];

  async search(params: NewsSearchParams): Promise<NewsArticle[]> {
    const category = params.category ?? "general";
    const feedUrl = FEED_BY_CATEGORY[category];
    return fetchRSSFeed({ url: feedUrl, sourceName: "Bangkok Post", language: "en", category, enrichImages: true });
  }
}
