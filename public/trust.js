(function () {
  "use strict";

  const fallbackEmail = "support@irish-theory-test-coach.com";
  const email = window.APP_CONFIG?.supportEmail || fallbackEmail;

  document.querySelectorAll("[data-support-email]").forEach((element) => {
    element.textContent = email;
    if (element.tagName === "A") {
      element.setAttribute("href", `mailto:${email}`);
    }
  });
})();
