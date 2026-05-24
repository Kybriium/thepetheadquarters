from pathlib import Path

from decouple import config, Csv

BASE_DIR = Path(__file__).resolve().parent.parent

DJANGO_ENV = config("DJANGO_ENV", default="development")

# ---------------------------------------------------------------------------
# Security
# ---------------------------------------------------------------------------
SECRET_KEY = config("DJANGO_SECRET_KEY", default="django-insecure-change-me-in-production")

DEBUG = config("DJANGO_DEBUG", default=DJANGO_ENV == "development", cast=bool)

ALLOWED_HOSTS = config("DJANGO_ALLOWED_HOSTS", default="localhost,127.0.0.1", cast=Csv())
# Railway auto-injects RAILWAY_PUBLIC_DOMAIN per deploy (e.g.
# `myapp-production.up.railway.app`). Append it so we don't have to
# remember to keep DJANGO_ALLOWED_HOSTS in sync after every redeploy.
_railway_host = config("RAILWAY_PUBLIC_DOMAIN", default="")
if _railway_host and _railway_host not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append(_railway_host)

# ---------------------------------------------------------------------------
# Apps
# ---------------------------------------------------------------------------
DJANGO_APPS = [
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

THIRD_PARTY_APPS = [
    "rest_framework",
    "django_filters",
    "corsheaders",
    "anymail",
]

LOCAL_APPS = [
    "apps.core",
    "apps.accounts",
    "apps.categories",
    "apps.brands",
    "apps.products",
    "apps.attributes",
    "apps.customizations",
    "apps.newsletter",
    "apps.contact",
    "apps.orders",
    "apps.suppliers",
    "apps.procurement",
    "apps.expenses",
    "apps.promotions",
    "apps.reviews",
    "apps.analytics",
    "apps.audit",
    "apps.integrations",
    "apps.admin_panel",
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

# ---------------------------------------------------------------------------
# Middleware
# ---------------------------------------------------------------------------
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    # WhiteNoise serves /static/ assets straight from Django so we don't
    # need a separate CDN for admin/DRF assets in production. Must be
    # the second middleware (right after SecurityMiddleware) per its docs.
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "apps.core.middleware.CacheControlMiddleware",
    "apps.audit.middleware.AuditContextMiddleware",
]

ROOT_URLCONF = "config.urls"

WSGI_APPLICATION = "config.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
# Three modes, in priority order:
#   1. DATABASE_URL (Railway, Render, Fly, Heroku) — parsed by dj-database-url
#   2. Explicit DB_NAME/DB_USER/... env vars (self-managed Postgres)
#   3. Local SQLite fallback (dev default — no env needed)
import dj_database_url  # noqa: E402

_db_url = config("DATABASE_URL", default="")
if _db_url:
    DATABASES = {
        "default": dj_database_url.parse(
            _db_url,
            conn_max_age=600,   # keep connections alive 10min (Railway closes idle ones)
            ssl_require=DJANGO_ENV == "production",
        )
    }
elif config("DB_NAME", default=""):
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": config("DB_NAME"),
            "USER": config("DB_USER"),
            "PASSWORD": config("DB_PASSWORD"),
            "HOST": config("DB_HOST", default="localhost"),
            "PORT": config("DB_PORT", default="5432"),
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }

# ---------------------------------------------------------------------------
# Cache / Redis
# ---------------------------------------------------------------------------
if config("REDIS_URL", default=""):
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": config("REDIS_URL"),
        }
    }

# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# ---------------------------------------------------------------------------
# JWT
# ---------------------------------------------------------------------------
from datetime import timedelta  # noqa: E402

# Access token: kept relatively short so a stolen access cookie can't be
# replayed for long, but generous enough that an active session doesn't
# trigger a refresh every few minutes. 60 min is the industry-standard
# middle ground.
JWT_ACCESS_TOKEN_LIFETIME = timedelta(minutes=60)
JWT_REFRESH_TOKEN_LIFETIME = timedelta(days=7)
JWT_ALGORITHM = "HS256"

# ---------------------------------------------------------------------------
# Email verification / Password reset
# ---------------------------------------------------------------------------
EMAIL_VERIFICATION_TOKEN_EXPIRY_HOURS = 24
PASSWORD_RESET_TOKEN_EXPIRY_HOURS = 1

# ---------------------------------------------------------------------------
# Email
# ---------------------------------------------------------------------------
EMAIL_BACKEND = config(
    "EMAIL_BACKEND",
    default="django.core.mail.backends.console.EmailBackend",
)
# Legacy SMTP settings — kept as a fallback in case someone wants to use a
# self-hosted SMTP server. The actively recommended path in production is
# anymail.backends.resend.EmailBackend (HTTP-based, dodges firewall + port
# issues on hosts that throttle outbound SMTP).
EMAIL_HOST = config("EMAIL_HOST", default="")
EMAIL_PORT = config("EMAIL_PORT", default=587, cast=int)
EMAIL_HOST_USER = config("EMAIL_HOST_USER", default="")
EMAIL_HOST_PASSWORD = config("EMAIL_HOST_PASSWORD", default="")
EMAIL_USE_TLS = True
# Defensive: cap the SMTP socket wait so a stalled connection doesn't tie
# up a gunicorn worker for the OS default (~75s) and trip the 60s timeout.
EMAIL_TIMEOUT = 10

# Anymail (Resend HTTP API). Reads RESEND_API_KEY at send time; harmless if
# the SMTP backend is the one actually being used.
ANYMAIL = {
    "RESEND_API_KEY": config("RESEND_API_KEY", default=""),
}
DEFAULT_FROM_EMAIL = config(
    "DEFAULT_FROM_EMAIL",
    default="contact@thepetheadquarters.co.uk",
)

FRONTEND_URL = config("FRONTEND_URL", default="http://localhost:3000")

# ---------------------------------------------------------------------------
# Stripe
# ---------------------------------------------------------------------------
STRIPE_SECRET_KEY = config("STRIPE_SECRET_KEY", default="")
STRIPE_PUBLISHABLE_KEY = config("STRIPE_PUBLISHABLE_KEY", default="")
STRIPE_WEBHOOK_SECRET = config("STRIPE_WEBHOOK_SECRET", default="")

# ---------------------------------------------------------------------------
# Shipping
# ---------------------------------------------------------------------------
SHIPPING_FLAT_RATE_PENCE = config("SHIPPING_FLAT_RATE_PENCE", default=399, cast=int)
SHIPPING_FREE_THRESHOLD_PENCE = config("SHIPPING_FREE_THRESHOLD_PENCE", default=3000, cast=int)

# ---------------------------------------------------------------------------
# VAT (UK)
# ---------------------------------------------------------------------------
VAT_RATE = config("VAT_RATE", default=0.20, cast=float)
PRICES_INCLUDE_VAT = config("PRICES_INCLUDE_VAT", default=True, cast=bool)
# Default to False — charging VAT-inclusive prices without registering
# with HMRC is illegal. Flip to True only after you have a VAT number.
VAT_REGISTERED = config("VAT_REGISTERED", default=False, cast=bool)
COMPANY_VAT_NUMBER = config("COMPANY_VAT_NUMBER", default="")

# ---------------------------------------------------------------------------
# Company identity — required on every business communication
# (Companies Act 2006 s.82). Surfaced publicly via /api/v1/site/legal/.
# ---------------------------------------------------------------------------
COMPANY_LEGAL_NAME = config("COMPANY_LEGAL_NAME", default="")
COMPANY_NUMBER = config("COMPANY_NUMBER", default="")
COMPANY_REGISTERED_OFFICE = config("COMPANY_REGISTERED_OFFICE", default="")
COMPANY_INCORPORATION = config("COMPANY_INCORPORATION", default="England and Wales")
COMPANY_TRADING_NAME = config("COMPANY_TRADING_NAME", default="The Pet Headquarters")

# ---------------------------------------------------------------------------
# Analytics — first-party, cookieless, GDPR-friendly
# ---------------------------------------------------------------------------
# Server-side salt mixed into the daily visitor hash. MUST be set in
# production via env var so the hash can't be predicted off-site.
ANALYTICS_DAILY_SALT = config(
    "ANALYTICS_DAILY_SALT",
    default="tph-analytics-default-salt-rotate-me-in-prod",
)
ANALYTICS_SESSION_TIMEOUT_MINUTES = config(
    "ANALYTICS_SESSION_TIMEOUT_MINUTES", default=30, cast=int,
)
ANALYTICS_RAW_RETENTION_DAYS = config(
    "ANALYTICS_RAW_RETENTION_DAYS", default=90, cast=int,
)

# ---------------------------------------------------------------------------
# i18n
# ---------------------------------------------------------------------------
LANGUAGE_CODE = "en-gb"

TIME_ZONE = "Europe/London"

USE_I18N = True

USE_TZ = True

# ---------------------------------------------------------------------------
# Static (served by WhiteNoise in production; runserver in dev)
# ---------------------------------------------------------------------------
STATIC_URL = "static/"
# Where `manage.py collectstatic` writes the compiled bundle — Railway's
# build step runs collectstatic and WhiteNoise serves out of here.
STATIC_ROOT = BASE_DIR / "staticfiles"
# CompressedManifestStaticFilesStorage adds content-hash filenames + gzip,
# so /static/admin/css/base.css becomes /static/admin/css/base.abc123.css
# and gets a year-long cache header. Survives deploys without cache busting.
STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

# ---------------------------------------------------------------------------
# Media (uploaded files)
# ---------------------------------------------------------------------------
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

# ---------------------------------------------------------------------------
# Cloudinary (production image storage)
# ---------------------------------------------------------------------------
# If CLOUDINARY_URL is set, uploads go to Cloudinary CDN.
# Otherwise images are stored locally in MEDIA_ROOT (dev fallback).
# Format: cloudinary://API_KEY:API_SECRET@CLOUD_NAME
CLOUDINARY_URL = config("CLOUDINARY_URL", default="")

if CLOUDINARY_URL:
    import cloudinary
    cloudinary.config(secure=True)  # auto-reads CLOUDINARY_URL from env

# ---------------------------------------------------------------------------
# Private object storage — S3-compatible (Railway Bucket / Cloudflare R2 /
# Backblaze B2 / AWS S3). Used for files the public should never download
# directly: customer customisation uploads, admin-uploaded expense
# receipts, supplier invoices, etc.
#
# Configure with the standard AWS_* env names so any provider works:
#   AWS_ACCESS_KEY_ID
#   AWS_SECRET_ACCESS_KEY
#   AWS_STORAGE_BUCKET_NAME
#   AWS_S3_ENDPOINT_URL   (e.g. https://gateway.storjshare.io for Storj,
#                          or the Railway/R2-provided endpoint)
#   AWS_S3_REGION_NAME    (defaults to 'auto' — works for R2/Railway)
#
# When AWS_STORAGE_BUCKET_NAME is empty the code paths fall back to local
# filesystem storage under MEDIA_ROOT/private/ so dev still works without
# a bucket configured.
# ---------------------------------------------------------------------------
AWS_ACCESS_KEY_ID = config("AWS_ACCESS_KEY_ID", default="")
AWS_SECRET_ACCESS_KEY = config("AWS_SECRET_ACCESS_KEY", default="")
AWS_STORAGE_BUCKET_NAME = config("AWS_STORAGE_BUCKET_NAME", default="")
AWS_S3_ENDPOINT_URL = config("AWS_S3_ENDPOINT_URL", default="")
AWS_S3_REGION_NAME = config("AWS_S3_REGION_NAME", default="auto")
AWS_S3_ADDRESSING_STYLE = config("AWS_S3_ADDRESSING_STYLE", default="virtual")
# Signed URL TTL for private downloads — 10 minutes is generous enough
# that the admin's browser won't hit it on slow PDFs, short enough that
# accidentally-shared links expire fast.
AWS_S3_SIGNED_URL_TTL_SECONDS = int(config("AWS_S3_SIGNED_URL_TTL_SECONDS", default=600))

# True when ANY cloud private-storage backend is configured. The storage
# helper picks S3 first, then Cloudinary's authenticated delivery, then
# falls back to local disk. We treat Cloudinary as a valid prod backend
# because it supports `type=authenticated` private uploads with signed
# URLs — useful for stacks that already pay for Cloudinary for product
# images and don't want a second object-storage vendor for receipts.
PRIVATE_STORAGE_ENABLED = bool(
    (AWS_STORAGE_BUCKET_NAME and AWS_ACCESS_KEY_ID) or CLOUDINARY_URL
)

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ---------------------------------------------------------------------------
# Django REST Framework
# ---------------------------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
    ],
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "apps.accounts.authentication.CookieJWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.AllowAny",
    ],
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
    ],
    "EXCEPTION_HANDLER": "apps.core.exceptions.api_exception_handler",
    "DEFAULT_THROTTLE_CLASSES": [
        "apps.core.throttling.AnonBurstThrottle",
        "apps.core.throttling.AnonSustainedThrottle",
        "apps.core.throttling.UserBurstThrottle",
        "apps.core.throttling.UserSustainedThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        # Anonymous visitors fire ~10-15 requests just rendering the
        # landing page (categories, brands, reviews, activity, hero
        # images, etc). 30/minute was triggering 429s for legit
        # browsing sessions; 120/min keeps anti-abuse pressure on
        # while letting a real visitor click around freely.
        "anon_burst": "120/minute",
        "anon_sustained": "2000/day",
        # Authenticated users had a 60/minute cap that was too tight —
        # a single admin opening the dashboard fires ~15 parallel
        # requests (orders + analytics + finances + recent activity).
        # Loading two admin pages in a row blew the budget and tripped
        # 429s for the rest of the minute. Bumping to a level that
        # still rate-limits abuse but accommodates real admin usage.
        "user_burst": "300/minute",
        "user_sustained": "10000/day",
        # Customization image uploads — tight because each request stores a file.
        "customization_upload": "10/minute",
    },
}

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
CORS_ALLOWED_ORIGINS = config(
    "CORS_ALLOWED_ORIGINS",
    default="http://localhost:3000",
    cast=Csv(),
)
# Vercel gives the same project three URL shapes — the production
# `<project>.vercel.app`, the git-branch `<project>-git-<branch>-<team>.vercel.app`,
# and a unique-per-deploy `<project>-<hash>-<team>.vercel.app`. Listing the
# deploy-hash URL doesn't scale because it changes every push, so we accept
# a comma-separated list of regex patterns from env (anchored with ^ / $).
_cors_regexes = config("CORS_ALLOWED_ORIGIN_REGEXES", default="", cast=Csv())
if _cors_regexes:
    CORS_ALLOWED_ORIGIN_REGEXES = _cors_regexes
CORS_ALLOW_CREDENTIALS = True

# ---------------------------------------------------------------------------
# CSRF
# ---------------------------------------------------------------------------
CSRF_TRUSTED_ORIGINS = config(
    "CSRF_TRUSTED_ORIGINS",
    default="http://localhost:3000",
    cast=Csv(),
)
# Same Railway-host trick as ALLOWED_HOSTS — CSRF needs the full scheme.
if _railway_host:
    _railway_origin = f"https://{_railway_host}"
    if _railway_origin not in CSRF_TRUSTED_ORIGINS:
        CSRF_TRUSTED_ORIGINS.append(_railway_origin)
# Production gets SameSite=None so the CSRF cookie flows on cross-site
# fetches from the Vercel frontend (different eTLD+1 to the Railway
# backend). SameSite=None requires Secure=True — set in the production
# block below. Dev stays Lax since same-site localhost works fine and
# Chrome rejects SameSite=None on non-HTTPS connections.
CSRF_COOKIE_SAMESITE = "None" if DJANGO_ENV == "production" else "Lax"
CSRF_COOKIE_HTTPONLY = False

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
        },
    },
    "loggers": {
        "apps": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
    },
}

# ---------------------------------------------------------------------------
# Production overrides
# ---------------------------------------------------------------------------
if DJANGO_ENV == "production":
    DEBUG = False
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_BROWSER_XSS_FILTER = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    X_FRAME_OPTIONS = "DENY"
    # Railway terminates TLS at its edge proxy and forwards plain HTTP
    # to the app with X-Forwarded-Proto: https. Without this header Django
    # would think every request is insecure and reject secure-only cookies.
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    # Session cookie also goes cross-site (frontend on the brand domain
    # talking to backend on a Railway subdomain), so SameSite=None+Secure.
    # Same reasoning as CSRF_COOKIE_SAMESITE and the JWT cookies in
    # apps.accounts.tokens.set_auth_cookies.
    SESSION_COOKIE_SAMESITE = "None"
    # HSTS — only enable when you're 100% on HTTPS. Railway is. 1 year max-age.
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
