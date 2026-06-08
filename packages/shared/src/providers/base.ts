export interface Provider<TParams, TResult> {
  readonly name: string;
  readonly supportedCountries: string[]; // empty = all countries
  search(params: TParams): Promise<TResult[]>;
}

export class ProviderRouter<TParams, TResult> {
  constructor(private readonly providers: Provider<TParams, TResult>[]) {}

  getProvidersForCountry(country: string): Provider<TParams, TResult>[] {
    const specific = this.providers.filter(
      (p) => p.supportedCountries.length > 0 && p.supportedCountries.includes(country)
    );
    if (specific.length > 0) return specific;

    const global = this.providers.filter((p) => p.supportedCountries.length === 0);
    return global.length > 0 ? global : this.providers.slice(0, 1);
  }

  async search(params: TParams, country: string): Promise<TResult[]> {
    const providers = this.getProvidersForCountry(country);
    const results = await Promise.allSettled(providers.map((p) => p.search(params)));
    return results
      .filter((r): r is PromiseFulfilledResult<TResult[]> => r.status === "fulfilled")
      .flatMap((r) => r.value);
  }
}
