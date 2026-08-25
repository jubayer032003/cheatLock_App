import type { AuthUser, UserRole } from "../types";

export const ADMIN_ROLES: UserRole[] = ["SUPER_ADMIN", "INSTITUTION_ADMIN", "DEPARTMENT_ADMIN"];

export function isAdminRole(role?: string | null): role is UserRole {
  return ADMIN_ROLES.includes(role as UserRole);
}

export function canEnterAdminDashboard(user: AuthUser | null | undefined) {
  return Boolean(user && isAdminRole(user.role));
}
