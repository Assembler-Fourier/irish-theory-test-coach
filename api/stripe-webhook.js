import crypto from "node:crypto";
import {
  getRequiredServerEnv,
  safeErrorSummary,
  sendSafeConfigError,
} from "../lib/server-env.js";
import {
  getCheckoutSessionEmail,
  isPaidCheckoutSession,
  recordStripeCheckoutSession,
} from "../lib/stripe-entitlements.js";

const SIGNATURE_TOLERANCE_SECONDS = 300;

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let env;
  try {
    env = getRequiredServerEnv({ requireStripeWebhookSecret: true });
  } catch (error) {
    return sendSafeConfigError(res, error);
  }

  let event;
  try {
    const rawBody = await readRawBody(req);
    event = verifyAndParseStripeEvent(rawBody, req.headers["stripe-signature"], env.stripeWebhookSecret);
  } catch (error) {
    console.error("Stripe webhook signature verification failed", safeErrorSummary(error));
    return res.status(400).json({ error: "Invalid webhook payload" });
  }

  try {
    const result = await handleStripeEvent(event, env);
    return res.status(200).json({
      received: true,
      handled: result.handled,
      recorded: result.recorded,
    });
  } catch (error) {
    console.error("Stripe webhook processing failed", safeErrorSummary(error));
    return res.status(500).json({ error: "Webhook processing failed" });
  }
}

export async function handleStripeEvent(event, env, options = {}) {
  if (event?.type !== "checkout.session.completed") {
    return { handled: false, recorded: false };
  }

  const session = event?.data?.object;
  if (!isPaidCheckoutSession(session)) {
    return { handled: true, recorded: false };
  }

  if (!getCheckoutSessionEmail(session)) {
    console.error("Stripe checkout session is missing an email address.");
    return { handled: true, recorded: false };
  }

  const recordCheckoutSession = options.recordCheckoutSession || recordStripeCheckoutSession;
  const recorded = await recordCheckoutSession(session, env.databaseUrl);
  if (!recorded) {
    throw new Error("Stripe entitlement recording failed.");
  }

  return { handled: true, recorded };
}

export function verifyAndParseStripeEvent(rawBody, signatureHeader, webhookSecret) {
  verifyStripeSignature(rawBody, signatureHeader, webhookSecret);
  return JSON.parse(rawBody);
}

export function verifyStripeSignature(rawBody, signatureHeader, webhookSecret) {
  if (!signatureHeader || !webhookSecret) {
    throw new Error("Missing Stripe webhook signature.");
  }

  const parsed = parseStripeSignatureHeader(signatureHeader);
  const timestamp = Number(parsed.t?.[0]);
  const signatures = parsed.v1 || [];

  if (!Number.isFinite(timestamp) || signatures.length === 0) {
    throw new Error("Malformed Stripe webhook signature.");
  }

  const age = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
  if (age > SIGNATURE_TOLERANCE_SECONDS) {
    throw new Error("Expired Stripe webhook signature.");
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = crypto
    .createHmac("sha256", webhookSecret)
    .update(signedPayload, "utf8")
    .digest("hex");

  const valid = signatures.some((signature) => timingSafeEqualHex(signature, expected));
  if (!valid) {
    throw new Error("Invalid Stripe webhook signature.");
  }
}

async function readRawBody(req) {
  if (typeof req.body === "string") return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
  if (req.body && typeof req.body === "object") return JSON.stringify(req.body);

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function parseStripeSignatureHeader(header) {
  return String(header)
    .split(",")
    .map((part) => part.split("="))
    .reduce((result, [key, value]) => {
      if (!key || !value) return result;
      const name = key.trim();
      result[name] ||= [];
      result[name].push(value.trim());
      return result;
    }, {});
}

function timingSafeEqualHex(left, right) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}
