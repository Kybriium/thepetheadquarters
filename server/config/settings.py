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
if config("DB_NAME", default=""):
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

JWT_ACCESS_TOKEN_LIFETIME = timedelta(minutes=15)
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
EMAIL_HOST = config("EMAIL_HOST", default="")
EMAIL_PORT = config("EMAIL_PORT", default=587, cast=int)
EMAIL_HOST_USER = config("EMAIL_HOST_USER", default="")
EMAIL_HOST_PASSWORD = config("EMAIL_HOST_PASSWORD", default="")
EMAIL_USE_TLS = True
DEFAULT_FROM_EMAIL = config(
    "DEFAULT_FROM_EMAIL",
    default="noreply@thepetheadquarters.co.uk",
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
# Static
# ---------------------------------------------------------------------------
STATIC_URL = "static/"

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
        "anon_burst": "30/minute",
        "anon_sustained": "500/day",
        "user_burst": "60/minute",
        "user_sustained": "2000/day",
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
CORS_ALLOW_CREDENTIALS = True

# ---------------------------------------------------------------------------
# CSRF
# ---------------------------------------------------------------------------
CSRF_TRUSTED_ORIGINS = config(
    "CSRF_TRUSTED_ORIGINS",
    default="http://localhost:3000",
    cast=Csv(),
)
CSRF_COOKIE_SAMESITE = "Lax"
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
