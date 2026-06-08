export { SerpApiShoppingProvider } from "./serpapi";
export { RealTimeProductSearchProvider } from "./realtime";
export type { ShoppingProvider } from "./types";

import { ProviderRouter } from "../base";
import { SerpApiShoppingProvider } from "./serpapi";
import { RealTimeProductSearchProvider } from "./realtime";
import type { ShoppingSearchParams, Product } from "../../types";

export function createShoppingRouter(): ProviderRouter<ShoppingSearchParams, Product> {
  const providers: (SerpApiShoppingProvider | RealTimeProductSearchProvider)[] = [];

  if (process.env.SERPAPI_KEY) {
    providers.push(new SerpApiShoppingProvider(process.env.SERPAPI_KEY));
  }
  if (process.env.RAPIDAPI_KEY) {
    providers.push(new RealTimeProductSearchProvider(process.env.RAPIDAPI_KEY));
  }

  return new ProviderRouter(providers);
}

export function createShoppingProvider(): SerpApiShoppingProvider | null {
  if (!process.env.SERPAPI_KEY) return null;
  return new SerpApiShoppingProvider(process.env.SERPAPI_KEY);
}
