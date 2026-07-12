import {
  getRequiredServerEnv,
  safeErrorSummary,
} from "../lib/server-env.js";
import { emitOperationalEvent } from "../lib/monitoring.js";
import {
  handleStripeEvent,
  verifyAndParseStripeEvent,
} from "../server/api/stripe-webhook.js";

const responseHeaders = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};

export default {
  async fetch(request) {
    if (request.method !== "POST") {
      return jsonResponse(405, { error: "Method not allowed" }, { Allow: "POST" });
    }

    let env;
    try {
      env = getRequiredServerEnv({ requireStripeWebhookSecret: true });
    } catch {
      return jsonResponse(500, { error: "Service is not configured" });
    }

    let event;
    try {
      const rawBody = await request.text();
      event = verifyAndParseStripeEvent(
        rawBody,
        request.headers.get("stripe-signature"),
        env.stripeWebhookSecret,
      );
    } catch (error) {
      console.error("Stripe webhook signature verification failed", safeErrorSummary(error));
      await emitOperationalEvent("webhook_signature_failure", "warning", {
        provider: "stripe",
        errorCode: error?.code || error?.name || "invalid_signature",
      }, { source: "stripe_webhook" });
      return jsonResponse(400, { error: "Invalid webhook payload" });
    }

    try {
      const result = await handleStripeEvent(event, env);
      return jsonResponse(200, {
        received: true,
        handled: result.handled,
        recorded: result.recorded,
      });
    } catch (error) {
      console.error("Stripe webhook processing failed", safeErrorSummary(error));
      await emitOperationalEvent("webhook_processing_failure", "error", {
        provider: "stripe",
        eventType: event?.type || "",
        errorCode: error?.code || error?.name || "webhook_processing_failed",
      }, { source: "stripe_webhook" });
      return jsonResponse(500, { error: "Webhook processing failed" });
    }
  },
};

function jsonResponse(status, payload, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...responseHeaders, ...extraHeaders },
  });
}
