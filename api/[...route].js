import aiExplain from "../server/api/ai-explain.js";
import account from "../server/api/account.js";
import accountExport from "../server/api/account-export.js";
import attempts from "../server/api/attempts.js";
import consumeLoginLink from "../server/api/consume-login-link.js";
import createCheckoutSession from "../server/api/create-checkout-session.js";
import deleteAccountRequest from "../server/api/delete-account-request.js";
import events from "../server/api/events.js";
import flags from "../server/api/flags.js";
import health from "../server/api/health.js";
import logout from "../server/api/logout.js";
import logoutAll from "../server/api/logout-all.js";
import me from "../server/api/me.js";
import opsReconcile from "../server/api/ops-reconcile.js";
import progress from "../server/api/progress.js";
import ready from "../server/api/ready.js";
import requestLoginLink from "../server/api/request-login-link.js";
import referralCode from "../server/api/referral-code.js";
import stripeWebhook from "../server/api/stripe-webhook.js";
import verifySession from "../server/api/verify-session.js";
import v1Media from "../server/api/v1-media.js";
import v1StudySessions from "../server/api/v1-study-sessions.js";
import questionFeedback from "../server/api/question-feedback.js";
import adminAudit from "../server/api/admin/audit.js";
import adminContentQuality from "../server/api/admin/content-quality.js";
import adminEntitlements from "../server/api/admin/entitlements.js";
import adminExport from "../server/api/admin/export.js";
import adminGenerateQuestions from "../server/api/admin/generate-questions.js";
import adminInstructors from "../server/api/admin/instructors.js";
import adminPayments from "../server/api/admin/payments.js";
import adminQuestions from "../server/api/admin/questions.js";
import adminReferrals from "../server/api/admin/referrals.js";
import adminStats from "../server/api/admin/stats.js";
import adminSupport from "../server/api/admin/support.js";
import adminUsers from "../server/api/admin/users.js";
import {
  applyApiSecurityHeaders,
  createRequestContext,
  logRequestFinished,
  rejectUnverifiedRequest,
  verifyStateChangingRequest,
} from "../lib/security.js";
import { checkRateLimit, limitFromEnv, rateLimitKey, sendRateLimited } from "../lib/rate-limit.js";
import { emitOperationalEvent } from "../lib/monitoring.js";

export const config = {
  api: {
    bodyParser: false,
  },
};

const routes = new Map([
  ["account", account],
  ["account-export", accountExport],
  ["ai-explain", aiExplain],
  ["attempts", attempts],
  ["consume-login-link", consumeLoginLink],
  ["create-checkout-session", createCheckoutSession],
  ["delete-account-request", deleteAccountRequest],
  ["events", events],
  ["flags", flags],
  ["health", health],
  ["logout", logout],
  ["logout-all", logoutAll],
  ["me", me],
  ["ops/reconcile", opsReconcile],
  ["ops-reconcile", opsReconcile],
  ["progress", progress],
  ["ready", ready],
  ["request-login-link", requestLoginLink],
  ["question-feedback", questionFeedback],
  ["referral-code", referralCode],
  ["stripe-webhook", stripeWebhook],
  ["verify-session", verifySession],
  ["admin/audit", adminAudit],
  ["admin-audit", adminAudit],
  ["admin/entitlements", adminEntitlements],
  ["admin-entitlements", adminEntitlements],
  ["admin/content-quality", adminContentQuality],
  ["admin-content-quality", adminContentQuality],
  ["admin/export", adminExport],
  ["admin-export", adminExport],
  ["admin/generate-questions", adminGenerateQuestions],
  ["admin-generate-questions", adminGenerateQuestions],
  ["admin/instructors", adminInstructors],
  ["admin-instructors", adminInstructors],
  ["admin/payments", adminPayments],
  ["admin-payments", adminPayments],
  ["admin/questions", adminQuestions],
  ["admin-questions", adminQuestions],
  ["admin/referrals", adminReferrals],
  ["admin-referrals", adminReferrals],
  ["admin/stats", adminStats],
  ["admin-stats", adminStats],
  ["admin/support", adminSupport],
  ["admin-support", adminSupport],
  ["admin/users", adminUsers],
  ["admin-users", adminUsers],
]);

export default async function handler(req, res) {
  const route = normalizeRoute(req.query?.dispatchRoute ?? req.query?.route, req.url);
  const context = createRequestContext(req, route);
  applyApiSecurityHeaders(res, { requestId: context.requestId });
  const originalEnd = res.end?.bind(res);
  let logged = false;
  if (originalEnd) {
    res.end = (...args) => {
      if (!logged) {
        logged = true;
        logRequestFinished(context, res);
      }
      return originalEnd(...args);
    };
  }

  try {
    if (requestBodyTooLarge(req)) {
      return res.status(413).json({ error: "Request body too large" });
    }

    if (isAdminRoute(route)) {
      const limit = checkRateLimit({
        key: rateLimitKey(req, "admin-api"),
        limit: limitFromEnv("RATE_LIMIT_ADMIN_API", 120),
        windowMs: 60_000,
      });
      if (!limit.allowed) {
        await emitOperationalEvent("rate_limit_triggered", "warning", {
          route,
          scope: "admin-api",
          requestId: context.requestId,
        }, {
          source: "rate_limit",
          correlationId: context.requestId,
        });
        return sendRateLimited(res, limit);
      }

      if (isStateChangingMethod(req.method)) {
        const origin = verifyStateChangingRequest(req, {
          publicSiteUrl: process.env.PUBLIC_SITE_URL || "http://localhost:5173",
          isProduction: process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production",
        });
        if (!origin.ok) return rejectUnverifiedRequest(res);
      }
    }

    if (route === "v1/study-sessions" || route.startsWith("v1/study-sessions/")) {
      return await v1StudySessions(req, res);
    }
    if (route === "v1/media" || route.startsWith("v1/media/")) {
      return await v1Media(req, res);
    }

    const routeHandler = routes.get(route);

    if (!routeHandler) {
      return res.status(404).json({ error: "API route not found" });
    }

    return await routeHandler(req, res);
  } catch (error) {
    if (!logged) {
      logged = true;
      res.statusCode = res.statusCode >= 400 ? res.statusCode : 500;
      logRequestFinished(context, res, error);
    }
    await emitOperationalEvent("api_error", "error", {
      route,
      statusCode: res.statusCode,
      errorCode: error?.code || error?.name || "api_error",
      requestId: context.requestId,
    }, {
      source: "api",
      correlationId: context.requestId,
    });
    throw error;
  } finally {
    if (!logged) {
      logged = true;
      logRequestFinished(context, res);
    }
  }
}

function normalizeRoute(queryRoute, requestUrl = "") {
  if (Array.isArray(queryRoute)) {
    return queryRoute.map(cleanSegment).filter(Boolean).join("/");
  }

  if (queryRoute) {
    return cleanSegment(queryRoute);
  }

  const url = new URL(requestUrl || "/", "http://localhost");
  return url.pathname.replace(/^\/api\/?/, "").split("/").map(cleanSegment).filter(Boolean).join("/");
}

function cleanSegment(value) {
  return String(value || "").replace(/^\/+|\/+$/g, "");
}

function isAdminRoute(route) {
  return route === "admin" || route.startsWith("admin/") || route.startsWith("admin-");
}

function isStateChangingMethod(method) {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(String(method || "").toUpperCase());
}

function requestBodyTooLarge(req) {
  const contentLength = Number.parseInt(String(req.headers?.["content-length"] || ""), 10);
  if (!Number.isFinite(contentLength) || contentLength <= 0) return false;
  const maxBytes = Number.parseInt(process.env.MAX_JSON_BODY_BYTES || "32768", 10);
  return contentLength > Math.max(1024, maxBytes);
}
