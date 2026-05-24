from django.urls import path

from .views import TrackView

# Endpoint path is intentionally obscure (`_a/`, not `/analytics/track/`).
# Common ad-block filter lists (EasyPrivacy, Brave Shields, uBlock) block
# any URL path containing the keywords `analytics`, `track`, `pixel`,
# `beacon`, etc. — even when the request is first-party to the merchant's
# own backend. The short opaque path slips through those filters so we
# can still see traffic from privacy-focused browsers.
urlpatterns = [
    path("_a/", TrackView.as_view()),
    # Old path kept as an alias for ~30 days so any in-flight requests from
    # cached JS bundles don't 404. Can be removed once Vercel cache + CDN
    # have fully rolled the new build.
    path("analytics/track/", TrackView.as_view()),
]
