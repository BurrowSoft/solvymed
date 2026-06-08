import type { FlightProvider } from "./types";
import type { FlightSearchParams, Flight, Price } from "../../types";
import { getCurrencyForCountry } from "../../geo";

const BASE = "https://skyscanner-flights4.p.rapidapi.com/api/v1";

function price(amount: number, currency: string): Price {
  return {
    amount,
    currency,
    formatted: new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount),
  };
}

interface SkyLocation {
  entityId: string;
  skyId: string;
  name: string;
  iataCode?: string;
  cityName?: string;
  countryName?: string;
}

export class SkyscannerFlightProvider implements FlightProvider {
  readonly name = "Skyscanner";
  readonly supportedCountries: string[] = [];

  constructor(private readonly apiKey: string) {}

  private headers() {
    return {
      "x-rapidapi-host": "skyscanner-flights4.p.rapidapi.com",
      "x-rapidapi-key": this.apiKey,
      "Content-Type": "application/json",
    };
  }

  async search(params: FlightSearchParams): Promise<Flight[]> {
    const currency = params.currency || getCurrencyForCountry(params.country);
    const locale = "en-US";
    const market = params.country || "US";

    const [origin, destination] = await Promise.all([
      this.resolveLocation(params.origin, locale, market),
      this.resolveLocation(params.destination, locale, market),
    ]);
    if (!origin || !destination) return [];

    const searchParams = new URLSearchParams({
      fromEntityId: origin.entityId,
      toEntityId: destination.entityId,
      departDate: params.departureDate,
      currency,
      locale,
      market,
      adults: String(params.adults),
      cabinClass: params.cabinClass ?? "economy",
    });
    if (params.returnDate) searchParams.set("returnDate", params.returnDate);

    const res = await fetch(
      `${BASE}/flights/search?${searchParams.toString()}`,
      { headers: this.headers(), next: { revalidate: 1800 } }
    );
    if (!res.ok) return [];

    const data = await res.json();
    const itineraries: unknown[] = data?.data?.itineraries ?? data?.itineraries ?? [];

    return itineraries.slice(0, 20).map((it) => {
      const i = it as Record<string, unknown>;
      const legs = (i.legs as unknown[]) ?? [];
      const firstLeg = (legs[0] ?? {}) as Record<string, unknown>;

      // Carrier info
      const carriers = (firstLeg.carriers as Record<string, unknown>) ?? {};
      const marketing = ((carriers.marketing as unknown[]) ?? [])[0] as Record<string, unknown> | undefined;
      const airlineName = String(marketing?.name ?? "");
      const airlineLogo = marketing?.logoUrl ? String(marketing.logoUrl) : undefined;

      // Pricing
      const pricingOptions = (i.pricingOptions as unknown[]) ?? [];
      const firstPricing = (pricingOptions[0] as Record<string, unknown> | undefined);
      const priceAmount = Number((firstPricing?.price as Record<string, unknown>)?.amount ?? 0);
      const deepLink = String(firstPricing?.deepLink ?? "https://www.skyscanner.com");

      // Segments for flight number and stop cities
      const segments = (firstLeg.segments as unknown[]) ?? [];
      const firstSeg = (segments[0] ?? {}) as Record<string, unknown>;
      const segOperating = (firstSeg.operatingCarrier as Record<string, unknown> | undefined);
      const carrierCode = String(marketing?.alternateId ?? segOperating?.alternateId ?? "");
      const flightNo = segments.length > 0
        ? `${carrierCode}${String(firstSeg.flightNumber ?? "")}`
        : "";

      // Stop cities from intermediate segment destinations
      const stopCodes: string[] = segments.slice(0, -1).map((s) => {
        const seg = s as Record<string, unknown>;
        return String((seg.destination as Record<string, unknown>)?.displayCode ?? "");
      }).filter(Boolean);

      const originCode = String(firstLeg.origin ?? params.origin);
      const destCode = String(firstLeg.destination ?? params.destination);

      return {
        id: String(i.id ?? Math.random()),
        origin: {
          code: originCode,
          name: originCode,
          city: origin.cityName ?? params.origin,
          country: origin.countryName ?? "",
        },
        destination: {
          code: destCode,
          name: destCode,
          city: destination.cityName ?? params.destination,
          country: destination.countryName ?? "",
        },
        departureTime: String(firstLeg.departure ?? ""),
        arrivalTime: String(firstLeg.arrival ?? ""),
        airline: airlineName,
        airlineLogo,
        flightNumber: flightNo,
        price: price(priceAmount, currency),
        durationMinutes: Number(firstLeg.durationInMinutes ?? 0),
        stops: Number(firstLeg.stopCount ?? stopCodes.length),
        bookingUrl: deepLink,
        provider: this.name,
      } satisfies Flight;
    });
  }

  private async resolveLocation(
    query: string,
    locale: string,
    market: string
  ): Promise<SkyLocation | null> {
    const res = await fetch(
      `${BASE}/autosuggest/flights?query=${encodeURIComponent(query)}&locale=${locale}&market=${market}`,
      { headers: this.headers(), next: { revalidate: 86400 } }
    );
    if (!res.ok) return null;

    const data = await res.json();
    const places: unknown[] = data?.places ?? data?.data?.places ?? [];
    const place = places.find(
      (p) => {
        const pp = p as Record<string, unknown>;
        return pp.type === "PLACE_TYPE_AIRPORT" || pp.type === "PLACE_TYPE_CITY";
      }
    ) as Record<string, unknown> | undefined ?? (places[0] as Record<string, unknown> | undefined);

    if (!place) return null;
    return {
      entityId: String(place.entityId ?? place.id ?? ""),
      skyId: String(place.skyId ?? ""),
      name: String(place.name ?? ""),
      iataCode: place.iataCode ? String(place.iataCode) : undefined,
      cityName: String(place.cityName ?? place.name ?? ""),
      countryName: String(place.countryName ?? ""),
    };
  }
}
