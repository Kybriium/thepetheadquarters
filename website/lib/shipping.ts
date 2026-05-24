/**
 * Shipping constants — kept here so cart, checkout, and the free-delivery
 * progress widget all read from the same source of truth. Values mirror
 * the Django settings (SHIPPING_FLAT_RATE_PENCE, SHIPPING_FREE_THRESHOLD_PENCE).
 *
 * If these drift from the backend, the backend wins at checkout time —
 * but the UI should match so customers see the same "spend £X more"
 * message as what they're actually charged.
 */

export const SHIPPING_RATE_PENCE = 399;
export const FREE_DELIVERY_THRESHOLD_PENCE = 3000;
