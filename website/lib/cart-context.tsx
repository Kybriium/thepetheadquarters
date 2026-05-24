"use client";

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import type { CartItem } from "@/types/cart";
import type { CustomizationAnswer } from "@/types/customization";
import { track } from "@/lib/analytics";

interface CartContextType {
  items: CartItem[];
  /**
   * Adds a line. If an existing line has the same variant AND identical
   * customization answers, quantities are merged. Otherwise a new line is
   * appended so each unique customization configuration ships separately.
   */
  addItem: (item: Omit<CartItem, "quantity" | "lineId"> & { quantity?: number }) => void;
  removeItem: (lineId: string) => void;
  updateQuantity: (lineId: string, quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
  /** Subtotal in pence — includes per-unit customization surcharges. */
  subtotal: number;
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  /** Persisted promo code the customer has typed/applied. Empty string if none. */
  promotionCode: string;
  setPromotionCode: (code: string) => void;
}

const CartContext = createContext<CartContextType | null>(null);

const STORAGE_KEY = "tph-cart";
const PROMO_KEY = "tph-cart-promo";

function generateLineId(): string {
  // crypto.randomUUID is available in all browsers we target; fall back to
  // a timestamp+random combo for the (extremely rare) older runtime.
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Stable fingerprint of a customization payload so two lines with the same
 * answers merge in the cart, but different answers stay separate.
 */
function customizationsHash(answers: CustomizationAnswer[]): string {
  if (!answers || answers.length === 0) return "";
  const normalized = [...answers]
    .map((a) => [a.key, a.value])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return JSON.stringify(normalized);
}

function lineMergeKey(item: Pick<CartItem, "variantId" | "customizations">): string {
  return `${item.variantId}::${customizationsHash(item.customizations || [])}`;
}

// Older carts stored items without lineId/customizations. Migrate on load
// so we don't crash on the first render after deploying this feature.
type LegacyCartItem = Omit<CartItem, "lineId" | "customizations" | "customizationSummary" | "customizationSurcharge"> &
  Partial<Pick<CartItem, "lineId" | "customizations" | "customizationSummary" | "customizationSurcharge">>;

function loadCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LegacyCartItem[];
    return parsed.map((item) => ({
      ...item,
      lineId: item.lineId || generateLineId(),
      customizations: item.customizations || [],
      customizationSummary: item.customizationSummary || [],
      customizationSurcharge: item.customizationSurcharge || 0,
    }));
  } catch {
    return [];
  }
}

function saveCart(items: CartItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Storage full or unavailable
  }
}

function loadPromo(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(PROMO_KEY) || "";
  } catch {
    return "";
  }
}

function savePromo(code: string) {
  try {
    if (code) localStorage.setItem(PROMO_KEY, code);
    else localStorage.removeItem(PROMO_KEY);
  } catch {
    // ignore
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [promotionCode, setPromotionCodeState] = useState("");

  useEffect(() => {
    setItems(loadCart());
    setPromotionCodeState(loadPromo());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) saveCart(items);
  }, [items, loaded]);

  // Auto-apply ?promo=CODE from the URL on first mount + fire-and-forget click tracking.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const queryCode = params.get("promo");
    if (queryCode) {
      const upper = queryCode.trim().toUpperCase();
      setPromotionCodeState(upper);
      savePromo(upper);

      // Fire-and-forget click tracking — never block the page on this.
      // Use the API base from the same env var the rest of the app uses.
      const apiBase =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
      void fetch(`${apiBase}/promotions/track-click/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: upper }),
        keepalive: true,
      }).catch(() => {});
    }
  }, []);

  const addItem = useCallback(
    (newItem: Omit<CartItem, "quantity" | "lineId"> & { quantity?: number }) => {
      setItems((prev) => {
        const qty = newItem.quantity || 1;
        const newKey = lineMergeKey(newItem);
        const existing = prev.find((i) => lineMergeKey(i) === newKey);
        if (existing) {
          return prev.map((i) =>
            i.lineId === existing.lineId
              ? { ...i, quantity: i.quantity + qty }
              : i,
          );
        }
        return [
          ...prev,
          { ...newItem, quantity: qty, lineId: generateLineId() },
        ];
      });
      setDrawerOpen(true);
      track("add_to_cart", {
        product_id: newItem.productId,
        variant_id: newItem.variantId,
        quantity: newItem.quantity || 1,
        value_pence:
          (newItem.price + (newItem.customizationSurcharge || 0)) *
          (newItem.quantity || 1),
        customized: (newItem.customizations || []).length > 0,
      });
    },
    [],
  );

  const removeItem = useCallback((lineId: string) => {
    setItems((prev) => {
      const removed = prev.find((i) => i.lineId === lineId);
      const next = prev.filter((i) => i.lineId !== lineId);
      if (removed) {
        track("remove_from_cart", { variant_id: removed.variantId });
      }
      return next;
    });
  }, []);

  const updateQuantity = useCallback((lineId: string, quantity: number) => {
    if (quantity <= 0) {
      setItems((prev) => prev.filter((i) => i.lineId !== lineId));
      return;
    }
    setItems((prev) =>
      prev.map((i) => (i.lineId === lineId ? { ...i, quantity } : i)),
    );
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
    setPromotionCodeState("");
    savePromo("");
  }, []);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const setPromotionCode = useCallback((code: string) => {
    const next = (code || "").trim().toUpperCase();
    setPromotionCodeState(next);
    savePromo(next);
  }, []);

  const totalItems = useMemo(() => items.reduce((sum, i) => sum + i.quantity, 0), [items]);
  const subtotal = useMemo(
    () =>
      items.reduce(
        (sum, i) =>
          sum + (i.price + (i.customizationSurcharge || 0)) * i.quantity,
        0,
      ),
    [items],
  );

  const value = useMemo(
    () => ({
      items, addItem, removeItem, updateQuantity, clearCart,
      totalItems, subtotal, drawerOpen, openDrawer, closeDrawer,
      promotionCode, setPromotionCode,
    }),
    [items, addItem, removeItem, updateQuantity, clearCart, totalItems, subtotal, drawerOpen, openDrawer, closeDrawer, promotionCode, setPromotionCode],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
