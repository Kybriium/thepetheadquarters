"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Search,
  Send,
  Trash2,
} from "lucide-react";
import { toast } from "@heroui/react";
import { QRCodeSVG } from "qrcode.react";
import {
  useDisconnectTelegram,
  useDiscoverChats,
  useSaveTelegramConfig,
  useTelegramConfig,
  useTestTelegram,
  type TelegramChatTarget,
} from "@/hooks/use-admin-integrations";

const BOTFATHER_URL = "https://t.me/BotFather";

export function TelegramSetup() {
  const { data: config, isLoading } = useTelegramConfig();
  const saveMutation = useSaveTelegramConfig();
  const disconnectMutation = useDisconnectTelegram();
  const discoverMutation = useDiscoverChats();
  const testMutation = useTestTelegram();

  // Token input is only used during the initial connect or a rotation.
  const [token, setToken] = useState("");

  if (isLoading || !config) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full" style={{ border: "2px solid var(--bg-border)", borderTopColor: "var(--gold)" }} />
      </div>
    );
  }

  // ------------------------------------------------------------------------
  // First-time setup — token not yet saved
  // ------------------------------------------------------------------------
  if (!config.configured) {
    return (
      <div className="flex flex-col gap-6">
        <BackLink />
        <Header
          name="Connect Telegram"
          subtitle="Receive new orders, contact messages, reviews and low-stock alerts wherever you read Telegram."
        />
        <SetupSteps />
        <div className="rounded-lg p-6" style={{ background: "var(--bg-secondary)", border: "1px solid var(--bg-border)" }}>
          <Label>Paste the bot token from @BotFather</Label>
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
            style={inputStyle}
            className="font-mono"
          />
          <p className="mt-1" style={hintStyle}>
            The token looks like <code>123456:ABC-...</code>. Stored server-side and never sent back to your browser.
          </p>
          <button
            onClick={async () => {
              if (!token.trim()) {
                toast.danger("Paste the bot token first");
                return;
              }
              try {
                await saveMutation.mutateAsync({ bot_token: token.trim() });
                setToken("");
                toast.success("Bot connected");
              } catch (e) {
                toast.danger("Token rejected — double-check it with BotFather");
              }
            }}
            disabled={saveMutation.isPending}
            className="mt-4 rounded-md px-5 py-2.5 disabled:opacity-50"
            style={primaryButtonStyle}
          >
            {saveMutation.isPending ? "Verifying…" : "Verify & connect"}
          </button>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------------
  // Configured — show config dashboard
  // ------------------------------------------------------------------------
  const botLink = config.bot_username ? `https://t.me/${config.bot_username}` : "";

  return (
    <div className="flex flex-col gap-6">
      <BackLink />
      <Header
        name={config.bot_name || "Telegram"}
        subtitle={
          config.bot_username
            ? `Bot @${config.bot_username} · master switch is ${config.is_enabled ? "ON" : "OFF"}.`
            : "Connected."
        }
        right={
          <button
            onClick={async () => {
              if (!confirm("Disconnect Telegram? Notifications will stop until you reconnect.")) return;
              await disconnectMutation.mutateAsync();
              toast.success("Disconnected");
            }}
            className="rounded-md px-4 py-2"
            style={{ border: "1px solid var(--error)", color: "var(--error)", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)" }}
          >
            <Trash2 size={12} className="mr-1.5 inline" />
            Disconnect
          </button>
        }
      />

      {/* Master switch */}
      <ToggleCard
        title="Master switch"
        description="Turn off temporarily without losing your settings — silences every notification."
        value={config.is_enabled}
        onChange={async (v) => {
          await saveMutation.mutateAsync({ is_enabled: v });
        }}
      />

      {/* Bot info + QR */}
      {config.bot_username && (
        <div className="grid gap-4 rounded-lg p-6 md:grid-cols-[200px_1fr]" style={{ background: "var(--bg-secondary)", border: "1px solid var(--bg-border)" }}>
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-md bg-white p-3">
              <QRCodeSVG value={botLink} size={160} level="M" />
            </div>
            <p style={{ fontFamily: "var(--font-montserrat)", fontSize: 11, color: "var(--white-faint)", textAlign: "center" }}>
              Scan to open your bot in Telegram
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <Label>How to add a chat</Label>
            <ol className="ml-4 list-decimal" style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-dim)", lineHeight: "var(--leading-relaxed)" }}>
              <li>Scan the QR (or open the link below) to chat with your bot.</li>
              <li>Tap <strong style={{ color: "var(--white)" }}>Start</strong> in Telegram. For a group: add @{config.bot_username} to the group and send any message.</li>
              <li>Click <strong style={{ color: "var(--white)" }}>Find chats</strong> below — your conversation will appear in the list.</li>
              <li>Tick which chats should receive notifications, then send a test message.</li>
            </ol>
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={botLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5"
                style={{ background: "var(--bg-tertiary)", color: "var(--white)", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)" }}
              >
                {botLink} <ExternalLink size={11} />
              </a>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(botLink);
                  toast.success("Copied");
                }}
                className="inline-flex items-center gap-1 rounded-md px-3 py-1.5"
                style={{ border: "1px solid var(--bg-border)", color: "var(--white-faint)", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)" }}
              >
                <Copy size={11} /> Copy link
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chat targets */}
      <div className="rounded-lg p-6" style={{ background: "var(--bg-secondary)", border: "1px solid var(--bg-border)" }}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 style={{ fontFamily: "var(--font-cormorant)", fontSize: "var(--text-xl)", color: "var(--white)" }}>
              Chats to notify ({(config.chat_targets || []).filter((c) => c.enabled).length}/{(config.chat_targets || []).length})
            </h3>
            {config.last_polled_at && (
              <p style={{ fontFamily: "var(--font-montserrat)", fontSize: 11, color: "var(--white-faint)" }}>
                Last checked {new Date(config.last_polled_at).toLocaleString()}
              </p>
            )}
          </div>
          <button
            onClick={async () => {
              try {
                const res = await discoverMutation.mutateAsync();
                toast.success(`${res.chat_targets.length} chat(s) found`);
              } catch {
                toast.danger("Couldn't reach Telegram");
              }
            }}
            disabled={discoverMutation.isPending}
            className="flex items-center gap-1.5 rounded-md px-3 py-2 disabled:opacity-50"
            style={{ background: "var(--gold)", color: "#fff", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", fontWeight: 600 }}
          >
            {discoverMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
            Find chats
          </button>
        </div>

        {config.chat_targets.length === 0 ? (
          <p className="rounded-md py-6 text-center" style={{ background: "var(--bg-tertiary)", border: "1px dashed var(--bg-border)", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-faint)" }}>
            No chats yet. Open the bot in Telegram and hit <strong style={{ color: "var(--white-dim)" }}>Start</strong>, then click &quot;Find chats&quot; above.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {config.chat_targets.map((chat) => (
              <ChatRow
                key={chat.id}
                chat={chat}
                onChange={async (next) => {
                  const updated = config.chat_targets.map((c) =>
                    c.id === chat.id ? next : c,
                  );
                  await saveMutation.mutateAsync({ chat_targets: updated });
                }}
                onRemove={async () => {
                  const updated = config.chat_targets.filter((c) => c.id !== chat.id);
                  await saveMutation.mutateAsync({ chat_targets: updated });
                }}
              />
            ))}
          </div>
        )}

        <button
          onClick={async () => {
            try {
              const res = await testMutation.mutateAsync();
              const okCount = res.results.filter((r) => r.ok).length;
              const failCount = res.results.length - okCount;
              if (failCount === 0) {
                toast.success(`Test sent to ${okCount} chat(s)`);
              } else {
                toast.warning(`${okCount} delivered, ${failCount} failed — check Telegram`);
              }
            } catch {
              toast.danger("Test send failed");
            }
          }}
          disabled={testMutation.isPending || (config.chat_targets || []).filter((c) => c.enabled).length === 0}
          className="mt-4 inline-flex items-center gap-2 rounded-md px-4 py-2 disabled:opacity-50"
          style={{ border: "1px solid var(--bg-border)", color: "var(--gold-dark)", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", fontWeight: 500 }}
        >
          {testMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
          Send test message
        </button>
      </div>

      {/* Event toggles */}
      <div className="rounded-lg p-6" style={{ background: "var(--bg-secondary)", border: "1px solid var(--bg-border)" }}>
        <h3 className="mb-3" style={{ fontFamily: "var(--font-cormorant)", fontSize: "var(--text-xl)", color: "var(--white)" }}>
          What to send
        </h3>
        <div className="flex flex-col gap-2">
          {config.available_events.map((ev) => {
            const enabled = !!config.enabled_events[ev.key];
            return (
              <label
                key={ev.key}
                className="flex cursor-pointer items-center justify-between rounded-md px-3 py-2.5"
                style={{ background: "var(--bg-tertiary)", border: "1px solid var(--bg-border)" }}
              >
                <span style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white)" }}>
                  {ev.label}
                </span>
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={async (e) => {
                    const next = { ...config.enabled_events, [ev.key]: e.target.checked };
                    await saveMutation.mutateAsync({ enabled_events: next });
                  }}
                  style={{ accentColor: "var(--gold)" }}
                />
              </label>
            );
          })}
        </div>

        {/* Low-stock threshold only shown when that event is enabled */}
        {config.enabled_events.low_stock && (
          <div className="mt-4">
            <Label>Low-stock threshold</Label>
            <input
              type="number"
              min={0}
              defaultValue={config.low_stock_threshold}
              onBlur={async (e) => {
                const v = parseInt(e.target.value) || 0;
                if (v !== config.low_stock_threshold) {
                  await saveMutation.mutateAsync({ low_stock_threshold: v });
                }
              }}
              style={{ ...inputStyle, width: 120 }}
            />
            <p style={hintStyle}>Alert fires when a variant drops to this number or below.</p>
          </div>
        )}
      </div>

      {/* Rotate token */}
      <details className="rounded-lg p-4" style={{ background: "var(--bg-secondary)", border: "1px solid var(--bg-border)" }}>
        <summary style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white-faint)", cursor: "pointer", letterSpacing: "var(--tracking-wide)", textTransform: "uppercase" }}>
          Rotate bot token
        </summary>
        <div className="mt-3 flex flex-col gap-2">
          <p style={hintStyle}>
            Current: <code>{config.bot_token_mask}</code>. Pasting a new token replaces the bot — your existing chats will be reset.
          </p>
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="New token from BotFather"
            style={inputStyle}
            className="font-mono"
          />
          <button
            onClick={async () => {
              if (!token.trim()) return;
              try {
                await saveMutation.mutateAsync({ bot_token: token.trim() });
                setToken("");
                toast.success("Token rotated");
              } catch {
                toast.danger("Token rejected");
              }
            }}
            className="w-fit rounded-md px-4 py-2"
            style={{ background: "var(--bg-tertiary)", border: "1px solid var(--bg-border)", color: "var(--white-dim)", fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)" }}
          >
            Replace token
          </button>
        </div>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function BackLink() {
  return (
    <Link href="/admin/integrations" className="inline-flex w-fit items-center gap-2 transition-colors duration-200 hover:text-[var(--gold)]" style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white-faint)", letterSpacing: "var(--tracking-wide)", textTransform: "uppercase" }}>
      <ArrowLeft size={14} /> Integrations
    </Link>
  );
}

function Header({ name, subtitle, right }: { name: string; subtitle: string; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 style={{ fontFamily: "var(--font-cormorant)", fontSize: "var(--text-3xl)", fontWeight: "var(--weight-regular)", color: "var(--white)" }}>
          {name}
        </h1>
        <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-faint)", marginTop: "var(--space-1)" }}>
          {subtitle}
        </p>
      </div>
      {right}
    </div>
  );
}

function SetupSteps() {
  return (
    <div className="rounded-lg p-6" style={{ background: "var(--bg-secondary)", border: "1px solid var(--bg-border)" }}>
      <h3 className="mb-3" style={{ fontFamily: "var(--font-cormorant)", fontSize: "var(--text-xl)", color: "var(--white)" }}>
        Three-minute setup
      </h3>
      <ol className="ml-4 flex list-decimal flex-col gap-2" style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", color: "var(--white-dim)", lineHeight: "var(--leading-relaxed)" }}>
        <li>
          Open{" "}
          <a href={BOTFATHER_URL} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "var(--gold-dark)" }}>
            @BotFather in Telegram <ExternalLink size={11} className="inline" />
          </a>
          {" "}and tap <strong style={{ color: "var(--white)" }}>Start</strong>.
        </li>
        <li>
          Send <code style={codeStyle}>/newbot</code>, give it a name (e.g. <em>My Shop Alerts</em>), then a username ending in <code style={codeStyle}>bot</code> (e.g. <em>myshop_alerts_bot</em>).
        </li>
        <li>
          BotFather replies with a token — looks like{" "}
          <code style={codeStyle}>123456:ABC-DEF…</code>. Copy it.
        </li>
        <li>Paste the token below and hit <strong style={{ color: "var(--white)" }}>Verify &amp; connect</strong>.</li>
        <li>After connecting, you&apos;ll get a QR code to scan + a button to find your chat.</li>
      </ol>
    </div>
  );
}

function ChatRow({
  chat,
  onChange,
  onRemove,
}: {
  chat: TelegramChatTarget;
  onChange: (next: TelegramChatTarget) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md px-3 py-2" style={{ background: "var(--bg-tertiary)", border: "1px solid var(--bg-border)" }}>
      <label className="flex flex-1 cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={chat.enabled}
          onChange={(e) => onChange({ ...chat, enabled: e.target.checked })}
          style={{ accentColor: "var(--gold)" }}
        />
        <div>
          <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--white)" }}>
            {chat.title}
          </p>
          <p style={{ fontFamily: "var(--font-montserrat)", fontSize: 10, color: "var(--white-faint)" }}>
            {chat.type} · id {chat.id}
          </p>
        </div>
      </label>
      <button
        onClick={() => {
          if (!confirm(`Remove "${chat.title}" from the notification list?`)) return;
          void onRemove();
        }}
        className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-[rgba(198,40,40,0.1)]"
        style={{ color: "var(--white-faint)" }}
        title="Remove"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

function ToggleCard({
  title,
  description,
  value,
  onChange,
}: {
  title: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => Promise<void>;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg p-5" style={{ background: "var(--bg-secondary)", border: "1px solid var(--bg-border)" }}>
      <div>
        <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--white)" }}>
          {title}
        </p>
        <p style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white-faint)" }}>
          {description}
        </p>
      </div>
      <input
        type="checkbox"
        checked={local}
        onChange={(e) => {
          const next = e.target.checked;
          setLocal(next);
          void onChange(next).catch(() => setLocal(value));
        }}
        style={{ accentColor: "var(--gold)", transform: "scale(1.3)" }}
      />
    </label>
  );
}

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const inputStyle = {
  background: "var(--bg-tertiary)",
  border: "1px solid var(--bg-border)",
  color: "var(--white)",
  fontFamily: "var(--font-montserrat)",
  fontSize: "var(--text-sm)" as const,
  borderRadius: "var(--radius-md)",
  padding: "var(--space-3) var(--space-4)",
  width: "100%",
};

const hintStyle = {
  fontFamily: "var(--font-montserrat)",
  fontSize: 11 as const,
  color: "var(--white-faint)",
  lineHeight: "var(--leading-relaxed)" as const,
};

const codeStyle = {
  background: "var(--bg-tertiary)",
  border: "1px solid var(--bg-border)",
  borderRadius: 3,
  padding: "1px 6px",
  fontFamily: "monospace",
  fontSize: "var(--text-xs)" as const,
  color: "var(--gold-dark)",
};

const primaryButtonStyle = {
  background: "var(--gold)",
  color: "#fff",
  fontFamily: "var(--font-montserrat)",
  fontSize: "var(--text-sm)" as const,
  fontWeight: 600,
};

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-2 block" style={{ fontFamily: "var(--font-montserrat)", fontSize: "var(--text-xs)", color: "var(--white-faint)", letterSpacing: "var(--tracking-wide)", textTransform: "uppercase" }}>
      {children}
    </label>
  );
}
