export type AdminOrderStatus =
  | "pending"
  | "paid"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled";

export type CarrierCode = "royal_mail" | "dpd" | "evri" | "ups" | "other";

export const CARRIER_LABELS: Record<CarrierCode, string> = {
  royal_mail: "Royal Mail",
  dpd: "DPD",
  evri: "Evri",
  ups: "UPS",
  other: "Other",
};

export interface AdminOrderListItem {
  id: string;
  order_number: string;
  status: AdminOrderStatus;
  email: string;
  customer_name: string;
  total: number;
  vat_amount: number;
  item_count: number;
  tracking_carrier: string;
  tracking_number: string;
  created_at: string;
  paid_at: string | null;
  shipped_at: string | null;
}

export interface AdminOrderItemCustomization {
  key: string;
  label: string;
  field_type: "text" | "long_text" | "image" | "select" | "position";
  value: string | { url: string; public_id?: string };
  label_value: string;
  surcharge_pence: number;
  image_url?: string;
  image_public_id?: string;
  option_id?: string;
  preview_image_url?: string;
}

/** SupplierProduct row presented to the admin order page as a suggestion. */
export interface AdminOrderItemSupplierSuggestion {
  supplier_id: string;
  supplier_name: string;
  supplier_url: string;
  supplier_sku: string;
  last_cost_pence: number;
  is_preferred: boolean;
  notes: string;
}

/** Denormalised view of the supplier this OrderItem was forwarded to. */
export interface AdminOrderItemAssignedSupplier {
  supplier_id: string;
  supplier_name: string;
  supplier_url: string;
  supplier_sku: string;
  cost_pence: number;
  forwarded_at: string | null;
}

export interface AdminOrderItem {
  id: string;
  product_id: string | null;
  variant_id: string | null;
  product_name: string;
  variant_sku: string;
  variant_option_label: string;
  unit_price: number;
  quantity: number;
  line_total: number;
  vat_amount: number;
  cogs_amount: number;
  image_url: string;
  fulfillment_type: "self" | "dropship";
  fulfillment_status: "pending" | "processing" | "shipped" | "delivered";
  supplier_id: string | null;
  supplier_cost: number;
  forwarded_to_supplier_at: string | null;
  available_suppliers: AdminOrderItemSupplierSuggestion[];
  assigned_supplier: AdminOrderItemAssignedSupplier | null;
  customizations: AdminOrderItemCustomization[];
  customization_surcharge: number;
}

export interface AdminOrder {
  id: string;
  order_number: string;
  status: AdminOrderStatus;
  email: string;
  customer_id: string | null;
  user_id: string | null;
  shipping_full_name: string;
  shipping_address_line_1: string;
  shipping_address_line_2: string;
  shipping_city: string;
  shipping_county: string;
  shipping_postcode: string;
  shipping_country: string;
  shipping_phone: string;
  subtotal: number;
  shipping_cost: number;
  vat_amount: number;
  vat_rate: string;
  total: number;
  stripe_checkout_session_id: string;
  stripe_payment_intent_id: string;
  tracking_carrier: string;
  tracking_number: string;
  tracking_url: string;
  tracking_link: string;
  paid_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  refunded_at: string | null;
  refund_amount: number;
  internal_notes: string;
  created_at: string;
  updated_at: string;
  items: AdminOrderItem[];
  /** Expenses linked to this order (Stripe fees, dropship COGS, manual rows). */
  expenses?: AdminOrderExpense[];
}

/**
 * Minimal shape of an Expense as seen on the order detail page. The
 * full ExpenseSerializer payload from /admin/expenses/ is a superset
 * of this — listing only the fields the order page actually consumes
 * keeps the type focused.
 */
export interface AdminOrderExpense {
  id: string;
  paid_at: string;
  category: string;
  category_label: string;
  amount_pence: number;
  amount_pounds: number;
  description: string;
  supplier_name: string | null;
  receipt_filename: string;
  receipt_url: string | null;
  has_receipt: boolean;
  auto_created: boolean;
}

export interface AdminDashboard {
  today: {
    orders_count: number;
    revenue_pence: number;
    /** Sum of every Expense row paid today (auto + manual). */
    expenses_pence: number;
    /** revenue_pence − expenses_pence — the actual take-home for today. */
    net_pence: number;
    pending_count: number;
  };
  low_stock_count: number;
  dropship_pending_count: number;
  unread_messages_count: number;
  reviews_pending_reply_count: number;
  visitors_today_count: number;
  recent_orders: AdminOrderListItem[];
}

export interface AnalyticsOverview {
  date_from: string;
  date_to: string;
  totals: {
    visitors: number;
    sessions: number;
    pageviews: number;
    bounce_rate: number;
    avg_pages_per_session: number;
  };
  time_series: Array<{ date: string; visitors: number; pageviews: number }>;
  top_pages: Array<{ path: string; views: number; unique_visitors: number }>;
  top_referrers: Array<{ referrer_host: string; sessions: number }>;
  top_countries: Array<{ country: string; visitors: number }>;
  devices: Array<{ device_type: string; visitors: number }>;
  browsers: Array<{ browser: string; visitors: number }>;
  funnel: {
    visitors: number;
    product_views: number;
    add_to_cart: number;
    checkout_start: number;
    checkout_complete: number;
  };
  utm_sources: Array<{ utm_source: string; sessions: number }>;
}

export interface AnalyticsVisitorListItem {
  id: string;
  country: string;
  device_type: string;
  browser: string;
  os: string;
  user_email: string;
  first_seen_at: string;
  last_seen_at: string;
  pageview_count: number;
  session_count: number;
}

export interface AnalyticsVisitorPageView {
  id: string;
  path: string;
  title: string;
  viewed_at: string;
}

export interface AnalyticsVisitorEvent {
  id: string;
  name: string;
  properties: Record<string, unknown>;
  occurred_at: string;
}

export interface AnalyticsVisitorSession {
  id: string;
  started_at: string;
  last_activity_at: string;
  entry_path: string;
  exit_path: string;
  referrer: string;
  referrer_host: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  pageview_count: number;
  event_count: number;
  pageviews: AnalyticsVisitorPageView[];
  events: AnalyticsVisitorEvent[];
}

export interface AnalyticsVisitorDetail {
  id: string;
  country: string;
  device_type: string;
  browser: string;
  os: string;
  user: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
  } | null;
  first_seen_at: string;
  last_seen_at: string;
  pageview_count: number;
  session_count: number;
  sessions: AnalyticsVisitorSession[];
  order_summary: {
    order_count: number;
    total_spent_pence: number;
    last_order_at: string | null;
  } | null;
}

export interface AdminReview {
  id: string;
  product_name: string;
  product_slug: string;
  customer_name: string;
  customer_email: string;
  rating: number;
  title: string;
  body: string;
  is_visible: boolean;
  helpful_count: number;
  admin_reply: string;
  admin_reply_at: string | null;
  created_at: string;
  updated_at: string;
}

export type PromotionDiscountType = "percent" | "free_shipping";
export type PromotionScope = "all" | "category" | "brand" | "product";
export type PromotionSource =
  | "newsletter"
  | "influencer"
  | "manual"
  | "campaign"
  | "referral";

export interface AdminPromotionListItem {
  id: string;
  code: string;
  name: string;
  discount_type: PromotionDiscountType;
  discount_value: number;
  scope: PromotionScope;
  min_subtotal: number;
  is_first_order_only: boolean;
  is_one_per_customer: boolean;
  starts_at: string | null;
  ends_at: string | null;
  max_uses_total: number | null;
  max_uses_per_user: number | null;
  times_used: number;
  click_count: number;
  is_active: boolean;
  source: PromotionSource;
  campaign_label: string;
  created_at: string;
}

export interface AdminPromotion extends AdminPromotionListItem {
  description: string;
  scope_category_ids: string[];
  scope_brand_ids: string[];
  scope_product_ids: string[];
  updated_at: string;
  summary: {
    redemption_count: number;
    total_discount_pence: number;
    total_revenue_pence: number;
    click_count: number;
    conversion_rate: number | null;
  };
}

export interface AdminPromotionRedemption {
  id: string;
  order_number: string;
  order_total: number;
  customer_email: string;
  discount_amount: number;
  subtotal_at_use: number;
  created_at: string;
}

export interface AdminContactMessage {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  is_read: boolean;
  created_at: string;
  updated_at: string;
}
