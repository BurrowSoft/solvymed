import type { Provider } from "../base";
import type { ShoppingSearchParams, Product } from "../../types";

export interface ShoppingProvider extends Provider<ShoppingSearchParams, Product> {
  getProductDetail?(productId: string, currency: string): Promise<Product | null>;
}
