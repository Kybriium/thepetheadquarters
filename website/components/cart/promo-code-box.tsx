"use client";

import { useEffect, useState } from "react";
import { Tag, Check, X } from "lucide-react";
import { useCart } from "@/lib/cart-context";
import { apiClient, ApiError } from "@/lib/api-client";
import { endpoints } from "@/config/endpoints";

interface ValidateResponse {
  status: string;
  data: {
    code: string;
    name: string;
    discount_type: "percent" | "free_shipping";
    discount_value: number;
    discount_amount: number;
    applies_to_shipping: boolean;
  };
}

export interface PromoState {
  code: string;
  discountAmount: number;
  appliesToShipping: boolean;
}

interface PromoCodeBoxProps {
  email?: string;
  /** Called whenever the validated promo state changes (or clears). */
  onChange?: (state: PromoState | null) => void;
}

const ERROR_LABELS: Record<string, string> = {
  "promo.code_required": "Please enter a code.",
  "promo.not_found": "That code doesn't exist.",
  "promo.inactive": "This code is no longer active.",
  "promo.not_started": "This code isn't valid yet.",
  "promo.expired": "This code has expired.",
  "promo.exhausted": "This code has reached its limit.",
  "promo.min_subtotal": "Your cart doesn't meet the minimum spend for this code.",
  "promo.first_order_only": "This code is for first-time customers only — looks like you've ordered with us before.",
  "promo.already_used": "You've already used this code.",
  "promo.scope_mismatch": "This code doesn't apply to anything in your cart.",
};

function formatPrice(p: number): string {
  return `£${(p / 100).toFixed(2)}`;
}

export function PromoCodeBox({ email, onChange }: PromoCodeBoxProps) {
  const { items, promotionCode, setPromotionCode } = useCart();
  const [input, setInput] = useState(promotionCode);
  const [applied, setApplied] = useState<PromoState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(!!promotionCode);

  // Auto-validate on mount if a code is already persisted (e.g. ?promo=)
  useEffect(() => {
    if (promotionCode && !applied && items.length > 0) {
      void apply(promotionCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promotionCode, items.length]);

  // Re-validate whenever items change while a code is applied
  useEffect(() => {
    if (applied && items.length > 0) {
      void apply(applied.code, { silent: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.map((i) => `${i.lineId}:${i.quantity}`).join(",")]);

  async function apply(code: string, opts: { silent?: boolean } = {}) {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      setError(opts.silent ? null : "Please enter a code.");
      return;
    }

    if (items.length === 0) {
      setError("Your cart is empty.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await apiClient.post<ValidateResponse>(endpoints.promotions.validate, {
        code: trimmed,
        items: items.map((it) => ({ variant_id: it.variantId, quantity: it.quantity })),
        email: email || undefined,
      });

      const state: PromoState = {
        code: res.data.code,
        discountAmount: res.data.discount_amount,
        appliesToShipping: res.data.applies_to_shipping,
      };
      setApplied(state);
      setPromotionCode(state.code);
      setInput(state.code);
      onChange?.(state);
    } catch (err) {
      const code = err instanceof ApiError ? err.message : "promo.not_found";
      // Surface the raw code in the fallback so we know which case we
      // missed if it's a new error from the backend that doesn't have
      // a friendly label yet. Production users see the friendly label
      // when one exists.
      const message = ERROR_LABELS[code] || `Could not apply this code (${code}).`;
      setApplied(null);
      onChange?.(null);
      // Don't surface validation errors during silent re-validation,
      // but DO clear the persisted code so it doesn't keep failing.
      if (!opts.silent) {
        setError(message);
      } else {
        setPromotionCode("");
      }
    } finally {
      setLoading(false);
    }
  }

  function remove() {
    setApplied(null);
    setError(null);
    setInput("");
    setPromotionCode("");
    onChange?.(null);
  }

  if (!expanded && !applied) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="flex items-center gap-2"
        style={{
          fontFamily: "var(--font-montserrat)",
          fontSize: "var(--text-xs)",
          color: "var(--gold-dark)",
        }}
      >
        <Tag size={12} />
        Have a promo code?
      </button>
    );
  }

  if (applied) {
    return (
      <div
        className="flex items-center justify-between rounded-md"
        style={{
          background: "rgba(46,125,50,0.08)",
          border: "1px solid rgba(46,125,50,0.4)",
          padding: "var(--space-3)",
        }}
      >
        <div className="flex items-center gap-2">
          <Check size={14} style={{ color: "var(--success)" }} />
          <span style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white)" }}>
            <strong>{applied.code}</strong> applied —{" "}
            {applied.appliesToShipping
              ? "free shipping"
              : `${formatPrice(applied.discountAmount)} off`}
          </span>
        </div>
        <button
          type="button"
          onClick={remove}
          aria-label="Remove promo code"
          style={{ color: "var(--white-faint)" }}
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => {
            setInput(e.target.value.toUpperCase());
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void apply(input);
            }
          }}
          placeholder="PROMO CODE"
          className="flex-1 outline-none"
          style={{
            background: "var(--bg-tertiary)",
            border: `1px solid ${error ? "var(--error)" : "var(--bg-border)"}`,
            color: "var(--white)",
            fontFamily: "var(--font-montserrat)",
            fontSize: "var(--text-sm)",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-2) var(--space-3)",
            letterSpacing: "var(--tracking-wide)",
          }}
        />
        <button
          type="button"
          onClick={() => apply(input)}
          disabled={loading}
          className="rounded-md px-4 disabled:opacity-50"
          style={{
            background: "var(--gold)",
            color: "#FFFFFF",
            fontFamily: "var(--font-montserrat)",
            fontSize: "var(--text-xs)",
            fontWeight: "var(--weight-semibold)",
            textTransform: "uppercase",
            letterSpacing: "var(--tracking-wide)",
          }}
        >
          {loading ? "..." : "Apply"}
        </button>
      </div>
      {error && (
        <p
          style={{
            fontFamily: "var(--font-montserrat)",
            fontSize: "11px",
            color: "var(--error)",
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
