import { isValidEmail } from "../../lib/auth.js";
import {
  lookupInstructorCode,
  redeemInstructorCode,
} from "../../lib/instructor-codes.js";
import { checkRateLimit, compoundRateLimitKey, hashedClientIdentifier, limitFromEnv, sendRateLimited } from "../../lib/rate-limit.js";
import { readValidatedJson, fieldEmail, fieldString } from "../../lib/request-validation.js";
import { rejectUnverifiedRequest, verifyStateChangingRequest } from "../../lib/security.js";
import {
  grantReferralEntitlement,
  lookupReferralCode,
  normalizeReferralCode,
} from "../../lib/referrals.js";
import {
  getAuthServerEnv,
  safeErrorSummary,
  sendSafeConfigError,
} from "../../lib/server-env.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let env;
  try {
    env = getAuthServerEnv();
  } catch (error) {
    return sendSafeConfigError(res, error);
  }

  try {
    const origin = verifyStateChangingRequest(req, env);
    if (!origin.ok) {
      return rejectUnverifiedRequest(res);
    }

    const body = await readValidatedJson(req, {
      maxBytes: 4096,
      fields: {
        code: fieldString({ required: true, max: 80, pattern: /^[a-zA-Z0-9_-]{1,80}$/ }),
        email: fieldEmail(),
        anonymousId: fieldString({ max: 160, pattern: /^[a-zA-Z0-9:_-]{0,160}$/ }),
      },
    });
    const limit = checkRateLimit({
      key: compoundRateLimitKey(req, body.email ? "code-redemption" : "code-lookup", body.code),
      limit: body.email ? limitFromEnv("RATE_LIMIT_CODE_REDEMPTION", 8) : limitFromEnv("RATE_LIMIT_CODE_LOOKUP", 20),
      windowMs: 10 * 60 * 1000,
    });
    if (!limit.allowed) {
      return sendRateLimited(res, limit);
    }

    const code = normalizeReferralCode(body.code);
    if (!code) {
      return res.status(400).json({ error: "Code could not be applied" });
    }

    if (body.email && isValidEmail(body.email)) {
      const grant = await tryGrantCode(env, body, req);
      if (!grant) {
        return res.status(400).json({ error: "Code could not be applied" });
      }
      return res.status(200).json({
        ok: true,
        code: grant.code,
        grantEntitlement: true,
        message: "Code applied. Check restore access with the same email.",
      });
    }

    const referral = await lookupReferralCode(env.databaseUrl, code);
    if (referral) {
      return res.status(200).json({
        ok: true,
        code: referral.code,
        grantEntitlement: referral.grantEntitlement,
        fixedPricePlan: referral.fixedPricePlan,
        discountPercent: referral.discountPercent,
        description: referral.description,
      });
    }

    const instructorCode = await lookupInstructorCode(env.databaseUrl, body.code);
    if (!instructorCode) {
      return res.status(404).json({ error: "Code could not be applied" });
    }

    return res.status(200).json({
      ok: true,
      code: instructorCode.code,
      grantEntitlement: true,
      description: "Instructor access code",
    });
  } catch (error) {
    console.error("Referral code request failed", safeErrorSummary(error));
    return res.status(400).json({ error: "Code could not be applied" });
  }
}

async function tryGrantCode(env, body, req) {
  try {
    const referralGrant = await grantReferralEntitlement(env.databaseUrl, body.code, body.email, {
      anonymousId: body.anonymousId,
    });
    return { code: referralGrant.referral.code, type: "referral" };
  } catch {
    // Continue to instructor-code redemption with the same generic public response.
  }

  try {
    const grant = await redeemInstructorCode(env.databaseUrl, body.code, body.email, {
      anonymousId: body.anonymousId,
      ipAddress: `client_${hashedClientIdentifier(req)}`,
      userAgent: req.headers?.["user-agent"],
    });
    return { code: grant.code, type: "instructor_code" };
  } catch {
    return null;
  }
}
