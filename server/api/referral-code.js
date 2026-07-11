import { isValidEmail, readJsonBody } from "../../lib/auth.js";
import {
  lookupInstructorCode,
  redeemInstructorCode,
} from "../../lib/instructor-codes.js";
import { checkRateLimit, rateLimitKey, sendRateLimited } from "../../lib/rate-limit.js";
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
    const body = await readJsonBody(req);
    const limit = checkRateLimit({
      key: `${rateLimitKey(req, "code-redemption")}:${String(body.code || "").toUpperCase().slice(0, 24)}`,
      limit: 12,
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
      ipAddress: String(req.headers?.["x-forwarded-for"] || "").split(",")[0].trim(),
      userAgent: req.headers?.["user-agent"],
    });
    return { code: grant.code, type: "instructor_code" };
  } catch {
    return null;
  }
}
