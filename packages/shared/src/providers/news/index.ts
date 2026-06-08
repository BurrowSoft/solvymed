export { NewsAPIProvider } from "./newsapi";
export { GNewsProvider } from "./gnews";
export { GuardianNewsProvider } from "./guardian";
export { BangkokPostRSSProvider } from "./bangkokpost";
export { G1RSSProvider } from "./g1rss";
export { NewsDataProvider } from "./newsdata";
export { MediaStackProvider } from "./mediastack";
export type { NewsProvider } from "./types";

import { ProviderRouter } from "../base";
import { NewsAPIProvider } from "./newsapi";
import { GNewsProvider } from "./gnews";
import { GuardianNewsProvider } from "./guardian";
import { BangkokPostRSSProvider } from "./bangkokpost";
import { G1RSSProvider } from "./g1rss";
import { NewsDataProvider } from "./newsdata";
import { MediaStackProvider } from "./mediastack";
import type { NewsSearchParams, NewsArticle } from "../../types";

export function createNewsRouter(
  country = "US",
  language = "en"
): ProviderRouter<NewsSearchParams, NewsArticle> {
  const providers = [];

  const isTH = country === "TH";
  const isBR = country === "BR";
  const isUS = country === "US";

  if (isTH) {
    providers.push(new BangkokPostRSSProvider());
    if (process.env.NEWSDATA_API_KEY)
      providers.push(new NewsDataProvider(process.env.NEWSDATA_API_KEY, "TH", "en"));
    if (process.env.MEDIASTACK_API_KEY)
      providers.push(new MediaStackProvider(process.env.MEDIASTACK_API_KEY, "th", "en"));
    if (process.env.GNEWS_API_KEY)
      providers.push(new GNewsProvider(process.env.GNEWS_API_KEY));
    if (process.env.NEWS_API_KEY)
      providers.push(new NewsAPIProvider(process.env.NEWS_API_KEY));
    return new ProviderRouter(providers);
  }

  if (isBR) {
    providers.push(new G1RSSProvider());
    if (process.env.NEWSDATA_API_KEY)
      providers.push(new NewsDataProvider(process.env.NEWSDATA_API_KEY, "BR", "en"));
    if (process.env.MEDIASTACK_API_KEY)
      providers.push(new MediaStackProvider(process.env.MEDIASTACK_API_KEY, "br", "pt"));
    if (process.env.GNEWS_API_KEY)
      providers.push(new GNewsProvider(process.env.GNEWS_API_KEY));
    if (process.env.NEWS_API_KEY)
      providers.push(new NewsAPIProvider(process.env.NEWS_API_KEY));
    return new ProviderRouter(providers);
  }

  if (process.env.NEWS_API_KEY)
    providers.push(new NewsAPIProvider(process.env.NEWS_API_KEY));
  if (process.env.GNEWS_API_KEY)
    providers.push(new GNewsProvider(process.env.GNEWS_API_KEY));
  if (process.env.GUARDIAN_API_KEY)
    providers.push(new GuardianNewsProvider(process.env.GUARDIAN_API_KEY));
  if (!isUS && process.env.NEWSDATA_API_KEY)
    providers.push(new NewsDataProvider(process.env.NEWSDATA_API_KEY, country, language));
  if (!isUS && process.env.MEDIASTACK_API_KEY)
    providers.push(new MediaStackProvider(process.env.MEDIASTACK_API_KEY, country.toLowerCase(), language));

  return new ProviderRouter(providers);
}
