import crypto from "node:crypto";

const TOKEN_VERSION = 1;

export function getStudySessionSecret(env = process.env) {
  const configured = env.STUDY_SESSION_SECRET || "";
  const isProduction = env.NODE_ENV === "production" || env.VERCEL_ENV === "production";
  if (configured) return configured;
  if (isProduction) {
    const error = new Error("Study session signing secret is missing.");
    error.code = "STUDY_SESSION_SECRET_MISSING";
    throw error;
  }
  return "local-development-study-session-secret";
}

export function signSession(payload, secret) {
  return signPayload({ v: TOKEN_VERSION, t: "session", ...payload }, secret);
}

export function verifySessionToken(token, secret) {
  const payload = verifyPayload(token, secret);
  if (payload.t !== "session") throw invalidToken();
  return payload;
}

export function signAnswerState(payload, secret) {
  return signPayload({ v: TOKEN_VERSION, t: "answers", ...payload }, secret);
}

export function verifyAnswerStateToken(token, secret) {
  if (!token) return null;
  const payload = verifyPayload(token, secret);
  if (payload.t !== "answers") throw invalidToken();
  return payload;
}

export function signMediaToken(payload, secret) {
  return signPayload({ v: TOKEN_VERSION, t: "media", ...payload }, secret);
}

export function verifyMediaToken(token, secret) {
  const payload = verifyPayload(token, secret);
  if (payload.t !== "media") throw invalidToken();
  return payload;
}

export function sessionPublicId(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex").slice(0, 24);
}

function signPayload(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = hmac(body, secret);
  return `${body}.${signature}`;
}

function verifyPayload(token, secret) {
  const [body, signature] = String(token || "").split(".");
  if (!body || !signature || hmac(body, secret) !== signature) throw invalidToken();
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  if (payload.v !== TOKEN_VERSION) throw invalidToken();
  return payload;
}

function hmac(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function invalidToken() {
  const error = new Error("Invalid study session token.");
  error.code = "STUDY_SESSION_TOKEN_INVALID";
  return error;
}
