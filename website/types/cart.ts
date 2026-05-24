import type { CustomizationAnswer, CustomizationSummary } from "@/types/customization";

export interface CartItem {
  /**
   * Stable per-line identifier. Two cart entries for the same variant with
   * different customizations get different lineIds so they don't merge.
   * Generated locally on add; not sent to the server.
   */
  lineId: string;
  productId: string;
  variantId: string;
  name: string;
  image: string | null;
  /** Base variant price in pence, BEFORE customization surcharge. */
  price: number;
  /** Per-unit surcharge from customizations, already validated by the server. */
  customizationSurcharge: number;
  sku: string;
  optionLabel: string;
  quantity: number;
  slug: string;
  /** Raw answers sent to the server during checkout. Empty if not customized. */
  customizations: CustomizationAnswer[];
  /** Human-readable summary shown in cart UI. Empty if not customized. */
  customizationSummary: CustomizationSummary[];
}
