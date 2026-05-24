"""
Telegram-bot service layer.

Talks to the public Bot API directly (`https://api.telegram.org/bot<token>/...`)
via stdlib `urllib` so we don't pull a new dependency for one integration.
The HTTP calls happen in a background thread for `notify()` so order
fulfillment / contact submissions never block on Telegram being slow.
"""

from __future__ import annotations

import html
import json
import logging
import threading
from typing import Any
from urllib import error, parse, request

from django.utils import timezone

from .models import NotificationEvent, TelegramConfig

logger = logging.getLogger(__name__)

API_BASE = "https://api.telegram.org/bot{token}/{method}"
HTTP_TIMEOUT_SECONDS = 10


# ---------------------------------------------------------------------------
# Low-level HTTP
# ---------------------------------------------------------------------------


def _call(token: str, method: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    """
    POST `payload` (as JSON) to api.telegram.org and return the parsed
    response. Raises TelegramError on transport or API failures so callers
    can decide whether to swallow (notify) or surface (admin actions).
    """
    url = API_BASE.format(token=token, method=method)
    body = json.dumps(payload or {}).encode("utf-8")
    req = request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=HTTP_TIMEOUT_SECONDS) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except error.HTTPError as exc:
        # Telegram returns 4xx with a JSON body explaining the error.
        try:
            data = json.loads(exc.read().decode("utf-8"))
        except Exception:
            raise TelegramError(f"http_{exc.code}")
        raise TelegramError(data.get("description", f"http_{exc.code}"))
    except (error.URLError, TimeoutError, OSError) as exc:
        raise TelegramError(f"network_error: {exc}") from exc
    except json.JSONDecodeError:
        raise TelegramError("invalid_json")

    if not data.get("ok"):
        raise TelegramError(data.get("description", "unknown_error"))
    return data.get("result", {})


class TelegramError(Exception):
    """Raised when a Telegram Bot API call fails."""


# ---------------------------------------------------------------------------
# Bot operations used by the admin UI
# ---------------------------------------------------------------------------


def get_me(token: str) -> dict[str, Any]:
    """Verify the bot token by calling getMe. Returns the bot's profile."""
    return _call(token, "getMe")


def discover_chats(config: TelegramConfig) -> list[dict[str, Any]]:
    """
    Call getUpdates and merge any newly-seen chats into config.chat_targets.
    Only picks up updates with id > config.last_update_id, so each call
    advances the cursor and we don't re-process the same Start messages.

    Returns the full current list of chat_targets after merging.
    """
    payload: dict[str, Any] = {"timeout": 0, "limit": 100}
    if config.last_update_id:
        payload["offset"] = config.last_update_id + 1

    updates = _call(config.bot_token, "getUpdates", payload)

    existing_ids = {t["id"] for t in (config.chat_targets or [])}
    targets: list[dict[str, Any]] = list(config.chat_targets or [])
    max_update_id = config.last_update_id

    for upd in updates:
        max_update_id = max(max_update_id, upd.get("update_id", 0))
        # `message` covers DMs + group messages; `my_chat_member` covers
        # bot-added-to-group events; both are worth treating as a target.
        chat = (
            (upd.get("message") or {}).get("chat")
            or (upd.get("my_chat_member") or {}).get("chat")
            or {}
        )
        chat_id = chat.get("id")
        if not chat_id or chat_id in existing_ids:
            continue
        existing_ids.add(chat_id)
        targets.append({
            "id": chat_id,
            "title": _chat_label(chat),
            "type": chat.get("type", "private"),
            "enabled": True,
        })

    config.chat_targets = targets
    config.last_update_id = max_update_id
    config.last_polled_at = timezone.now()
    config.save(update_fields=["chat_targets", "last_update_id", "last_polled_at"])
    return targets


def _chat_label(chat: dict[str, Any]) -> str:
    """Best-effort human label for a chat: full name, title, or username."""
    if chat.get("title"):
        return chat["title"]
    name_parts = [chat.get("first_name") or "", chat.get("last_name") or ""]
    full = " ".join(p for p in name_parts if p).strip()
    if full:
        return full
    if chat.get("username"):
        return f"@{chat['username']}"
    return f"chat:{chat.get('id', '?')}"


def send_message(token: str, chat_id: int, text: str) -> None:
    """One-shot synchronous message send. Used by the 'send test' action."""
    _call(
        token,
        "sendMessage",
        {
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "HTML",
            "disable_web_page_preview": True,
        },
    )


# ---------------------------------------------------------------------------
# Notification fan-out (called from order/contact/review/low-stock sites)
# ---------------------------------------------------------------------------


def notify(event: NotificationEvent | str, context: dict[str, Any]) -> None:
    """
    Fire-and-forget notification. Looks up the singleton config, formats
    the event, and dispatches to every enabled chat in a background thread
    so the calling request returns immediately. Any failure is logged but
    NEVER surfaces to the caller — an order must complete even if Telegram
    is down.
    """
    try:
        config = TelegramConfig.objects.first()
    except Exception:
        logger.exception("integrations.notify: config lookup failed")
        return

    if not config or not config.is_enabled or not config.bot_token:
        return

    key = event.value if isinstance(event, NotificationEvent) else str(event)
    if not config.enabled_events.get(key, False):
        return

    chat_ids = [
        t["id"] for t in (config.chat_targets or [])
        if t.get("enabled", True)
    ]
    if not chat_ids:
        return

    try:
        text = format_event(key, context)
    except Exception:
        logger.exception("integrations.notify: formatting %s failed", key)
        return

    token = config.bot_token

    def _dispatch():
        for chat_id in chat_ids:
            try:
                send_message(token, chat_id, text)
            except TelegramError as exc:
                logger.warning(
                    "telegram send failed for chat %s: %s", chat_id, exc,
                )
            except Exception:
                logger.exception("telegram send crashed for chat %s", chat_id)

    threading.Thread(target=_dispatch, daemon=True).start()


# ---------------------------------------------------------------------------
# Per-event message formatters — HTML mode (Telegram parse_mode=HTML)
# ---------------------------------------------------------------------------


def _esc(value: Any) -> str:
    """HTML-escape so customer-provided text can't break message formatting."""
    return html.escape(str(value or ""), quote=False)


def format_event(key: str, ctx: dict[str, Any]) -> str:
    if key == NotificationEvent.ORDER_PAID.value:
        return _format_order_paid(ctx)
    if key == NotificationEvent.CONTACT_MESSAGE.value:
        return _format_contact(ctx)
    if key == NotificationEvent.REVIEW_NEW.value:
        return _format_review(ctx)
    if key == NotificationEvent.LOW_STOCK.value:
        return _format_low_stock(ctx)
    raise ValueError(f"unknown event: {key}")


def _format_order_paid(ctx: dict[str, Any]) -> str:
    total_pence = int(ctx.get("total_pence", 0))
    return (
        "🛒 <b>New paid order</b>\n"
        f"<b>{_esc(ctx.get('order_number'))}</b> — £{total_pence / 100:.2f}\n"
        f"👤 {_esc(ctx.get('customer_name'))} &lt;{_esc(ctx.get('email'))}&gt;\n"
        f"📦 {_esc(ctx.get('item_count'))} item(s)\n"
        f"📬 {_esc(ctx.get('shipping_city', ''))} {_esc(ctx.get('shipping_postcode', ''))}"
    )


def _format_contact(ctx: dict[str, Any]) -> str:
    body = (ctx.get("message") or "")[:280]
    return (
        "✉️ <b>New contact message</b>\n"
        f"👤 {_esc(ctx.get('name'))} &lt;{_esc(ctx.get('email'))}&gt;\n"
        f"📝 <b>{_esc(ctx.get('subject') or 'No subject')}</b>\n"
        f"{_esc(body)}"
    )


def _format_review(ctx: dict[str, Any]) -> str:
    rating = int(ctx.get("rating", 0))
    body = (ctx.get("body") or "")[:280]
    stars = "⭐" * rating + "☆" * (5 - rating)
    return (
        "⭐ <b>New review</b>\n"
        f"{stars} on <b>{_esc(ctx.get('product_name'))}</b>\n"
        f"👤 {_esc(ctx.get('reviewer'))}\n"
        f"{_esc(body)}"
    )


def _format_low_stock(ctx: dict[str, Any]) -> str:
    return (
        "⚠️ <b>Low stock</b>\n"
        f"<b>{_esc(ctx.get('product_name'))}</b> — {_esc(ctx.get('variant_label', ''))}\n"
        f"SKU {_esc(ctx.get('sku'))} · only <b>{_esc(ctx.get('remaining'))}</b> left"
    )
