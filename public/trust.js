(function () {
  "use strict";

  const business = window.BUSINESS_CONFIG || {};
  const appConfig = window.APP_CONFIG || {};
  const fallbackEmail = appConfig.supportEmail || business.supportEmail || "support@example.invalid";
  const emailMap = {
    support: appConfig.supportEmail || business.supportEmail || fallbackEmail,
    privacy: appConfig.privacyEmail || business.privacyEmail || fallbackEmail,
    refund: appConfig.refundEmail || business.refundEmail || fallbackEmail,
    security: appConfig.securityEmail || business.securityEmail || fallbackEmail,
  };

  document.querySelectorAll("[data-support-email]").forEach((element) => {
    applyEmail(element, emailMap.support);
  });

  document.querySelectorAll("[data-privacy-email]").forEach((element) => {
    applyEmail(element, emailMap.privacy);
  });

  document.querySelectorAll("[data-refund-email]").forEach((element) => {
    applyEmail(element, emailMap.refund);
  });

  document.querySelectorAll("[data-security-email]").forEach((element) => {
    applyEmail(element, emailMap.security);
  });

  document.querySelectorAll("[data-business-value]").forEach((element) => {
    const key = element.getAttribute("data-business-value");
    const value = getPath(business, key) || getPath(appConfig, key) || "";
    if (value) element.textContent = value;
  });

  function applyEmail(element, email) {
    element.textContent = email;
    if (element.tagName === "A") {
      element.setAttribute("href", `mailto:${email}`);
    }
  }

  function getPath(source, path) {
    return String(path || "")
      .split(".")
      .filter(Boolean)
      .reduce((value, key) => (value && Object.prototype.hasOwnProperty.call(value, key) ? value[key] : ""), source);
  }
})();
