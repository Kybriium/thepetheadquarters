import { Lock, Truck, RefreshCw } from "lucide-react";

/**
 * Site-wide thin info bar.
 *
 * Three facts we can stand behind without overpromising — security
 * signal first (top-of-page reassurance), the free-delivery threshold,
 * and the statutory 14-day returns right. We do NOT advertise a
 * delivery ETA because items are dropshipped from different suppliers
 * — actual lead time varies by product and is shown on the product
 * page itself.
 */

const usps = [
  { Icon: Lock, label: "Secure checkout by Stripe" },
  { Icon: Truck, label: "Free UK delivery over £30" },
  { Icon: RefreshCw, label: "14-day returns" },
];

export function UspRibbon() {
  return (
    <div
      role="complementary"
      aria-label="Why shop with us"
      style={{
        background: "linear-gradient(180deg, rgba(187,148,41,0.10) 0%, rgba(187,148,41,0.06) 100%)",
        borderTop: "1px solid rgba(187,148,41,0.18)",
        borderBottom: "1px solid rgba(187,148,41,0.18)",
      }}
    >
      <div className="mx-auto flex max-w-7xl items-center gap-6 overflow-x-auto whitespace-nowrap px-4 py-2.5 sm:px-6">
        {usps.map(({ Icon, label }, i) => (
          <div
            key={label}
            className="flex shrink-0 items-center gap-1.5"
            style={{
              fontFamily: "var(--font-montserrat)",
              fontSize: 11,
              color: "var(--white-dim)",
              letterSpacing: "var(--tracking-wide)",
              // Stack horizontally with a dot separator on wider screens
              borderRight: i < usps.length - 1 ? "1px solid rgba(187,148,41,0.15)" : "none",
              paddingRight: i < usps.length - 1 ? "1.25rem" : 0,
            }}
          >
            <Icon size={12} style={{ color: "var(--gold)" }} />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}
