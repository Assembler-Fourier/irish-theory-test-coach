const els = {
  app: document.getElementById("accountApp"),
  statusCard: document.getElementById("accountStatusCard"),
  restoreForm: document.getElementById("accountRestoreForm"),
  restoreEmail: document.getElementById("accountRestoreEmail"),
  restoreBtn: document.getElementById("accountRestoreBtn"),
  restoreStatus: document.getElementById("accountRestoreStatus"),
  summaryPanel: document.querySelector(".account-summary-panel"),
  progressPanel: document.querySelector(".account-progress-panel"),
  mocksPanel: document.querySelector(".account-mocks-panel"),
  actionsPanel: document.querySelector(".account-actions-panel"),
  accessBadge: document.getElementById("accountAccessBadge"),
  email: document.getElementById("accountEmail"),
  plan: document.getElementById("accountPlan"),
  purchaseDate: document.getElementById("accountPurchaseDate"),
  expiry: document.getElementById("accountExpiry"),
  remaining: document.getElementById("accountRemaining"),
  productVersion: document.getElementById("accountProductVersion"),
  contentVersion: document.getElementById("accountContentVersion"),
  restoreSummary: document.getElementById("accountRestoreSummary"),
  expiredNotice: document.getElementById("accountExpiredNotice"),
  syncState: document.getElementById("accountSyncState"),
  answered: document.getElementById("accountAnswered"),
  accuracy: document.getElementById("accountAccuracy"),
  missed: document.getElementById("accountMissed"),
  flags: document.getElementById("accountFlags"),
  streak: document.getElementById("accountStreak"),
  dailyTarget: document.getElementById("accountDailyTarget"),
  categoryList: document.getElementById("accountCategoryList"),
  mockList: document.getElementById("accountMockList"),
  logoutBtn: document.getElementById("accountLogoutBtn"),
  logoutAllBtn: document.getElementById("accountLogoutAllBtn"),
  exportBtn: document.getElementById("accountExportBtn"),
  supportLink: document.getElementById("accountSupportLink"),
  deleteForm: document.getElementById("accountDeleteForm"),
  deleteReason: document.getElementById("accountDeleteReason"),
  deleteBtn: document.getElementById("accountDeleteBtn"),
  actionStatus: document.getElementById("accountActionStatus"),
};

init();

async function init() {
  bindEvents();
  applySupportEmail();
  await consumeLoginReturn();
  await loadAccount();
}

function bindEvents() {
  els.restoreForm?.addEventListener("submit", requestLoginLink);
  els.restoreEmail?.addEventListener("input", () => {
    els.restoreEmail.setCustomValidity("");
    setRestoreMessage("Links expire soon and can only be used once.");
  });
  els.logoutBtn?.addEventListener("click", () => logout("/api/logout", "Logged out on this browser."));
  els.logoutAllBtn?.addEventListener("click", () => logout("/api/logout-all", "Logged out on all devices."));
  els.exportBtn?.addEventListener("click", exportAccountData);
  els.deleteForm?.addEventListener("submit", requestDeletion);
}

async function consumeLoginReturn() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("login_token");
  if (!token) return;

  setPageState("loading");
  setStatusCard("Restoring access...", "Checking your one-time link.");
  try {
    const payload = await jsonRequest("/api/consume-login-link", {
      method: "POST",
      body: { token },
    });
    removeUrlParams(["login_token"]);
    setRestoreMessage(payload.entitlement?.active ? "Access restored. Full study access is active." : "Signed in. Your account details are below.");
  } catch (error) {
    removeUrlParams(["login_token"]);
    if (error.payload?.code === "expired_link") {
      setRestoreMessage("That link has expired. Enter your email to request a fresh secure link.", "error");
      setStatusCard("Link expired", "Request a new secure link below.");
    } else if (error.payload?.code === "used_link") {
      setRestoreMessage("That link has already been used. Request a new secure link if you need to sign in again.", "error");
      setStatusCard("Link already used", "Use the restore form to send a new one-time link.");
    } else {
      setRestoreMessage("That link could not be verified. Request a new secure link.", "error");
      setStatusCard("Link could not be verified", "Use the restore form to continue.");
    }
  }
}

async function loadAccount() {
  setPageState("loading");
  try {
    const account = await jsonRequest("/api/account", { method: "GET" });
    if (!account.authenticated) {
      renderSignedOut();
      return;
    }
    renderAccount(account);
  } catch {
    setPageState("error");
    setStatusCard("Account unavailable", "Refresh or contact support if this keeps happening.");
  }
}

function renderSignedOut() {
  setPageState("signed-out");
  hideSignedInPanels();
  setStatusCard("Sign in by email", "Enter the checkout email to receive a one-time access link.");
}

function renderAccount(account) {
  setPageState("signed-in");
  [els.summaryPanel, els.progressPanel, els.mocksPanel, els.actionsPanel].forEach((panel) => {
    if (panel) panel.hidden = false;
  });

  const access = account.access || {};
  els.accessBadge.textContent = access.label || "Account";
  els.accessBadge.dataset.status = access.status || "none";
  els.email.textContent = account.maskedEmail || "Signed in";
  els.plan.textContent = account.plan?.name || "No paid plan";
  els.purchaseDate.textContent = formatDate(account.purchase?.purchasedAt);
  els.expiry.textContent = access.expiresAt ? formatDate(access.expiresAt) : "No expiry recorded";
  els.remaining.textContent = access.active ? `${access.remainingDays} day${access.remainingDays === 1 ? "" : "s"}` : "0 days";
  els.productVersion.textContent = account.product?.productVersion || "-";
  els.contentVersion.textContent = account.product?.contentVersion || "-";
  els.restoreSummary.textContent = account.restoreStatus?.label || "No restore link requested yet";
  els.expiredNotice.hidden = access.status !== "expired";

  const progress = account.progress || {};
  els.answered.textContent = number(progress.answered);
  els.accuracy.textContent = `${number(progress.accuracy)}%`;
  els.missed.textContent = number(progress.missedCount);
  els.flags.textContent = number(progress.flaggedCount);
  els.streak.textContent = number(progress.studyStreak?.current);
  els.dailyTarget.textContent = `${number(progress.dailyTarget?.today)}/${number(progress.dailyTarget?.target || 25)}`;
  els.syncState.textContent = "Server saved";
  renderCategories(progress.categoryAccuracy || []);
  renderMocks(account.recentMockResults || []);

  setStatusCard(
    access.active ? "Access active" : access.status === "expired" ? "Access expired" : "Signed in",
    access.active
      ? `${account.plan?.name || "Full Study Pass"} is available on this account.`
      : "Your progress is preserved. Premium content requires active access."
  );
}

function hideSignedInPanels() {
  [els.summaryPanel, els.progressPanel, els.mocksPanel, els.actionsPanel].forEach((panel) => {
    if (panel) panel.hidden = true;
  });
}

function renderCategories(categories) {
  els.categoryList.innerHTML = "";
  const meaningful = categories.filter((category) => category.answered || category.missedCount || category.flaggedCount).slice(0, 5);
  if (!meaningful.length) {
    els.categoryList.textContent = "Answer questions in the learner app to build a server-saved category summary.";
    els.categoryList.classList.add("account-empty-state");
    return;
  }
  els.categoryList.classList.remove("account-empty-state");
  meaningful.forEach((category) => {
    const row = document.createElement("div");
    row.className = "account-list-row";
    row.innerHTML = "<strong></strong><span></span>";
    row.querySelector("strong").textContent = category.category || "Uncategorised";
    row.querySelector("span").textContent = `${number(category.answered)} answered | ${number(category.accuracy)}% accuracy | ${number(category.missedCount)} missed`;
    els.categoryList.append(row);
  });
}

function renderMocks(results) {
  els.mockList.innerHTML = "";
  if (!results.length) {
    els.mockList.textContent = "No server-saved mock results yet.";
    els.mockList.classList.add("account-empty-state");
    return;
  }
  els.mockList.classList.remove("account-empty-state");
  results.forEach((result) => {
    const row = document.createElement("div");
    row.className = "account-list-row";
    row.innerHTML = "<strong></strong><span></span>";
    row.querySelector("strong").textContent = `${number(result.score)}/${number(result.total)}${result.passed ? " passed" : ""}`;
    row.querySelector("span").textContent = `${formatDate(result.completedAt)} | ${number(result.answered)} answered`;
    els.mockList.append(row);
  });
}

async function requestLoginLink(event) {
  event.preventDefault();
  const email = els.restoreEmail.value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.toLowerCase())) {
    els.restoreEmail.setCustomValidity("Enter a valid email address.");
    els.restoreEmail.reportValidity();
    setRestoreMessage("Enter a valid email address.", "error");
    return;
  }

  els.restoreBtn.disabled = true;
  els.restoreBtn.setAttribute("aria-busy", "true");
  els.restoreBtn.textContent = "Sending...";
  setRestoreMessage("Checking the email and preparing a one-time link.");
  try {
    await jsonRequest("/api/request-login-link", {
      method: "POST",
      body: { email },
    });
    setRestoreMessage("Check your inbox. The link expires soon for security.", "success");
  } catch (error) {
    if (error.status === 429) {
      setRestoreMessage("Too many attempts. Wait a little, then try again.", "error");
    } else {
      setRestoreMessage("We could not send the link right now. Contact support if it keeps happening.", "error");
    }
  } finally {
    els.restoreBtn.disabled = false;
    els.restoreBtn.removeAttribute("aria-busy");
    els.restoreBtn.textContent = "Send secure link";
  }
}

async function logout(url, message) {
  setActionStatus("Logging out...");
  try {
    await jsonRequest(url, { method: "POST" });
  } catch {
    // Local display still moves to signed-out after the cookie-clearing attempt.
  }
  setActionStatus(message);
  renderSignedOut();
}

async function exportAccountData() {
  els.exportBtn.disabled = true;
  setActionStatus("Preparing data export...");
  try {
    const response = await fetch("/api/account-export", { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) throw new Error("export_failed");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "irish-theory-test-coach-data.json";
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setActionStatus("Data export downloaded.");
  } catch {
    setActionStatus("Could not export data right now. Try again or contact support.", "error");
  } finally {
    els.exportBtn.disabled = false;
  }
}

async function requestDeletion(event) {
  event.preventDefault();
  els.deleteBtn.disabled = true;
  setActionStatus("Submitting deletion request...");
  try {
    await jsonRequest("/api/delete-account-request", {
      method: "POST",
      body: { reason: els.deleteReason.value },
    });
    setActionStatus("Deletion request saved. Support will review it before any destructive action.");
  } catch {
    setActionStatus("Could not save the deletion request. Contact support if it keeps happening.", "error");
  } finally {
    els.deleteBtn.disabled = false;
  }
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    credentials: "same-origin",
    cache: options.method === "GET" ? "no-store" : undefined,
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || "Request failed");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function setPageState(state) {
  if (els.app) els.app.dataset.accountState = state;
}

function setStatusCard(title, copy) {
  if (!els.statusCard) return;
  els.statusCard.innerHTML = "<strong></strong><p></p>";
  els.statusCard.querySelector("strong").textContent = title;
  els.statusCard.querySelector("p").textContent = copy;
}

function setRestoreMessage(message, type = "info") {
  if (!els.restoreStatus) return;
  els.restoreStatus.textContent = message;
  els.restoreStatus.dataset.status = type;
}

function setActionStatus(message, type = "info") {
  if (!els.actionStatus) return;
  els.actionStatus.textContent = message;
  els.actionStatus.dataset.status = type;
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-IE", { dateStyle: "medium" }).format(date);
}

function number(value) {
  return new Intl.NumberFormat("en-IE").format(Number(value || 0));
}

function removeUrlParams(names) {
  const url = new URL(window.location.href);
  names.forEach((name) => url.searchParams.delete(name));
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function applySupportEmail() {
  const email = window.APP_CONFIG?.supportEmail || "support@irish-theory-test-coach.com";
  if (els.supportLink) {
    els.supportLink.href = `mailto:${email}`;
    els.supportLink.textContent = "Contact support";
  }
}
