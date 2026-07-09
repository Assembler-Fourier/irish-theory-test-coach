import { getSessionUser, normalizeEmail } from "./auth.js";

export async function requireAdmin(req, databaseUrl) {
  const session = await getSessionUser(req, databaseUrl);
  if (!session) {
    const error = new Error("Login required");
    error.statusCode = 401;
    throw error;
  }

  if (session.role !== "admin") {
    const error = new Error("Admin access required");
    error.statusCode = 403;
    throw error;
  }

  return {
    userId: session.userId,
    email: normalizeEmail(session.email),
    role: session.role,
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
        metadata
      )
      values ($1, $2, $3, $4, $5, $6, $7::jsonb)
    `,
    [
      admin.userId,
      admin.email,
      entry.action,
      entry.targetType,
      entry.targetEmail || null,
      entry.targetId || null,
      JSON.stringify(entry.metadata || {}),
    ]
  );
}
