import { getSessionUser, normalizeEmail } from "./auth.js";

export const ADMIN_ROLES = ["owner", "admin", "content_editor", "support"];

const ROLE_PERMISSIONS = {
  owner: ["*"],
  admin: [
    "view_overview",
    "view_users",
    "manage_users",
    "manage_entitlements",
    "manage_payments",
    "manage_instructors",
    "view_content",
    "manage_content",
    "view_analytics",
    "manage_support",
    "view_audit",
  ],
  content_editor: [
    "view_overview",
    "view_content",
    "manage_content",
    "view_analytics",
  ],
  support: [
    "view_overview",
    "view_users",
    "manage_users",
    "view_analytics",
    "manage_support",
  ],
};

export async function requireAdmin(req, databaseUrl, options = {}) {
  const session = req.__testSessionUser || await getSessionUser(req, databaseUrl);
  if (!session) {
    const error = new Error("Login required");
    error.statusCode = 401;
    throw error;
  }

  const role = normalizeRole(session.role);
  const permission = options.permission || "view_overview";
  const allowedRoles = options.roles || [];

  if (!isElevatedRole(role) || !hasPermission(role, permission) || (allowedRoles.length && !allowedRoles.includes(role))) {
    const error = new Error("Admin access required");
    error.statusCode = 403;
    throw error;
  }

  return {
    userId: session.userId,
    email: normalizeEmail(session.email),
    role,
    permissions: ROLE_PERMISSIONS[role] || [],
    requestCorrelationId: requestCorrelationId(req),
  };
}

export function sendAdminError(res, error) {
  const status = error?.statusCode || 500;
  const message = status === 401
    ? "Login required"
    : status === 403
      ? "Admin access required"
      : "Admin request failed";
  return res.status(status).json({ error: message });
}

export async function writeAdminAuditLog(client, admin, entry) {
  await client.query(
    `
      insert into admin_audit_log (
        admin_user_id,
        admin_email,
        action,
        target_type,
        target_email,
        target_id,
        before_state,
        after_state,
        reason,
        request_correlation_id,
        metadata
      )
      values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11::jsonb)
    `,
    [
      admin.userId,
      admin.email,
      entry.action,
      entry.targetType,
      entry.targetEmail || null,
      entry.targetId || null,
      JSON.stringify(entry.beforeState || null),
      JSON.stringify(entry.afterState || null),
      entry.reason || null,
      entry.requestCorrelationId || admin.requestCorrelationId || null,
      JSON.stringify(entry.metadata || {}),
    ]
  );
}

export function requestCorrelationId(req) {
  const existing = String(req?.headers?.["x-request-id"] || req?.headers?.["x-vercel-id"] || "");
  if (existing) return cleanCorrelationId(existing);
  return `admin_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function hasPermission(role, permission) {
  const normalizedRole = normalizeRole(role);
  const permissions = ROLE_PERMISSIONS[normalizedRole] || [];
  return permissions.includes("*") || permissions.includes(permission);
}

export function isElevatedRole(role) {
  return ADMIN_ROLES.includes(normalizeRole(role));
}

export function normalizeRole(role) {
  return String(role || "user").trim().toLowerCase();
}

export function testAuthzOk(req, res, admin, permission) {
  if (!req.__testAuthzOnly) return false;
  res.status(200).json({
    ok: true,
    role: admin.role,
    permission,
  });
  return true;
}

function cleanCorrelationId(value) {
  return String(value || "").replace(/[^\w:.-]/g, "").slice(0, 160);
}
