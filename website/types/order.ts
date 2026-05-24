import type { CustomizationFieldType } from "@/types/customization";

export interface OrderItemCustomization {
  key: string;
  label: string;
  field_type: CustomizationFieldType;
  value: string | { url: string; public_id?: string };
  label_value: string;
  surcharge_pence: number;
  image_url?: string;
  image_public_id?: string;
  option_id?: string;
  preview_image_url?: string;
}

export interface OrderItem {
  id: string;
  product_name: string;
  variant_sku: string;
  variant_option_label: string;
  unit_price: number;
  quantity: number;
  line_total: number;
  image_url: string;
  fulfillment_status: string;
  customizations: OrderItemCustomization[];
  customization_surcharge: number;
}

export interface Order {
  id: string;
  order_number: string;
  status: string;
  email: string;
  subtotal: number;
  shipping_cost: number;
  discount_amount: number;
  promotion_code: string;
  total: number;
  created_at: string;
  paid_at: string | null;
  items: OrderItem[];
  shipping_full_name: string;
  shipping_address_line_1: string;
  shipping_address_line_2: string;
  shipping_city: string;
  shipping_county: string;
  shipping_postcode: string;
  shipping_country: string;
}

export interface OrderListItem {
  id: string;
  order_number: string;
  status: string;
  total: number;
  created_at: string;
  item_count: number;
}
