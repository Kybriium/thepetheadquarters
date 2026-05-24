"""
Admin endpoints for configuring outbound notification integrations.
Storefront never reads these — staff-only writes/reads.
"""

from apps.admin_panel.views.base import AdminBaseView
from apps.core.responses import (
    error_response,
    success_response,
    validation_error_response,
)
from apps.integrations.models import NotificationEvent, TelegramConfig
from apps.integrations.services import (
    TelegramError,
    discover_chats as discover_chats_svc,
    get_me as get_me_svc,
    send_message as send_message_svc,
)


def _mask_token(token: str) -> str:
    """Show only the last 4 chars so the UI can confirm "yes that's the same key"
    without exposing the full secret in API responses."""
    if not token:
        return ""
    return "•" * max(0, len(token) - 4) + token[-4:]


def _serialize(config: TelegramConfig | None) -> dict:
    """Always return a stable shape so the frontend doesn't need null guards."""
    if not config:
        return {
            "configured": False,
            "bot_token_mask": "",
            "bot_username": "",
            "bot_name": "",
            "chat_targets": [],
            "enabled_events": {},
            "low_stock_threshold": 5,
            "is_enabled": False,
            "last_polled_at": None,
            "available_events": [
                {"key": e.value, "label": e.label}
                for e in NotificationEvent
            ],
        }
    return {
        "configured": True,
        "bot_token_mask": _mask_token(config.bot_token),
        "bot_username": config.bot_username,
        "bot_name": config.bot_name,
        "chat_targets": config.chat_targets or [],
        "enabled_events": config.enabled_events or {},
        "low_stock_threshold": config.low_stock_threshold,
        "is_enabled": config.is_enabled,
        "last_polled_at": config.last_polled_at.isoformat() if config.last_polled_at else None,
        "available_events": [
            {"key": e.value, "label": e.label}
            for e in NotificationEvent
        ],
    }


def _singleton() -> TelegramConfig | None:
    """Org-wide singleton — first row wins."""
    return TelegramConfig.objects.first()


class AdminTelegramConfigView(AdminBaseView):
    """GET current config; PUT to save token/chats/events; DELETE to disconnect."""

    def get(self, request):
        return success_response(_serialize(_singleton()))

    def patch(self, request):
        """
        Idempotent upsert. The frontend posts the full state on each save
        (token, chat targets with enabled flags, enabled_events map,
        low_stock_threshold, is_enabled). Token is required only on the
        first save — subsequent saves keep the existing token unless a new
        one is provided.
        """
        config = _singleton()
        token = (request.data.get("bot_token") or "").strip()

        if not config:
            if not token:
                return validation_error_response({"bot_token": "required"})
            # Verify the token works before persisting anything.
            try:
                me = get_me_svc(token)
            except TelegramError as exc:
                return error_response(
                    "integrations.telegram.invalid_token",
                    status_code=400,
                )
            config = TelegramConfig.objects.create(
                bot_token=token,
                bot_username=me.get("username", "") or "",
                bot_name=me.get("first_name", "") or "",
            )
        elif token and token != config.bot_token:
            # Rotation — re-verify against the new token, refresh cached metadata.
            try:
                me = get_me_svc(token)
            except TelegramError:
                return error_response(
                    "integrations.telegram.invalid_token",
                    status_code=400,
                )
            config.bot_token = token
            config.bot_username = me.get("username", "") or ""
            config.bot_name = me.get("first_name", "") or ""
            # Reset polling cursor so the new bot's existing chats can be re-discovered.
            config.last_update_id = 0
            config.chat_targets = []

        # Patch the rest of the editable fields.
        if "chat_targets" in request.data:
            # Trust the client to send a sanitized list of {id, title, type, enabled}.
            # We only keep known keys and coerce types.
            cleaned = []
            for t in (request.data["chat_targets"] or []):
                try:
                    cleaned.append({
                        "id": int(t["id"]),
                        "title": str(t.get("title", "")),
                        "type": str(t.get("type", "private")),
                        "enabled": bool(t.get("enabled", True)),
                    })
                except (KeyError, TypeError, ValueError):
                    continue
            config.chat_targets = cleaned

        if "enabled_events" in request.data:
            valid_keys = {e.value for e in NotificationEvent}
            config.enabled_events = {
                k: bool(v)
                for k, v in (request.data["enabled_events"] or {}).items()
                if k in valid_keys
            }

        if "low_stock_threshold" in request.data:
            try:
                config.low_stock_threshold = max(0, int(request.data["low_stock_threshold"]))
            except (TypeError, ValueError):
                pass

        if "is_enabled" in request.data:
            config.is_enabled = bool(request.data["is_enabled"])

        config.save()
        return success_response(_serialize(config))

    def delete(self, request):
        config = _singleton()
        if config:
            config.delete()
        return success_response()


class AdminTelegramDiscoverView(AdminBaseView):
    """
    Poll Telegram's getUpdates for any chats that have messaged the bot
    since the last discovery and merge them into chat_targets.
    """

    def post(self, request):
        config = _singleton()
        if not config:
            return error_response("integrations.telegram.not_configured", status_code=404)
        try:
            targets = discover_chats_svc(config)
        except TelegramError as exc:
            return error_response(
                "integrations.telegram.discover_failed",
                status_code=502,
            )
        return success_response({"chat_targets": targets})


class AdminTelegramTestView(AdminBaseView):
    """Send a hard-coded test message to all enabled chats so the admin can
    visually confirm the wiring works before relying on it for real events."""

    def post(self, request):
        config = _singleton()
        if not config or not config.bot_token:
            return error_response("integrations.telegram.not_configured", status_code=404)

        chat_ids = [
            t["id"] for t in (config.chat_targets or [])
            if t.get("enabled", True)
        ]
        if not chat_ids:
            return error_response("integrations.telegram.no_chats", status_code=400)

        text = (
            "✅ <b>Test from your shop</b>\n"
            "If you can read this, notifications are wired up correctly."
        )
        results = []
        for chat_id in chat_ids:
            try:
                send_message_svc(config.bot_token, chat_id, text)
                results.append({"chat_id": chat_id, "ok": True})
            except TelegramError as exc:
                results.append({"chat_id": chat_id, "ok": False, "error": str(exc)})

        return success_response({"results": results})
