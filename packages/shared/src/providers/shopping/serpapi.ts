import type { ShoppingProvider } from "./types";
import type { ShoppingSearchParams, Product, Price } from "../../types";

const BASE = "https://serpapi.com/search.json";

function makePrice(amount: number, currency: string, formatted?: string): Price {
  return {
    amount,
    currency,
    formatted:
      formatted ??
      new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount),
  };
}

export class SerpApiShoppingProvider implements ShoppingProvider {
  readonly name = "Google Shopping";
  readonly supportedCountries: string[] = [];

  constructor(private readonly apiKey: string) {}

  async search(params: ShoppingSearchParams): Promise<Product[]> {
    const tbsParts: string[] = [];

    if (params.minPrice !== undefined || params.maxPrice !== undefined) {
      tbsParts.push("mr:1", "price:1");
      if (params.minPrice !== undefined) tbsParts.push(`ppr_min:${Math.round(params.minPrice)}`);
      if (params.maxPrice !== undefined) tbsParts.push(`ppr_max:${Math.round(params.maxPrice)}`);
    }

    if (params.sortBy === "price_low") tbsParts.push("p_ord:p");
    else if (params.sortBy === "price_high") tbsParts.push("p_ord:pd");
    else if (params.sortBy === "review_score") tbsParts.push("p_ord:rv");

    const qs = new URLSearchParams({
      engine: "google_shopping",
      q: params.query,
      api_key: this.apiKey,
      gl: params.country.toLowerCase(),
      hl: "en",
      num: "20",
    });

    if (tbsParts.length > 0) qs.set("tbs", tbsParts.join(","));

    const res = await fetch(`${BASE}?${qs}`, { next: { revalidate: 300 } });
    if (!res.ok) return [];

    const data = (await res.json()) as Record<string, unknown>;
    const results = ((data.shopping_results as Record<string, unknown>[]) ?? []);

    return results.slice(0, 24).map((r) => {
      const rawPrice = (r.extracted_price as number | undefined) ?? 0;
      const rawOldPrice = r.extracted_old_price as number | undefined;
      const currency = params.currency;

      return {
        id: String(r.product_id ?? r.position ?? ""),
        title: String(r.title ?? ""),
        thumbnail: String(r.thumbnail ?? ""),
        images: r.thumbnail ? [String(r.thumbnail)] : [],
        rating: r.rating as number | undefined,
        reviewCount: r.reviews as number | undefined,
        price: makePrice(rawPrice, currency, r.price as string | undefined),
        originalPrice: rawOldPrice
          ? makePrice(rawOldPrice, currency, r.old_price as string | undefined)
          : undefined,
        offers: [
          {
            retailer: String(r.source ?? ""),
            price: makePrice(rawPrice, currency, r.price as string | undefined),
            originalPrice: rawOldPrice
              ? makePrice(rawOldPrice, currency, r.old_price as string | undefined)
              : undefined,
            link: String(r.link ?? ""),
            delivery: r.delivery as string | undefined,
          },
        ],
        link: String(r.link ?? ""),
        source: String(r.source ?? ""),
        delivery: r.delivery as string | undefined,
        provider: this.name,
      } satisfies Product;
    });
  }

  async getProductDetail(productId: string, currency: string): Promise<Product | null> {
    const qs = new URLSearchParams({
      engine: "google_product",
      product_id: productId,
      api_key: this.apiKey,
    });

    const res = await fetch(`${BASE}?${qs}`, { next: { revalidate: 600 } });
    if (!res.ok) return null;

    const data = (await res.json()) as Record<string, unknown>;
    const pr = data.product_results as Record<string, unknown> | undefined;
    if (!pr) return null;

    const prices = (data.prices as Record<string, unknown>[]) ?? [];
    const reviewsData = data.reviews_results as Record<string, unknown> | undefined;
    const media = (pr.media as Record<string, unknown>[]) ?? [];

    const images = media
      .filter((m) => m.type === "image")
      .map((m) => String(m.link ?? ""))
      .filter(Boolean);

    const offers = prices.map((p) => ({
      retailer: String(p.name ?? ""),
      price: makePrice(
        (p.extracted_price as number | undefined) ?? 0,
        currency,
        p.base_price as string | undefined
      ),
      link: String(p.link ?? ""),
      delivery: (p.additional_price as Record<string, string> | undefined)?.shipping,
      condition: p.tag as string | undefined,
    }));

    const firstOffer = offers[0];
    const basePrice = firstOffer?.price ?? makePrice(0, currency);

    return {
      id: productId,
      title: String(pr.title ?? ""),
      thumbnail: images[0] ?? "",
      images: images.length > 0 ? images : [],
      rating:
        (reviewsData?.rating as number | undefined) ??
        (pr.rating as number | undefined),
      reviewCount:
        (reviewsData?.reviews as number | undefined) ??
        (pr.reviews as number | undefined),
      price: basePrice,
      offers,
      description: pr.description as string | undefined,
      highlights: pr.highlights as string[] | undefined,
      link: firstOffer?.link ?? "",
      source: firstOffer?.retailer ?? "",
      provider: this.name,
    } satisfies Product;
  }
}
