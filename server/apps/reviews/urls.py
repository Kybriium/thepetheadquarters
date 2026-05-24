from django.urls import path

from .views import (
    MyReviewsView,
    RecentReviewsView,
    ReviewDetailView,
    ReviewEligibilityView,
    ReviewHelpfulView,
    ReviewListCreateView,
    ReviewStatsView,
)

urlpatterns = [
    path("reviews/recent/", RecentReviewsView.as_view()),
    path("products/<slug:slug>/reviews/", ReviewListCreateView.as_view()),
    path("products/<slug:slug>/reviews/stats/", ReviewStatsView.as_view()),
    path("products/<slug:slug>/reviews/eligibility/", ReviewEligibilityView.as_view()),
    path("products/<slug:slug>/reviews/<uuid:review_id>/", ReviewDetailView.as_view()),
    path("products/<slug:slug>/reviews/<uuid:review_id>/helpful/", ReviewHelpfulView.as_view()),
    path("me/reviews/", MyReviewsView.as_view()),
]
