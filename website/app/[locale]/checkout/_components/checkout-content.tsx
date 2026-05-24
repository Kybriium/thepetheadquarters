"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@heroui/react";
import { useCart } from "@/lib/cart-context";
import { useAuth } from "@/lib/auth-context";
import { apiClient, ApiError } from "@/lib/api-client";
import { endpoints } from "@/config/endpoints";
import type { Address } from "@/types/auth";
import type enCheckout from "@/i18n/dictionaries/en/checkout.json";
import type { PromoState } from "@/components/cart/promo-code-box";
import { track } from "@/lib/analytics";
import { ShippingForm } from "./shipping-form";
import { AddressSelector } from "./address-selector";
import { OrderReview } from "./order-review";

interface CheckoutContentProps {
  dict: typeof enCheckout;
}

interface ShippingData {
  full_name: string;
  address_line_1: string;
  address_line_2: string;
  city: string;
  county: string;
  postcode: string;
  country: string;
  phone: string;
}

const SHIPPING_RATE = 399;
const FREE_THRESHOLD = 3000;

export function CheckoutContent({ dict }: CheckoutContentProps) {
  const { items, subtotal, clearCart } = useCart();
  const { user, isAuthenticated, isEmailVerified, refreshUser } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<"shipping" | "review">("shipping");
  const [shippingAddress, setShippingAddress] = useState<ShippingData | null>(null);
  const [savedAddressId, setSavedAddressId] = useState<string | null>(null);
  const [guestEmail, setGuestEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState<Address[]>([]);
  const [useNewAddress, setUseNewAddress] = useState(false);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [promo, setPromo] = useState<PromoState | null>(null);

  // Redirect to cart if empty
  useEffect(() => {
    if (items.length === 0) {
      router.replace("/cart");
    }
  }, [items.length, router]);

  // Fire checkout_start once when the checkout page mounts with a non-empty cart
  useEffect(() => {
    if (items.length > 0) {
      track("checkout_start", {
        item_count: items.length,
        value_pence: items.reduce(
          (sum, i) => sum + (i.price + i.customizationSurcharge) * i.quantity,
          0,
        ),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch saved addresses for authenticated users
  useEffect(() => {
    if (isAuthenticated) {
      apiClient
        .get<{ status: string; data: Address[] }>(endpoints.addresses.list)
        .then((res) => setSavedAddresses(res.data))
        .catch(() => {});
    }
  }, [isAuthenticated]);

  const baseShippingCost = subtotal >= FREE_THRESHOLD ? 0 : SHIPPING_RATE;
  const freeShippingFromPromo = promo?.appliesToShipping ?? false;
  const shippingCost = freeShippingFromPromo ? 0 : baseShippingCost;
  const itemDiscount = freeShippingFromPromo ? 0 : Math.min(promo?.discountAmount ?? 0, subtotal);
  const shippingDiscount = freeShippingFromPromo ? baseShippingCost : 0;
  const totalDiscount = itemDiscount + shippingDiscount;
  const total = subtotal + shippingCost - itemDiscount;

  function handleShippingSubmit(address: ShippingData, email?: string, addressId?: string) {
    setShippingAddress(address);
    if (email) setGuestEmail(email);
    if (addressId) setSavedAddressId(addressId);
    setStep("review");
  }

  async function handleResendVerification() {
    setResendingVerification(true);
    try {
      await fetch(endpoints.auth.resendVerification, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      toast.success("Verification email sent!");
    } catch {
      toast.danger("Something went wrong.");
    } finally {
      setResendingVerification(false);
    }
  }

  async function handlePlaceOrder() {
    if (!shippingAddress) return;
    setIsSubmitting(true);

    try {
      const payload: Record<string, unknown> = {
        items: items.map((item) => ({
          variant_id: item.variantId,
          quantity: item.quantity,
          customizations: item.customizations,
        })),
        shipping_address: shippingAddress,
      };

      if (!isAuthenticated) {
        payload.email = guestEmail;
      }

      if (savedAddressId) {
        payload.saved_address_id = savedAddressId;
      }

      if (promo?.code) {
        payload.promotion_code = promo.code;
      }

      const res = await apiClient.post<{
        status: string;
        data: { checkout_url: string; session_id: string };
        code?: string;
      }>(endpoints.orders.checkout, payload);

      if (res.data?.checkout_url) {
        window.location.href = res.data.checkout_url;
      }
    } catch (err) {
      setIsSubmitting(false);
      if (err instanceof ApiError) {
        const code = err.message || "";
        if (code.includes("email_not_verified")) {
          toast.warning(dict.errors.email_not_verified);
        } else if (code.includes("insufficient_stock")) {
          toast.warning(dict.errors.insufficient_stock);
        } else if (code.includes("stripe_not_configured")) {
          toast.warning(dict.errors.stripe_not_configured);
        } else if (code.startsWith("promo.")) {
          toast.warning("Your promo code is no longer valid. Please remove it and try again.");
          setPromo(null);
        } else {
          toast.danger(dict.errors.payment_error);
        }
      } else {
        toast.danger(dict.errors.payment_error);
      }
    }
  }

  if (items.length === 0) return null;

  // Email verification gate for authenticated users
  if (isAuthenticated && !isEmailVerified) {
    return (
      <div
        className="mx-auto max-w-md rounded-lg py-12 text-center"
        style={{ background: "var(--bg-secondary)", border: "1px solid var(--bg-border)", padding: "var(--space-8)" }}
      >
        <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-dim)", marginBottom: "var(--space-6)" }}>
          {dict.emailRequired}
        </p>
        <button
          onClick={handleResendVerification}
          disabled={resendingVerification}
          className="btn-gold rounded-md px-6 py-2.5 transition-all duration-300 hover:-translate-y-0.5 disabled:opacity-50"
          style={{ fontFamily: "var(--font-montserrat)", fontWeight: "var(--weight-semibold)", fontSize: "var(--text-sm)", letterSpacing: "var(--tracking-wider)", textTransform: "uppercase" }}
        >
          {dict.resendVerification}
        </button>
      </div>
    );
  }

  if (step === "shipping") {
    if (isAuthenticated && savedAddresses.length > 0 && !useNewAddress) {
      return (
        <AddressSelector
          dict={dict}
          addresses={savedAddresses}
          onSelect={(address, addressId) => handleShippingSubmit(address, undefined, addressId)}
          onNewAddress={() => setUseNewAddress(true)}
        />
      );
    }

    return (
      <ShippingForm
        dict={dict}
        isGuest={!isAuthenticated}
        defaultEmail={user?.email}
        onSubmit={handleShippingSubmit}
        onBack={isAuthenticated && savedAddresses.length > 0 ? () => setUseNewAddress(false) : undefined}
      />
    );
  }

  return (
    <OrderReview
      dict={dict}
      items={items}
      shippingAddress={shippingAddress!}
      email={isAuthenticated ? user!.email : guestEmail}
      subtotal={subtotal}
      shippingCost={shippingCost}
      discountAmount={totalDiscount}
      promoCode={promo?.code || ""}
      total={total}
      isSubmitting={isSubmitting}
      onPlaceOrder={handlePlaceOrder}
      onEditShipping={() => setStep("shipping")}
      onPromoChange={setPromo}
    />
  );
}
