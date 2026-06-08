import type { NewsArticle } from "../../types";
import type { NewsCategory } from "../../types";

/** Minimal RSS parser — no external dependencies. Works for Bangkok Post and G1 Globo feeds. */

function extractCDATA(block: string, tag: string): string {
  const cdata = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, "i"));
  if (cdata?.[1]) return cdata[1].trim();
  const plain = block.match(new RegExp(`<${tag}[^>]*>([^<]*)<\\/${tag}>`, "i"));
  return plain?.[1]?.trim() ?? "";
}

function extractAttr(block: string, tag: string, attr: string): string {
  const match = block.match(new RegExp(`<${tag}[^>]+${attr}="([^"]*)"`, "i"));
  return match?.[1] ?? "";
}

/** Fetch og:image from an article page. Times out after 3s to avoid blocking the feed. */
async function fetchOGImage(articleUrl: string): Promise<string | null> {
  try {
    const res = await fetch(articleUrl, {
      cache: "no-store",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; BurrowSoftBot/1.0)" },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    // Match both attribute orderings of og:image meta tags
    const match =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export interface RSSFeedConfig {
  url: string;
  sourceName: string;
  language: string;
  category: NewsCategory;
  /** Fetch og:image for articles without images (adds latency on cache miss) */
  enrichImages?: boolean;
}

export async function fetchRSSFeed(config: RSSFeedConfig): Promise<NewsArticle[]> {
  const res = await fetch(config.url, {
    cache: "no-store",
    headers: { "User-Agent": "Mozilla/5.0 (compatible; BurrowSoftBot/1.0)" },
  });

  if (!res.ok) return [];

  const xml = await res.text();
  const items = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];

  const articles = items.slice(0, 20).map((item): NewsArticle => {
    const title = extractCDATA(item, "title");
    const description = extractCDATA(item, "description");
    const url = extractCDATA(item, "link") ||
      extractAttr(item, "link", "href") ||
      (item.match(/<link>([^<]+)<\/link>/i)?.[1] ?? "");
    const publishedAt = extractCDATA(item, "pubDate") || extractCDATA(item, "dc:date") || "";

    const imageUrl =
      extractAttr(item, "enclosure", "url") ||
      extractAttr(item, "media:content", "url") ||
      extractAttr(item, "media:thumbnail", "url") ||
      "";

    return {
      id: url,
      title,
      description: description || null,
      url,
      imageUrl: imageUrl || null,
      publishedAt,
      source: config.sourceName,
      provider: config.sourceName,
    };
  }).filter(a => a.title && a.url);

  // Enrich articles missing images with og:image scraped in parallel
  if (config.enrichImages) {
    const missing = articles.filter(a => !a.imageUrl);
    if (missing.length > 0) {
      const images = await Promise.allSettled(missing.map(a => fetchOGImage(a.url)));
      missing.forEach((article, i) => {
        const result = images[i];
        if (result?.status === "fulfilled" && result.value) {
          article.imageUrl = result.value;
        }
      });
    }
  }

  return articles;
}
