import type { HotelProvider } from "./types";
import type { HotelSearchParams, Hotel, Price } from "../../types";
import { getCurrencyForCountry } from "../../geo";

const BASE = "https://booking-com15.p.rapidapi.com/api/v1";

function price(amount: number, currency: string): Price {
  return {
    amount,
    currency,
    formatted: new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount),
  };
}

export class BookingComHotelProvider implements HotelProvider {
  readonly name = "Booking.com";
  readonly supportedCountries: string[] = [];

  constructor(private readonly apiKey: string) {}

  private headers() {
    return {
      "x-rapidapi-host": "booking-com15.p.rapidapi.com",
      "x-rapidapi-key": this.apiKey,
      "Content-Type": "application/json",
    };
  }

  async search(params: HotelSearchParams): Promise<Hotel[]> {
    const currency = params.currency || getCurrencyForCountry(params.country);

    // Step 1: resolve destination to dest_id
    const destRes = await fetch(
      `${BASE}/hotels/searchDestination?query=${encodeURIComponent(params.destination)}`,
      { headers: this.headers(), next: { revalidate: 3600 } }
    );
    if (!destRes.ok) return [];

    const destData = await destRes.json();
    const dest = destData?.data?.[0];
    if (!dest) return [];

    // Step 2: search hotels
    const searchParams = new URLSearchParams({
      dest_id: dest.dest_id,
      search_type: dest.search_type,
      arrival_date: params.checkinDate,
      departure_date: params.checkoutDate,
      adults: String(params.adults),
      room_qty: String(params.rooms),
      currency_code: currency,
      languagecode: "en-us",
      units: "metric",
    });

    const hotelsRes = await fetch(
      `${BASE}/hotels/searchHotels?${searchParams.toString()}`,
      { headers: this.headers(), next: { revalidate: 1800 } }
    );
    if (!hotelsRes.ok) return [];

    const hotelsData = await hotelsRes.json();
    const hotels = hotelsData?.data?.hotels ?? [];

    return hotels.slice(0, 20).map((h: Record<string, unknown>) => {
      const prop = h.property as Record<string, unknown>;
      const priceBreakdown = h.priceBreakdown as Record<string, unknown> | undefined;
      const grossAmount = priceBreakdown?.grossPrice as Record<string, unknown> | undefined;
      const perNight = Number(grossAmount?.value ?? 0);
      const nights = this.nightsBetween(params.checkinDate, params.checkoutDate);

      return {
        id: String(prop?.id ?? ""),
        name: String(prop?.name ?? ""),
        location: {
          city: params.destination,
          country: String(prop?.countryCode ?? params.country),
          countryCode: String(prop?.countryCode ?? params.country),
          latitude: Number(prop?.latitude ?? 0),
          longitude: Number(prop?.longitude ?? 0),
        },
        starRating: Number(prop?.propertyClass ?? 0),
        reviewScore: Number(prop?.reviewScore ?? 0),
        reviewCount: Number(prop?.reviewCount ?? 0),
        pricePerNight: price(perNight, currency),
        totalPrice: price(perNight * nights, currency),
        images: prop?.photoUrls
          ? (prop.photoUrls as string[]).slice(0, 5)
          : [],
        amenities: [],
        bookingUrl: `https://www.booking.com/hotel/${String(prop?.countryCode ?? "").toLowerCase()}/${String(prop?.id ?? "")}.html`,
        provider: this.name,
      } satisfies Hotel;
    });
  }

  private nightsBetween(checkin: string, checkout: string): number {
    const diff = new Date(checkout).getTime() - new Date(checkin).getTime();
    return Math.max(1, Math.round(diff / 86400000));
  }
}
