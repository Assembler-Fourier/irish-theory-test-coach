const form = document.getElementById("cancellationForm");
const printButton = document.getElementById("printCancellation");
const status = document.getElementById("cancellationStatus");

if (form) {
  const noticeDate = form.querySelector("#cancelNoticeDate");
  if (noticeDate && !noticeDate.value) noticeDate.value = new Date().toISOString().slice(0, 10);
  form.addEventListener("submit", prepareCancellationEmail);
}

printButton?.addEventListener("click", () => window.print());

function prepareCancellationEmail(event) {
  event.preventDefault();
  if (!form.reportValidity()) {
    setStatus("Complete the required fields before preparing the email.", true);
    return;
  }

  const values = Object.fromEntries(new FormData(form).entries());
  const refundEmail = validEmail(window.BUSINESS_CONFIG?.refundEmail)
    ? window.BUSINESS_CONFIG.refundEmail
    : "";
  if (!refundEmail) {
    setStatus("The refund email is not configured. Use the Contact page instead.", true);
    return;
  }

  const body = [
    "I give notice that I wish to cancel my contract for the following digital service:",
    "",
    `Plan or service: ${clean(values.plan, 120)}`,
    `Order or receipt reference: ${clean(values.reference, 120) || "Not supplied"}`,
    `Order date: ${clean(values.orderDate, 20)}`,
    `Name: ${clean(values.name, 120)}`,
    `Purchase email: ${clean(values.email, 254)}`,
    `Date of notice: ${clean(values.noticeDate, 20)}`,
  ].join("\n");

  setStatus("Your email app should open with the cancellation notice. Keep a copy after sending.");
  window.location.href = `mailto:${encodeURIComponent(refundEmail)}?subject=${encodeURIComponent("Cancellation notice - Irish Theory Test Coach")}&body=${encodeURIComponent(body)}`;
}

function setStatus(message, isError = false) {
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""));
}

function clean(value, maxLength) {
  return String(value || "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}
