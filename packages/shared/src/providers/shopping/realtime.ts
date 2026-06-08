import type { ShoppingProvider } from "./types";
import type { ShoppingSearchParams, Product, Price } from "../../types";

const BASE = "https://real-time-product-search.p.rapidapi.com";

function makePrice(amount: number, currency: string, formatted?: string): Price {
  return {
    amount,
    currency,
    formatted:
      formatted ??
      new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount),
  };
}

function parseAmount(raw: string | number | undefined): number {
  if (!raw) return 0;
  if (typeof raw === "number") return raw;
  return parseFloat(raw.replace(/[^0-9.]/g, "")) || 0;
}

interface RapidOffer {
  store_name?: string;
  offer_page_url?: string;
  price?: string;
  original_price?: string;
  shipping?: string;
  condition?: string;
}

interface RapidProduct {
  product_id?: string;
  product_title?: string;
  product_description?: string;
  thumbnail?: string;
  product_photos?: string[];
  product_rating?: number | string;
  product_num_reviews?: number | string;
  typical_price_range?: [string, string];
  offers?: RapidOffer[];
  offer?: RapidOffer;
}

export class RealTimeProductSearchProvider implements ShoppingProvider {
  readonly name = "Real-Time Product Search";
  readonly supportedCountries: string[] = [];

  constructor(private readonly apiKey: string) {}

  private headers() {
    return {
      "x-rapidapi-host": "real-time-product-search.p.rapidapi.com",
      "x-rapidapi-key": this.apiKey,
    };
  }

  async search(params: ShoppingSearchParams): Promise<Product[]> {
    const qs = new URLSearchParams({
      q: params.query,
      country: params.country.toLowerCase(),
      language: "en",
      limit: "20",
      sort_by: params.sortBy === "price_low"
        ? "LOWEST_PRICE"
        : params.sortBy === "price_high"
        ? "HIGHEST_PRICE"
        : params.sortBy === "review_score"
        ? "TOP_RATED"
        : "BEST_MATCH",
    });

    if (params.minPrice !== undefined) qs.set("min_price", String(Math.round(params.minPrice)));
    if (params.maxPrice !== undefined) qs.set("max_price", String(Math.round(params.maxPrice)));

    const res = await fetch(`${BASE}/search?${qs}`, {
      headers: this.headers(),
      next: { revalidate: 300 },
    });

    if (!res.ok) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(`[RealTimeProductSearch] HTTP ${res.status} for query="${params.query}"`);
      }
      return [];
    }

    const data = (await res.json()) as { data?: RapidProduct[] };

    if (process.env.NODE_ENV !== "production" && data.data?.[0]) {
      console.log("[RealTimeProductSearch] first result keys:", Object.keys(data.data[0]));
      console.log("[RealTimeProductSearch] first result sample:", JSON.stringify(data.data[0], null, 2).slice(0, 800));
    }

    const results = data.data ?? [];

    return results.slice(0, 24).map((r) => {
      const bestOffer: RapidOffer | undefined = r.offers?.[0] ?? r.offer;
      const rawPrice = parseAmount(bestOffer?.price ?? r.typical_price_range?.[0]);
      const rawOldPrice = parseAmount(bestOffer?.original_price);

      const offers = (r.offers ?? (bestOffer ? [bestOffer] : [])).map((o: RapidOffer) => ({
        retailer: o.store_name ?? "Unknown",
        price: makePrice(parseAmount(o.price), params.currency, o.price),
        originalPrice: o.original_price
          ? makePrice(parseAmount(o.original_price), params.currency, o.original_price)
          : undefined,
        link: o.offer_page_url ?? "",
        delivery: o.shipping,
        condition: o.condition,
      }));

      const photos = r.product_photos ?? (r.thumbnail ? [r.thumbnail] : []);

      return {
        id: r.product_id ?? String(Math.random()),
        title: r.product_title ?? "",
        thumbnail: r.thumbnail ?? photos[0] ?? "",
        images: photos,
        rating: r.product_rating ? Number(r.product_rating) : undefined,
        reviewCount: r.product_num_reviews ? Number(r.product_num_reviews) : undefined,
        price: makePrice(rawPrice, params.currency, bestOffer?.price),
        originalPrice:
          rawOldPrice && rawOldPrice > rawPrice
            ? makePrice(rawOldPrice, params.currency, bestOffer?.original_price)
            : undefined,
        offers,
        description: r.product_description,
        link: bestOffer?.offer_page_url ?? "",
        source: bestOffer?.store_name ?? "",
        delivery: bestOffer?.shipping,
        provider: this.name,
      } satisfies Product;
    });
  }
}
