import aiExplain from "../server/api/ai-explain.js";
import account from "../server/api/account.js";
import accountExport from "../server/api/account-export.js";
import attempts from "../server/api/attempts.js";
import consumeLoginLink from "../server/api/consume-login-link.js";
import createCheckoutSession from "../server/api/create-checkout-session.js";
import deleteAccountRequest from "../server/api/delete-account-request.js";
import events from "../server/api/events.js";
import flags from "../server/api/flags.js";
import logout from "../server/api/logout.js";
import logoutAll from "../server/api/logout-all.js";
import me from "../server/api/me.js";
import progress from "../server/api/progress.js";
import requestLoginLink from "../server/api/request-login-link.js";
import referralCode from "../server/api/referral-code.js";
import stripeWebhook from "../server/api/stripe-webhook.js";
import verifySession from "../server/api/verify-session.js";
import v1Media from "../server/api/v1-media.js";
import v1StudySessions from "../server/api/v1-study-sessions.js";
import questionFeedback from "../server/api/question-feedback.js";
import adminContentQuality from "../server/api/admin/content-quality.js";
import adminEntitlements from "../server/api/admin/entitlements.js";
import adminExport from "../server/api/admin/export.js";
import adminGenerateQuestions from "../server/api/admin/generate-questions.js";
import adminPayments from "../server/api/admin/payments.js";
import adminQuestions from "../server/api/admin/questions.js";
import adminReferrals from "../server/api/admin/referrals.js";
import adminStats from "../server/api/admin/stats.js";
import adminUsers from "../server/api/admin/users.js";

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
  ["logout", logout],
  ["logout-all", logoutAll],
  ["me", me],
  ["progress", progress],
  ["request-login-link", requestLoginLink],
  ["question-feedback", questionFeedback],
  ["referral-code", referralCode],
  ["stripe-webhook", stripeWebhook],
  ["verify-session", verifySession],
  ["admin/entitlements", adminEntitlements],
  ["admin-entitlements", adminEntitlements],
  ["admin/content-quality", adminContentQuality],
  ["admin-content-quality", adminContentQuality],
  ["admin/export", adminExport],
  ["admin-export", adminExport],
  ["admin/generate-questions", adminGenerateQuestions],
  ["admin-generate-questions", adminGenerateQuestions],
  ["admin/payments", adminPayments],
  ["admin-payments", adminPayments],
  ["admin/questions", adminQuestions],
  ["admin-questions", adminQuestions],
  ["admin/referrals", adminReferrals],
  ["admin-referrals", adminReferrals],
  ["admin/stats", adminStats],
  ["admin-stats", adminStats],
  ["admin/users", adminUsers],
  ["admin-users", adminUsers],
]);

export default async function handler(req, res) {
  const route = normalizeRoute(req.query?.route, req.url);
  if (route === "v1/study-sessions" || route.startsWith("v1/study-sessions/")) {
    return v1StudySessions(req, res);
  }
  if (route === "v1/media" || route.startsWith("v1/media/")) {
    return v1Media(req, res);
  }

  const routeHandler = routes.get(route);

  if (!routeHandler) {
    return res.status(404).json({ error: "API route not found" });
  }

  return routeHandler(req, res);
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
