"use client";

/**
 * Modal for sending an ad-hoc email to the customer on an order.
 *
 * Sent server-side via Resend HTTP API → arrives FROM the company
 * address (DEFAULT_FROM_EMAIL on the backend, e.g. contact@thepetheadquarters.co.uk),
 * with Reply-To set to the same address so customer replies route
 * back to support.
 *
 * Includes a few one-click templates for the common cases (delayed
 * dropship, out-of-stock, request info, generic update) so the admin
 * doesn't have to type the same thing repeatedly.
 */

import { useState } from "react";
import { Send, X } from "lucide-react";
import { toast } from "@heroui/react";
import { ApiError, apiClient } from "@/lib/api-client";
import { endpoints } from "@/config/endpoints";
import type { AdminOrder } from "@/types/admin";

interface EmailCustomerModalProps {
  order: AdminOrder;
  open: boolean;
  onClose: () => void;
  onSent: () => void;
}

interface Template {
  label: string;
  subject: (o: AdminOrder) => string;
  body: (o: AdminOrder) => string;
}

const TEMPLATES: Template[] = [
  {
    label: "Dropship delayed",
    subject: (o) => `Update on your order ${o.order_number}`,
    body: (o) =>
      `Thanks for your order with us. We wanted to let you know there's a short delay on the supplier side for one of the items in your order.\n\n` +
      `We'll send tracking the moment it ships. If you'd like to swap to a faster-shipping alternative or have any questions, just reply to this email.\n\n` +
      `Thanks for your patience.`,
  },
  {
    label: "Out of stock — refund",
    subject: (o) => `About your order ${o.order_number}`,
    body: (o) =>
      `Unfortunately the item you ordered is no longer available from our supplier. We're really sorry about this.\n\n` +
      `We've issued a full refund — it should land in your account within 5–10 working days depending on your bank.\n\n` +
      `If you'd like to pick something else from our catalogue we'd be happy to recommend an alternative — just reply to this email.`,
  },
  {
    label: "Request customisation details",
    subject: (o) => `Quick question about your order ${o.order_number}`,
    body: () =>
      `Thanks for your order — we just need a little more info to make sure we get the personalisation right.\n\n` +
      `Could you reply to this email with:\n` +
      `  • [the detail you need]\n\n` +
      `Once we have that, we'll get it shipped straight away.`,
  },
  {
    label: "Generic update",
    subject: (o) => `Update on your order ${o.order_number}`,
    body: () =>
      `Just a quick update on your order.\n\n` +
      `[Write your message here.]\n\n` +
      `If you have any questions, please reply to this email and we'll get back to you.`,
  },
];

export function EmailCustomerModal({ order, open, onClose, onSent }: EmailCustomerModalProps) {
  const [subject, setSubject] = useState<string>(`Update on your order ${order.order_number}`);
  const [body, setBody] = useState<string>("");
  const [busy, setBusy] = useState(false);

  function applyTemplate(t: Template) {
    setSubject(t.subject(order));
    setBody(t.body(order));
  }

  async function handleSend() {
    if (busy) return;
    if (!subject.trim() || !body.trim()) {
      toast.danger("Subject and message are both required");
      return;
    }
    setBusy(true);
    try {
      await apiClient.post(endpoints.admin.orders.email(order.order_number), {
        subject: subject.trim(),
        body: body.trim(),
      });
      toast.success(`Sent to ${order.email}`);
      onSent();
      onClose();
      // Reset for next time
      setBody("");
    } catch (err) {
      const code = err instanceof ApiError ? err.message : "Send failed";
      const msg = code.includes("email")
        ? "Couldn't send — check the Resend API key in env and try again"
        : `Send failed (${code})`;
      toast.danger(msg);
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-lg p-6"
        style={{ background: "var(--bg-secondary)", border: "1px solid var(--bg-border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3
              style={{
                fontFamily: "var(--font-cormorant)",
                fontSize: "var(--text-xl)",
                color: "var(--white)",
              }}
            >
              Email customer
            </h3>
            <p
              className="mt-1"
              style={{
                fontFamily: "var(--font-montserrat)",
                fontSize: 11,
                color: "var(--white-faint)",
              }}
            >
              From <strong>contact@thepetheadquarters.co.uk</strong> · To{" "}
              <strong>{order.email}</strong> · Re: {order.order_number}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ color: "var(--white-faint)" }}>
            <X size={16} />
          </button>
        </div>

        {/* Quick templates */}
        <div className="mb-4">
          <p
            className="mb-2"
            style={{
              fontFamily: "var(--font-montserrat)",
              fontSize: 10,
              color: "var(--white-faint)",
              letterSpacing: "var(--tracking-wide)",
              textTransform: "uppercase",
            }}
          >
            Quick templates
          </p>
          <div className="flex flex-wrap gap-2">
            {TEMPLATES.map((t) => (
              <button
                key={t.label}
                onClick={() => applyTemplate(t)}
                className="rounded-md px-2.5 py-1.5"
                style={{
                  background: "var(--bg-tertiary)",
                  border: "1px solid var(--bg-border)",
                  fontFamily: "var(--font-montserrat)",
                  fontSize: 11,
                  color: "var(--white-dim)",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span
              style={{
                fontFamily: "var(--font-montserrat)",
                fontSize: 11,
                color: "var(--white-faint)",
                letterSpacing: "var(--tracking-wide)",
                textTransform: "uppercase",
              }}
            >
              Subject
            </span>
            <input
              name="subject"
              type="text"
              value={subject}
              maxLength={200}
              onChange={(e) => setSubject(e.target.value)}
              className="rounded-md px-2 py-2"
              style={inputStyle}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span
              style={{
                fontFamily: "var(--font-montserrat)",
                fontSize: 11,
                color: "var(--white-faint)",
                letterSpacing: "var(--tracking-wide)",
                textTransform: "uppercase",
              }}
            >
              Message
            </span>
            <textarea
              value={body}
              maxLength={5000}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              placeholder="Type a message to the customer. Line breaks are preserved."
              className="rounded-md px-2 py-2"
              style={{ ...inputStyle, resize: "vertical" }}
            />
            <span
              className="text-right"
              style={{
                fontFamily: "var(--font-montserrat)",
                fontSize: 10,
                color: "var(--white-faint)",
              }}
            >
              {body.length}/5000
            </span>
          </label>
        </div>

        <p
          className="mt-3 rounded p-2"
          style={{
            background: "rgba(187,148,41,0.08)",
            border: "1px solid rgba(187,148,41,0.25)",
            fontFamily: "var(--font-montserrat)",
            fontSize: 11,
            color: "var(--white-dim)",
            lineHeight: 1.4,
          }}
        >
          The email goes out on the company domain via Resend. Customer
          replies route to <strong>contact@thepetheadquarters.co.uk</strong>.
          A note is appended to internal order notes when sent.
        </p>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-md px-4 py-2 disabled:opacity-40"
            style={{
              background: "var(--bg-tertiary)",
              color: "var(--white-dim)",
              fontFamily: "var(--font-montserrat)",
              fontSize: 12,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={busy}
            className="flex items-center gap-2 rounded-md px-4 py-2 disabled:opacity-40"
            style={{
              background: "var(--gold)",
              color: "#0F0F12",
              fontFamily: "var(--font-montserrat)",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <Send size={13} />
            {busy ? "Sending…" : "Send email"}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: "var(--bg-tertiary)",
  border: "1px solid var(--bg-border)",
  color: "var(--white)",
  fontFamily: "var(--font-montserrat)",
  fontSize: 13,
};
