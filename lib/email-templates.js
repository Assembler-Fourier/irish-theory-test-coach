const PRODUCT_NAME = "Irish Theory Test Coach";
const DISCLAIMER = "Independent practice tool. Not affiliated with RSA or Prometric.";

export const EMAIL_TEMPLATE_KEYS = [
  "login_link",
  "purchase_confirmation",
  "access_restored",
  "access_expiry_reminder",
  "instructor_code_redemption",
  "refund_confirmation",
  "support_acknowledgement",
];

export function renderTransactionalEmail(templateKey, data = {}) {
  switch (templateKey) {
    case "login_link":
      return baseEmail({
        subject: "Your Irish Theory Test Coach access link",
        heading: "Your secure access link",
        intro: "Use this one-time link to sign in and restore your learner account.",
        lines: [
          data.link || "",
          "This link expires in 15 minutes and can only be used once.",
          "If you did not request this email, you can ignore it.",
        ],
      });
    case "purchase_confirmation":
      return baseEmail({
        subject: "Your Irish Theory Test Coach purchase",
        heading: "Your study access is ready",
        intro: "Thanks for purchasing learner access.",
        lines: [
          `Plan: ${data.planLabel || "Full Study Pass"}`,
          `Access: ${data.accessDuration || "90-day access"}`,
          "Open the learner app and use restore access if you switch browsers or devices.",
        ],
      });
    case "access_restored":
      return baseEmail({
        subject: "Irish Theory Test Coach access restored",
        heading: "Access restored",
        intro: "Your learner account was signed in with a secure email link.",
        lines: ["If this was not you, contact support so sessions can be reviewed."],
      });
    case "access_expiry_reminder":
      return baseEmail({
        subject: "Irish Theory Test Coach access reminder",
        heading: "Access reminder",
        intro: "Your learner access is nearing its end.",
        lines: [
          "Expiry reminders must not be sent until notification preference and legal basis are defined.",
          "This template is present for future implementation only.",
        ],
      });
    case "instructor_code_redemption":
      return baseEmail({
        subject: "Irish Theory Test Coach code redeemed",
        heading: "Instructor code redeemed",
        intro: "A learner access code was applied to your account.",
        lines: [
          `Code: ${data.code || "configured code"}`,
          "Use the learner app to continue practice and restore access by email on another device.",
        ],
      });
    case "refund_confirmation":
      return baseEmail({
        subject: "Irish Theory Test Coach refund confirmation",
        heading: "Refund confirmation",
        intro: "A refund has been recorded for your purchase.",
        lines: ["Access may be adjusted according to the refund outcome. Contact support with any questions."],
      });
    case "support_acknowledgement":
      return baseEmail({
        subject: "Irish Theory Test Coach support request received",
        heading: "Support request received",
        intro: "Thanks for contacting support.",
        lines: ["We will review your request and reply to the email address you provided."],
      });
    default:
      throw new Error(`Unknown transactional email template: ${templateKey}`);
  }
}

function baseEmail({ subject, heading, intro, lines }) {
  const safeLines = (lines || []).filter(Boolean);
  return {
    subject,
    text: [
      heading,
      "",
      intro,
      "",
      ...safeLines,
      "",
      DISCLAIMER,
      PRODUCT_NAME,
    ].join("\n"),
    html: [
      '<div style="font-family:Arial,sans-serif;line-height:1.5;color:#17212b;max-width:620px">',
      `<p style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#1f4f46">${PRODUCT_NAME}</p>`,
      `<h1 style="font-size:24px;margin:0 0 12px">${escapeHtml(heading)}</h1>`,
      `<p>${escapeHtml(intro)}</p>`,
      ...safeLines.map((line) => `<p>${linkify(escapeHtml(line))}</p>`),
      `<p style="font-size:13px;color:#52606a">${DISCLAIMER}</p>`,
      "</div>",
    ].join(""),
  };
}

function linkify(value) {
  if (/^https?:\/\//.test(value)) {
    return `<a href="${value}">${value}</a>`;
  }
  return value;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
