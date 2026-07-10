import { readJsonBody } from "../../lib/auth.js";
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
    const code = normalizeReferralCode(body.code);
    if (!code) {
      return res.status(400).json({ error: "Code could not be applied" });
    }

    if (body.email) {
      const grant = await grantReferralEntitlement(env.databaseUrl, code, body.email, {
        anonymousId: body.anonymousId,
      });
      return res.status(200).json({
        ok: true,
        code: grant.referral.code,
        grantEntitlement: true,
        message: "Code applied. Check restore access with the same email.",
      });
    }

    const referral = await lookupReferralCode(env.databaseUrl, code);
    if (!referral) {
      return res.status(404).json({ error: "Code could not be applied" });
    }

    return res.status(200).json({
      ok: true,
      code: referral.code,
      grantEntitlement: referral.grantEntitlement,
      fixedPricePlan: referral.fixedPricePlan,
      discountPercent: referral.discountPercent,
      description: referral.description,
    });
  } catch (error) {
    console.error("Referral code request failed", safeErrorSummary(error));
    return res.status(400).json({ error: "Code could not be applied" });
  }
}
