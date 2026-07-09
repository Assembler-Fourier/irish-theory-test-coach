import aiExplain from "../server/api/ai-explain.js";
import attempts from "../server/api/attempts.js";
import consumeLoginLink from "../server/api/consume-login-link.js";
import createCheckoutSession from "../server/api/create-checkout-session.js";
import events from "../server/api/events.js";
import flags from "../server/api/flags.js";
import logout from "../server/api/logout.js";
import me from "../server/api/me.js";
import progress from "../server/api/progress.js";
import requestLoginLink from "../server/api/request-login-link.js";
import stripeWebhook from "../server/api/stripe-webhook.js";
import verifySession from "../server/api/verify-session.js";
import adminEntitlements from "../server/api/admin/entitlements.js";
import adminGenerateQuestions from "../server/api/admin/generate-questions.js";
import adminQuestions from "../server/api/admin/questions.js";
import adminStats from "../server/api/admin/stats.js";
import adminUsers from "../server/api/admin/users.js";

export const config = {
  api: {
    bodyParser: false,
  },
};

const routes = new Map([
  ["ai-explain", aiExplain],
  ["attempts", attempts],
  ["consume-login-link", consumeLoginLink],
  ["create-checkout-session", createCheckoutSession],
  ["events", events],
  ["flags", flags],
  ["logout", logout],
  ["me", me],
  ["progress", progress],
  ["request-login-link", requestLoginLink],
  ["stripe-webhook", stripeWebhook],
  ["verify-session", verifySession],
  ["admin/entitlements", adminEntitlements],
  ["admin/generate-questions", adminGenerateQuestions],
  ["admin/questions", adminQuestions],
  ["admin/stats", adminStats],
  ["admin/users", adminUsers],
]);

export default async function handler(req, res) {
  const route = normalizeRoute(req.query?.route, req.url);
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
