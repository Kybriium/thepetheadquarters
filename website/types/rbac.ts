export interface Role {
  code: string;
  name: string;
  description: string;
  permissions: string[];
  is_system: boolean;
  assigned_user_count: number;
  created_at: string;
  updated_at: string;
}

export interface PermissionEntry {
  code: string;
  label: string;
  hint: string;
}

export interface PermissionGroup {
  code: string;
  label: string;
  description: string;
  permissions: PermissionEntry[];
}

export interface PermissionCatalogue {
  groups: PermissionGroup[];
}
