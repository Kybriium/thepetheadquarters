"""
Outbound notification integrations (Telegram first; designed so Slack /
Discord / etc. drop in later without schema change).
"""

from django.db import models

from apps.core.models import BaseModel


# Event keys we know how to format. The frontend renders toggles based on
# this list. Add a new value here + a formatter in `services.format_event`
# + a call site, and it shows up automatically in the admin UI.
class NotificationEvent(models.TextChoices):
    ORDER_PAID = "order_paid", "New paid order"
    CONTACT_MESSAGE = "contact_message", "Contact-form message"
    REVIEW_NEW = "review_new", "New product review"
    LOW_STOCK = "low_stock", "Low-stock alert"


class TelegramConfig(BaseModel):
    """
    Org-wide Telegram bot configuration. Stored as a singleton-ish row
    (the API only ever exposes the first one); a shop with one team
    doesn't need per-admin bots.
    """

    bot_token = models.CharField(
        max_length=255,
        help_text="Telegram bot token from @BotFather. Stored server-side and never returned to the client.",
    )
    bot_username = models.CharField(
        max_length=80,
        blank=True,
        default="",
        help_text="Cached @username of the bot (from getMe). Used to render the t.me/<username> QR code.",
    )
    bot_name = models.CharField(
        max_length=200,
        blank=True,
        default="",
        help_text="Cached display name of the bot.",
    )

    # List of chat_ids the bot should notify. Populated by the admin from
    # 'discovered' chats (chats that have ever messaged the bot since the
    # last getUpdates call). Each entry: {id, title, type}.
    chat_targets = models.JSONField(default=list, blank=True)

    # Which events are enabled. {event_key: bool}. Missing keys default to off.
    enabled_events = models.JSONField(default=dict, blank=True)

    # Low-stock threshold — only used when LOW_STOCK is enabled.
    low_stock_threshold = models.PositiveSmallIntegerField(default=5)

    is_enabled = models.BooleanField(
        default=True,
        help_text="Master kill-switch. When false, notify() silently no-ops.",
    )

    last_polled_at = models.DateTimeField(null=True, blank=True)
    last_update_id = models.BigIntegerField(
        default=0,
        help_text="Highest update_id seen by getUpdates so we only pick up new chats.",
    )

    class Meta(BaseModel.Meta):
        pass

    def __str__(self) -> str:
        return f"Telegram: @{self.bot_username or '?'}"
