import type { FlightProvider } from "./types";
import type { FlightSearchParams, Flight, Price } from "../../types";
import { getCurrencyForCountry } from "../../geo";

const BASE = "https://flights-sky.p.rapidapi.com";

// In-process cache for entity ID lookups — avoids re-fetching within a warm function
const locationCache = new Map<string, { skyId: string; entityId: string; city: string; country: string }>();

function price(amount: number, currency: string): Price {
  return {
    amount,
    currency,
    formatted: new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount),
  };
}

export class FlightScraperSkyProvider implements FlightProvider {
  readonly name = "Flights Sky";
  readonly supportedCountries: string[] = [];

  constructor(private readonly apiKey: string) {}

  private get headers() {
    return {
      "x-rapidapi-host": "flights-sky.p.rapidapi.com",
      "x-rapidapi-key": this.apiKey,
    };
  }

  async search(params: FlightSearchParams): Promise<Flight[]> {
    const currency = params.currency || getCurrencyForCountry(params.country);
    const market = params.country || "US";
    const locale = "en-US";
    const cabinClass = params.cabinClass ?? "economy";

    const [origin, destination] = await Promise.all([
      this.resolveLocation(params.origin),
      this.resolveLocation(params.destination),
    ]);
    if (!origin || !destination) return [];

    const isRoundtrip = !!params.returnDate;
    const endpoint = isRoundtrip ? "/flights/search-roundtrip" : "/flights/search-one-way";

    const searchParams = new URLSearchParams({
      fromEntityId: origin.entityId,
      toEntityId: destination.entityId,
      departDate: params.departureDate,
      adults: String(params.adults),
      currency,
      market,
      locale,
      cabinClass,
    });
    if (isRoundtrip && params.returnDate) {
      searchParams.set("returnDate", params.returnDate);
    }

    const res = await fetch(`${BASE}${endpoint}?${searchParams}`, {
      headers: this.headers,
      cache: "no-store",
    });
    if (!res.ok) return [];

    const data = await res.json();

    // Handle incomplete status — poll once more if needed
    let finalData = data;
    if (data?.data?.context?.status === "incomplete" && data?.data?.context?.sessionId) {
      await new Promise(r => setTimeout(r, 2000));
      const pollRes = await fetch(
        `${BASE}/flights/search-incomplete?sessionId=${data.data.context.sessionId}`,
        { headers: this.headers, cache: "no-store" }
      );
      if (pollRes.ok) finalData = await pollRes.json();
    }

    const itineraries: unknown[] = finalData?.data?.itineraries ?? [];
    return itineraries.slice(0, 15).map(it => this.mapItinerary(it, origin, destination, currency, params));
  }

  private mapItinerary(
    it: unknown,
    origin: { city: string; country: string },
    destination: { city: string; country: string },
    currency: string,
    params: FlightSearchParams,
  ): Flight {
    const i = it as Record<string, unknown>;
    const legs = (i.legs as unknown[]) ?? [];
    const leg = (legs[0] ?? {}) as Record<string, unknown>;

    const carriers = (leg.carriers as Record<string, unknown>) ?? {};
    const marketing = ((carriers.marketing as unknown[]) ?? [])[0] as Record<string, unknown> | undefined;

    const pricingOptions = (i.pricingOptions as unknown[]) ?? [];
    const firstPrice = pricingOptions[0] as Record<string, unknown> | undefined;
    const priceAmount = Number((firstPrice?.price as Record<string, unknown>)?.amount ?? (i.price as Record<string, unknown>)?.raw ?? 0);
    const deepLink = String(firstPrice?.deepLink ?? "https://www.skyscanner.com");

    const segments = (leg.segments as unknown[]) ?? [];
    const firstSeg = (segments[0] ?? {}) as Record<string, unknown>;
    const carrierCode = String(marketing?.alternateId ?? "");
    const flightNo = `${carrierCode}${String(firstSeg.flightNumber ?? "")}`.trim();

    return {
      id: String(i.id ?? Math.random()),
      origin: {
        code: String((leg.origin as Record<string, unknown>)?.displayCode ?? params.origin),
        name: String((leg.origin as Record<string, unknown>)?.name ?? params.origin),
        city: origin.city,
        country: origin.country,
      },
      destination: {
        code: String((leg.destination as Record<string, unknown>)?.displayCode ?? params.destination),
        name: String((leg.destination as Record<string, unknown>)?.name ?? params.destination),
        city: destination.city,
        country: destination.country,
      },
      departureTime: String(leg.departure ?? ""),
      arrivalTime: String(leg.arrival ?? ""),
      airline: String(marketing?.name ?? ""),
      airlineLogo: marketing?.logoUrl ? String(marketing.logoUrl) : undefined,
      flightNumber: flightNo,
      price: price(priceAmount, currency),
      durationMinutes: Number(leg.durationInMinutes ?? 0),
      stops: Number(leg.stopCount ?? Math.max(0, segments.length - 1)),
      bookingUrl: deepLink,
      provider: this.name,
    } satisfies Flight;
  }

  private async resolveLocation(query: string) {
    if (locationCache.has(query)) return locationCache.get(query)!;

    const res = await fetch(
      `${BASE}/flights/auto-complete?query=${encodeURIComponent(query)}`,
      { headers: this.headers, cache: "no-store" }
    );
    if (!res.ok) return null;

    const data = await res.json();
    const places: unknown[] = data?.data ?? [];
    const place = places.find(p => {
      const pp = p as Record<string, unknown>;
      const nav = pp.navigation as Record<string, unknown> | undefined;
      return nav?.entityType === "AIRPORT" || nav?.entityType === "CITY";
    }) as Record<string, unknown> | undefined ?? places[0] as Record<string, unknown> | undefined;

    if (!place) return null;

    const nav = (place.navigation as Record<string, unknown>) ?? {};
    const result = {
      skyId: String((place.skyId as string) ?? (nav.relevantFlightParams as Record<string, unknown> | undefined)?.skyId ?? ""),
      entityId: String(nav.entityId ?? ""),
      city: String((place.presentation as Record<string, unknown>)?.subtitle ?? query),
      country: String((place.presentation as Record<string, unknown>)?.subtitle ?? ""),
    };
    locationCache.set(query, result);
    return result;
  }
}
