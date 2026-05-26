export interface MfaStatus {
  enabled: boolean;
  enabled_at: string | null;
}

// Role is the `code` of a Role record. The 5 system codes (OWNER,
// ORDER_MANAGER, INVENTORY_MANAGER, MARKETING, AUDITOR) ship with the
// app; custom-role codes are slugs generated from the role's name at
// creation time. We keep this as a plain string so custom roles type
// cleanly without needing to widen a union every time.
export type AdminRole = string;

export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  is_email_verified: boolean;
  is_staff: boolean;
  role: AdminRole;
  // Flat list of permission codes granted by the role. Empty for
  // non-staff users. Frontend gates UI off this; backend re-validates
  // every endpoint so a tampered list can't grant access.
  permissions: string[];
  created_at: string;
  mfa: MfaStatus;
  // True only when the account is staff and 2FA is not yet enabled —
  // the admin layout uses this to hard-redirect to the setup wizard.
  mfa_required: boolean;
}

export interface LoginChallenge {
  requires_2fa: true;
  challenge_token: string;
}

export interface MfaSetupResponse {
  secret: string;
  provisioning_uri: string;
}

export interface MfaSetupVerifyResponse {
  enabled_at: string;
  backup_codes: string[];
}

export interface Address {
  id: string;
  label: string;
  full_name: string;
  address_line_1: string;
  address_line_2: string;
  city: string;
  county: string;
  postcode: string;
  country: string;
  phone: string;
  is_default: boolean;
  created_at: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  gdpr_consent: boolean;
}
