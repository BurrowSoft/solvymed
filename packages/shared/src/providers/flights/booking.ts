import type { FlightProvider } from "./types";
import type { FlightSearchParams, Flight, Price } from "../../types";
import { getCurrencyForCountry } from "../../geo";

const BASE = "https://booking-com15.p.rapidapi.com/api/v1";

function price(amount: number, currency: string): Price {
  return {
    amount,
    currency,
    formatted: new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount),
  };
}

export class BookingComFlightProvider implements FlightProvider {
  readonly name = "Booking.com Flights";
  readonly supportedCountries: string[] = [];

  constructor(private readonly apiKey: string) {}

  private headers() {
    return {
      "x-rapidapi-host": "booking-com15.p.rapidapi.com",
      "x-rapidapi-key": this.apiKey,
    };
  }

  async search(params: FlightSearchParams): Promise<Flight[]> {
    const currency = params.currency || getCurrencyForCountry(params.country);

    const [fromAirport, toAirport] = await Promise.all([
      this.resolveAirport(params.origin),
      this.resolveAirport(params.destination),
    ]);
    if (!fromAirport || !toAirport) return [];

    const searchParams = new URLSearchParams({
      fromId: fromAirport.id,
      toId: toAirport.id,
      departDate: params.departureDate,
      adults: String(params.adults),
      children: String(params.children ?? 0),
      sort: "BEST",
      cabinClass: params.cabinClass?.toUpperCase() ?? "ECONOMY",
      currency_code: currency,
    });
    if (params.returnDate) searchParams.set("returnDate", params.returnDate);

    const res = await fetch(
      `${BASE}/flights/searchFlights?${searchParams.toString()}`,
      { headers: this.headers(), next: { revalidate: 1800 } }
    );
    if (!res.ok) return [];

    const data = await res.json();
    const offers: unknown[] = data?.data?.flightOffers ?? [];

    return offers.slice(0, 20).map((offer) => {
      const o = offer as Record<string, unknown>;

      // segments[0] = outbound, segments[1] = return (round-trip only)
      const segments = (o.segments as unknown[]) ?? [];
      const seg = (segments[0] ?? {}) as Record<string, unknown>;

      const dep = seg.departureAirport as Record<string, unknown> | undefined;
      const arr = seg.arrivalAirport as Record<string, unknown> | undefined;

      // Individual legs within the outbound segment
      const legs = (seg.legs as unknown[]) ?? [];
      const firstLeg = (legs[0] ?? {}) as Record<string, unknown>;
      const carriers = (firstLeg.carriersData as unknown[]) ?? [];
      const carrier = (carriers[0] ?? {}) as Record<string, unknown>;

      const flightInfo = firstLeg.flightInfo as Record<string, unknown> | undefined;
      const carrierCode = String(flightInfo?.carrierCode ?? carrier?.code ?? "");
      const flightNo = flightInfo?.flightNumber
        ? `${carrierCode}${String(flightInfo.flightNumber)}`
        : String(seg.flightNumber ?? "");

      const priceInfo = o.priceBreakdown as Record<string, unknown> | undefined;
      const total = priceInfo?.total as Record<string, unknown> | undefined;
      // total.units is the whole-dollar amount; total.nanos is the fractional part
      const priceAmount = Number(total?.units ?? 0) + Number(total?.nanos ?? 0) / 1_000_000_000;

      // totalTime is in seconds
      const durationMinutes = Math.round(Number(seg.totalTime ?? 0) / 60);
      const stops = Math.max(0, legs.length - 1);

      const deepLink = String(o.deepLink ?? o.shareableUrl ?? `https://www.booking.com/flights/`);

      return {
        id: `${String(o.token ?? Math.random())}-outbound`,
        origin: {
          code: String(dep?.code ?? params.origin),
          name: String(dep?.name ?? dep?.code ?? ""),
          city: String(dep?.cityName ?? ""),
          country: String(dep?.countryName ?? ""),
        },
        destination: {
          code: String(arr?.code ?? params.destination),
          name: String(arr?.name ?? arr?.code ?? ""),
          city: String(arr?.cityName ?? ""),
          country: String(arr?.countryName ?? ""),
        },
        departureTime: String(seg.departureTime ?? ""),
        arrivalTime: String(seg.arrivalTime ?? ""),
        airline: String(carrier?.name ?? seg.airline ?? ""),
        airlineLogo: carrier?.logo ? String(carrier.logo) : undefined,
        flightNumber: flightNo,
        price: price(priceAmount, currency),
        durationMinutes,
        stops,
        bookingUrl: deepLink,
        provider: this.name,
      } satisfies Flight;
    });
  }

  private async resolveAirport(query: string): Promise<{ id: string; name: string } | null> {
    const res = await fetch(
      `${BASE}/flights/searchDestination?query=${encodeURIComponent(query)}`,
      { headers: this.headers(), next: { revalidate: 86400 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const result = (data?.data ?? []).find(
      (d: Record<string, unknown>) => d.type === "AIRPORT" || d.type === "CITY"
    ) as Record<string, unknown> | undefined;
    if (!result) return null;
    return { id: String(result.id ?? ""), name: String(result.name ?? "") };
  }
}
