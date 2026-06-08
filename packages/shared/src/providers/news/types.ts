import type { Provider } from "../base";
import type { NewsSearchParams, NewsArticle } from "../../types";

export type NewsProvider = Provider<NewsSearchParams, NewsArticle>;
