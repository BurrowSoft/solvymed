import type { FlightProvider } from "./types";
import type { FlightSearchParams, Flight, Price } from "../../types";
import { getCurrencyForCountry } from "../../geo";

const BASE = "https://api.tequila.kiwi.com/v2/search";

const CABIN_MAP: Record<string, string> = {
  economy: "M",
  business: "C",
  first: "F",
};

function price(amount: number, currency: string): Price {
  return {
    amount,
    currency,
    formatted: new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount),
  };
}

// Convert YYYY-MM-DD to DD/MM/YYYY (Kiwi format)
function toKiwiDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// Kiwi provides airline logo via their CDN
function kiwiLogoUrl(iata: string): string {
  return `https://images.kiwi.com/airlines/64x64/${iata}.png`;
}

interface KiwiRoute {
  flyFrom: string;
  flyTo: string;
  cityFrom: string;
  cityTo: string;
  airline: string;
  flight_no: number;
  local_departure: string;
  local_arrival: string;
  return: number;
}

interface KiwiFlight {
  id: string;
  flyFrom: string;
  flyTo: string;
  cityFrom: string;
  cityTo: string;
  countryFrom: { code: string; name: string };
  countryTo: { code: string; name: string };
  local_departure: string;
  local_arrival: string;
  duration: { total: number };
  price: number;
  airlines: string[];
  route: KiwiRoute[];
  deep_link: string;
}

function appendAffiliateId(url: string, affiliateId: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set("affiliate_id", affiliateId);
    return u.toString();
  } catch {
    return url;
  }
}

export class KiwiFlightProvider implements FlightProvider {
  readonly name = "Kiwi";
  readonly supportedCountries: string[] = [];

  constructor(
    private readonly apiKey: string,
    private readonly affiliateId?: string
  ) {}

  async search(params: FlightSearchParams): Promise<Flight[]> {
    const currency = params.currency || getCurrencyForCountry(params.country);
    const cabin = CABIN_MAP[params.cabinClass ?? "economy"] ?? "M";

    const searchParams = new URLSearchParams({
      fly_from: params.origin.toUpperCase(),
      fly_to: params.destination.toUpperCase(),
      date_from: toKiwiDate(params.departureDate),
      date_to: toKiwiDate(params.departureDate),
      adults: String(params.adults),
      selected_cabins: cabin,
      curr: currency,
      limit: "20",
      sort: "price",
    });
    if (params.children) searchParams.set("children", String(params.children));
    if (params.returnDate) {
      searchParams.set("return_from", toKiwiDate(params.returnDate));
      searchParams.set("return_to", toKiwiDate(params.returnDate));
    }

    const res = await fetch(`${BASE}?${searchParams.toString()}`, {
      headers: {
        apikey: this.apiKey,
        "Content-Type": "application/json",
      },
      next: { revalidate: 1800 },
    });
    if (!res.ok) return [];

    const data = await res.json() as { data?: KiwiFlight[] };
    const flights: KiwiFlight[] = data?.data ?? [];

    return flights.slice(0, 20).map((f) => {
      const outboundLegs = f.route.filter((r) => r.return === 0);
      const firstLeg = outboundLegs[0];
      const lastLeg = outboundLegs[outboundLegs.length - 1] ?? firstLeg;
      const stops = Math.max(0, outboundLegs.length - 1);
      const primaryAirline = f.airlines[0] ?? firstLeg?.airline ?? "";
      const durationMinutes = Math.round((f.duration?.total ?? 0) / 60);

      const flightNo = firstLeg
        ? `${firstLeg.airline}${firstLeg.flight_no}`
        : "";

      return {
        id: f.id,
        origin: {
          code: f.flyFrom,
          name: f.flyFrom,
          city: f.cityFrom,
          country: f.countryFrom?.name ?? "",
        },
        destination: {
          code: lastLeg?.flyTo ?? f.flyTo,
          name: lastLeg?.flyTo ?? f.flyTo,
          city: lastLeg?.cityTo ?? f.cityTo,
          country: f.countryTo?.name ?? "",
        },
        departureTime: firstLeg?.local_departure ?? f.local_departure,
        arrivalTime: lastLeg?.local_arrival ?? f.local_arrival,
        airline: primaryAirline,
        airlineLogo: primaryAirline ? kiwiLogoUrl(primaryAirline) : undefined,
        flightNumber: flightNo,
        price: price(f.price, currency),
        durationMinutes,
        stops,
        bookingUrl: this.affiliateId
          ? appendAffiliateId(f.deep_link, this.affiliateId)
          : f.deep_link,
        provider: this.name,
      } satisfies Flight;
    });
  }
}
