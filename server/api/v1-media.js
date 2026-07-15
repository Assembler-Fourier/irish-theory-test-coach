import fs from "node:fs";
import { SESSION_COOKIE, getSessionUser } from "../../lib/auth.js";
import { contentTypeForMedia, sourceAssetPath } from "../../lib/question-bank.js";
import { checkRateLimit, limitFromEnv, rateLimitKey, sendRateLimited } from "../../lib/rate-limit.js";
import { getStudySessionSecret, verifyMediaToken } from "../../lib/study-session-tokens.js";
import { getAuthServerEnv, safeErrorSummary, sendSafeConfigError } from "../../lib/server-env.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const limit = checkRateLimit({
    key: rateLimitKey(req, "study-media"),
    limit: limitFromEnv("RATE_LIMIT_PROTECTED_MEDIA", 160),
    windowMs: 60_000,
  });
  if (!limit.allowed) return sendRateLimited(res, limit);

  try {
    const token = mediaTokenFromRequest(req);
    const payload = verifyMediaToken(token, getStudySessionSecret(process.env));
    if (payload.exp <= Date.now()) return res.status(410).json({ error: "Media link expired" });

    if (payload.access === "premium") {
      const user = await resolveMediaUser(req);
      if (!user?.entitlement?.active) return res.status(401).json({ error: "Active access required" });
    }

    const filePath = sourceAssetPath(payload.path);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Media not found" });

    res.setHeader("Content-Type", contentTypeForMedia(filePath));
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, max-age=300");
    return res.status(200).send(fs.readFileSync(filePath));
  } catch (error) {
    if (error?.code === "SERVER_ENV_INVALID" || error?.code === "STUDY_SESSION_SECRET_MISSING") {
      return sendSafeConfigError(res, error);
    }
    console.error("Protected media request failed", safeErrorSummary(error));
    return res.status(401).json({ error: "Media unavailable" });
  }
}

async function resolveMediaUser(req) {
  if (process.env.NODE_ENV === "test") {
    const email = String(req.headers?.["x-test-user-email"] || "").trim().toLowerCase();
    if (email) {
      return {
        email,
        entitlement: { active: String(req.headers?.["x-test-entitlement"] || "").toLowerCase() === "active" },
      };
    }
  }
  if (!hasCookie(req, SESSION_COOKIE)) return null;
  const env = getAuthServerEnv();
  return getSessionUser(req, env.databaseUrl);
}

function hasCookie(req, name) {
  const header = String(req.headers?.cookie || "");
  return header.split(";").map((part) => part.trim()).some((part) => part.startsWith(`${name}=`));
}

function mediaTokenFromRequest(req) {
  const url = new URL(req.url || "/", "http://localhost");
  const parts = url.pathname.split("/").filter(Boolean);
  return decodeURIComponent(parts[parts.length - 1] || "");
}
