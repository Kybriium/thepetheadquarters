export interface Product {
  id: string;
  slug: string;
  name: string;
  short_description: string;
  brand_id: string | null;
  is_featured: boolean;
  average_rating: number;
  review_count: number;
  primary_image: string | null;
  primary_image_alt: string;
  min_price: number | null;
  max_price: number | null;
  /**
   * Compare-at price of the cheapest variant when on sale. Returned as
   * null when the product has no discount (storefront renders the
   * "SAVE £X / -N%" sale badge based on this).
   */
  min_compare_at_price: number | null;
  in_stock: boolean;
}

export interface ProductBrandRef {
  id: string;
  slug: string;
  name: string;
}

/**
 * Optional size table populated by the admin per product. Empty shape
 * (no columns / no rows) means the product doesn't ship with sizing
 * info and the PDP hides the Size & Fit block entirely.
 */
export interface ProductSizeChart {
  columns?: string[];
  rows?: string[][];
}

/**
 * Category-level "how to measure" guide propagated onto every product
 * in that category. The backend already picks the first associated
 * category and inlines it on the detail response, so the frontend
 * doesn't need a second request.
 */
export interface ProductMeasureGuide {
  text: string;
  image_url: string;
}

export interface ProductDetail extends Product {
  description: string;
  meta_title: string;
  meta_description: string;
  brand: ProductBrandRef | null;
  translations: ProductTranslation[];
  variants: ProductVariant[];
  images: ProductImage[];
  category_ids: string[];
  is_customizable: boolean;
  option_types: ProductOptionType[];
  size_chart?: ProductSizeChart;
  fit_notes?: string;
  measure_guide?: ProductMeasureGuide | null;
}

export interface ProductTranslation {
  language: string;
  name: string;
  description: string;
  short_description: string;
}

export interface ProductVariant {
  id: string;
  sku: string;
  price: number;
  compare_at_price: number | null;
  stock_quantity: number;
  weight_grams: number | null;
  is_active: boolean;
  is_on_sale: boolean;
  in_stock: boolean;
  sort_order: number;
  option_values: OptionValue[];
  images: ProductImage[];
}

export interface ProductImage {
  id: string;
  url: string;
  alt_text: string;
  is_primary: boolean;
  sort_order: number;
  variant: string | null;
}

export interface OptionValue {
  id: string;
  value: string;
  option_type_id: string;
  swatch_hex?: string;
  swatch_image_url?: string;
  sort_order?: number;
}

export interface ProductOptionType {
  id: string;
  code: string;
  name: string;
  sort_order: number;
}
