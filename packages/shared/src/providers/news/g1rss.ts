import type { NewsProvider } from "./types";
import type { NewsSearchParams, NewsArticle, NewsCategory } from "../../types";
import { fetchRSSFeed } from "./rss";

const FEED_BY_CATEGORY: Record<NewsCategory, string> = {
  general:       "https://g1.globo.com/dynamo/rss2.xml",
  business:      "https://g1.globo.com/dynamo/economia/rss2.xml",
  technology:    "https://g1.globo.com/dynamo/tecnologia/rss2.xml",
  sports:        "https://g1.globo.com/dynamo/esportes/rss2.xml",
  entertainment: "https://g1.globo.com/dynamo/rss2.xml",
  health:        "https://g1.globo.com/dynamo/rss2.xml",
  science:       "https://g1.globo.com/dynamo/rss2.xml",
};

export class G1RSSProvider implements NewsProvider {
  readonly name = "G1 Globo";
  readonly supportedCountries = ["BR"];

  async search(params: NewsSearchParams): Promise<NewsArticle[]> {
    const category = params.category ?? "general";
    const feedUrl = FEED_BY_CATEGORY[category];
    return fetchRSSFeed({ url: feedUrl, sourceName: "G1 Globo", language: "pt", category });
  }
}
