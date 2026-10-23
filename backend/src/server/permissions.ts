export const PERMISSIONS = [
  "dashboard.view",
  "users.view",
  "users.export",
  "users.manage",
  "payments.view",
  "payments.export",
  "payments.verify_manual",
  "payments.refund",
  "content.manage",
  "notifications.manage",
  "settings.manage",
  "payment_settings.manage",
  "plans.manage",
  "memberships.view",
  "memberships.manage",
  "admins.manage",
  "audit.view",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLES: Record<string, { description: string; permissions: Permission[] }> = {
  owner: { description: "Full access", permissions: [...PERMISSIONS] },
  manager: {
    description: "Runs content, settings and manual payment verification",
    permissions: [
      "dashboard.view",
      "users.view",
      "users.export",
      "payments.view",
      "payments.export",
      "payments.verify_manual",
      "content.manage",
      "notifications.manage",
      "settings.manage",
      "memberships.view",
    ],
  },
  support: {
    description: "Read-only access to users, payments and memberships",
    permissions: ["dashboard.view", "users.view", "payments.view", "memberships.view"],
  },
  viewer: { description: "Dashboard only", permissions: ["dashboard.view"] },
};

export const ADMIN_ROLE_NAMES = Object.keys(ROLES);
