from rest_framework.throttling import AnonRateThrottle, UserRateThrottle


class RegisterThrottle(AnonRateThrottle):
    rate = "5/minute"


class LoginThrottle(AnonRateThrottle):
    # 10/min was hitting innocent users behind NAT and shared-IP
    # offices. 60/min still makes online brute-force useless (any
    # password of even moderate strength takes years to crack at this
    # rate) while accommodating CI/test suites + retried form submits.
    rate = "60/minute"


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


