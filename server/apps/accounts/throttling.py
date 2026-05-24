from rest_framework.throttling import AnonRateThrottle, UserRateThrottle


class RegisterThrottle(AnonRateThrottle):
    rate = "5/minute"


class LoginThrottle(AnonRateThrottle):
    rate = "10/minute"


class TokenRefreshThrottle(AnonRateThrottle):
    # Generous headroom — a single active user with multiple tabs can
    # easily fire >30 refreshes/min during regular browsing (every page
    # load + every authed XHR that 401s triggers one). Hitting the
    # throttle was making AuthProvider give up and clear the session.
    rate = "120/minute"


class VerifyEmailThrottle(AnonRateThrottle):
    rate = "10/minute"


class ResendVerificationThrottle(UserRateThrottle):
    rate = "3/minute"


class PasswordResetRequestThrottle(AnonRateThrottle):
    rate = "3/minute"


class PasswordResetConfirmThrottle(AnonRateThrottle):
    rate = "5/minute"


class PasswordChangeThrottle(UserRateThrottle):
    rate = "5/minute"


