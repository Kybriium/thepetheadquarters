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


class MfaSetupThrottle(UserRateThrottle):
    # Generating a secret is cheap but issuing a flood is pointless and
    # noisy in the audit log. 10/min is plenty for a real wizard flow.
    rate = "10/minute"


class MfaVerifyThrottle(UserRateThrottle):
    # Verifying setup / change / disable. Tight enough to make brute-force
    # of 6-digit codes useless: a 6-digit window has 1M combinations and
    # at 10/min an attacker needs ~7 years for a 50% hit rate.
    rate = "10/minute"


class MfaLoginThrottle(AnonRateThrottle):
    # Anon throttle because the user isn't authed yet — they're holding
    # a challenge token. Slightly looser than VerifyThrottle to cope with
    # NAT'd offices, still strict enough to make brute-force impossible
    # given codes rotate every 30s.
    rate = "20/minute"


