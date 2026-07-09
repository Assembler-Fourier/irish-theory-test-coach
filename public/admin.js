(function () {
  "use strict";

  const state = {
    locked: false,
    stats: null,
    selectedQuestion: null,
    sourceDocuments: [],
    generatedQuestions: [],
  };

  const els = {
    status: document.getElementById("adminStatus"),
    refreshBtn: document.getElementById("refreshBtn"),
    metricGrid: document.getElementById("metricGrid"),
    userSearchForm: document.getElementById("userSearchForm"),
    userSearchInput: document.getElementById("userSearchInput"),
    usersMount: document.getElementById("usersMount"),
    entitlementForm: document.getElementById("entitlementForm"),
    entitlementEmail: document.getElementById("entitlementEmail"),
    entitlementAction: document.getElementById("entitlementAction"),
    entitlementDays: document.getElementById("entitlementDays"),
    entitlementsMount: document.getElementById("entitlementsMount"),
    purchasesMount: document.getElementById("purchasesMount"),
    analyticsFunnelMount: document.getElementById("analyticsFunnelMount"),
    missedCategoriesMount: document.getElementById("missedCategoriesMount"),
    missedQuestionsMount: document.getElementById("missedQuestionsMount"),
    questionSearchForm: document.getElementById("questionSearchForm"),
    questionSearchInput: document.getElementById("questionSearchInput"),
    questionCategoryInput: document.getElementById("questionCategoryInput"),
    questionStatusInput: document.getElementById("questionStatusInput"),
    questionReviewInput: document.getElementById("questionReviewInput"),
    questionHighYieldInput: document.getElementById("questionHighYieldInput"),
    questionReviewForm: document.getElementById("questionReviewForm"),
    selectedQuestionLabel: document.getElementById("selectedQuestionLabel"),
    selectedQuestionStatus: document.getElementById("selectedQuestionStatus"),
    questionExplanationInput: document.getElementById("questionExplanationInput"),
    questionNotesInput: document.getElementById("questionNotesInput"),
    questionsMount: document.getElementById("questionsMount"),
    reloadAiDraftsBtn: document.getElementById("reloadAiDraftsBtn"),
    sourceNoteForm: document.getElementById("sourceNoteForm"),
    sourceTitleInput: document.getElementById("sourceTitleInput"),
    sourceTopicInput: document.getElementById("sourceTopicInput"),
    sourceCategoryInput: document.getElementById("sourceCategoryInput"),
    sourceBodyInput: document.getElementById("sourceBodyInput"),
    generateQuestionsForm: document.getElementById("generateQuestionsForm"),
    sourceDocumentSelect: document.getElementById("sourceDocumentSelect"),
    draftCountInput: document.getElementById("draftCountInput"),
    draftDifficultyInput: document.getElementById("draftDifficultyInput"),
    sourceDocumentsMount: document.getElementById("sourceDocumentsMount"),
    generatedDraftStatus: document.getElementById("generatedDraftStatus"),
    generatedQuestionsMount: document.getElementById("generatedQuestionsMount"),
    attemptSummaryMount: document.getElementById("attemptSummaryMount"),
    auditMount: document.getElementById("auditMount"),
  };

  init();

  function init() {
    bindEvents();
    refreshAll();
  }

  function bindEvents() {
    els.refreshBtn.addEventListener("click", refreshAll);
    els.userSearchForm.addEventListener("submit", (event) => {
      event.preventDefault();
      loadUsers();
    });
    els.questionSearchForm.addEventListener("submit", (event) => {
      event.preventDefault();
      loadQuestions();
    });
    els.reloadAiDraftsBtn.addEventListener("click", loadGeneratedPipeline);
    els.sourceNoteForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      await saveSourceNote();
    });
    els.generateQuestionsForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      await generateQuestionDrafts();
    });
    els.entitlementForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      await saveEntitlement();
    });
    els.questionReviewForm.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-review-action]");
      if (!button) return;
      await saveQuestionReview(button.dataset.reviewAction);
    });
  }

  async function refreshAll() {
    if (state.locked) return;
    setStatus("Loading admin dashboard...");
    try {
      await Promise.all([
        loadStats(),
        loadUsers(),
        loadEntitlements(),
        loadQuestions(),
        loadGeneratedPipeline(),
      ]);
      setStatus("Admin dashboard ready.");
    } catch (error) {
      handleError(error);
    }
  }

  async function loadStats() {
    const payload = await fetchJson("/api/admin/stats");
    state.stats = payload.stats;
    renderMetrics(payload.stats);
    renderPurchases(payload.stats.recentPurchases || []);
    renderAnalytics(payload.stats.analytics || {});
    renderAttemptSummary(payload.stats.attemptSummary || []);
    renderAudit(payload.stats.recentAudit || []);
  }

  async function loadUsers() {
    const q = encodeURIComponent(els.userSearchInput.value.trim());
    const payload = await fetchJson(`/api/admin/users?q=${q}`);
    renderUsers(payload.users || []);
  }

  async function loadEntitlements() {
    const q = encodeURIComponent(els.entitlementEmail.value.trim());
    const payload = await fetchJson(`/api/admin/entitlements?q=${q}`);
    renderEntitlements(payload.entitlements || []);
  }

  async function loadQuestions() {
    const params = new URLSearchParams();
    params.set("q", els.questionSearchInput.value.trim());
    params.set("category", els.questionCategoryInput.value.trim());
    params.set("status", els.questionStatusInput.value);
    params.set("review", els.questionReviewInput.value);
    if (els.questionHighYieldInput.checked) params.set("highYield", "1");
    const payload = await fetchJson(`/api/admin/questions?${params.toString()}`);
    renderQuestions(payload.questions || []);
  }

  async function loadGeneratedPipeline() {
    const payload = await fetchJson("/api/admin/generate-questions");
    state.sourceDocuments = payload.sourceDocuments || [];
    state.generatedQuestions = payload.generatedQuestions || [];
    renderSourceDocuments(state.sourceDocuments);
    renderGeneratedQuestions(state.generatedQuestions);
  }

  async function saveEntitlement() {
    setStatus("Saving entitlement...");
    try {
      const payload = await fetchJson("/api/admin/entitlements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: els.entitlementEmail.value.trim(),
          action: els.entitlementAction.value,
          days: Number(els.entitlementDays.value || 0),
        }),
      });
      setStatus(`Entitlement ${payload.entitlement.active ? "active" : "inactive"} for ${payload.entitlement.email}.`);
      await Promise.all([loadStats(), loadUsers(), loadEntitlements()]);
    } catch (error) {
      handleError(error);
    }
  }

  async function saveSourceNote() {
    setGeneratedDraftStatus("");
    setStatus("Saving source note...");
    try {
      const payload = await fetchJson("/api/admin/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_source_note",
          title: els.sourceTitleInput.value.trim(),
          topic: els.sourceTopicInput.value.trim(),
          category: els.sourceCategoryInput.value.trim(),
          body: els.sourceBodyInput.value.trim(),
        }),
      });
      els.sourceNoteForm.reset();
      await loadGeneratedPipeline();
      els.sourceDocumentSelect.value = payload.sourceDocument.id;
      setStatus(`Source note saved: ${payload.sourceDocument.title}.`);
    } catch (error) {
      handleError(error);
    }
  }

  async function generateQuestionDrafts() {
    const sourceDocumentId = els.sourceDocumentSelect.value;
    if (!sourceDocumentId) {
      setGeneratedDraftStatus("Save or choose an approved source note first.", "error");
      return;
    }

    setGeneratedDraftStatus("");
    setStatus("Generating draft questions...");
    try {
      const payload = await fetchJson("/api/admin/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          sourceDocumentId,
          count: Number(els.draftCountInput.value || 5),
          difficulty: els.draftDifficultyInput.value,
        }),
      });
      await loadGeneratedPipeline();
      const rejected = payload.rejectedDuplicates || [];
      const created = payload.generatedQuestions || [];
      setStatus(`Generated ${created.length} draft question${created.length === 1 ? "" : "s"}.`);
      if (rejected.length) {
        setGeneratedDraftStatus(`${rejected.length} near-duplicate candidate${rejected.length === 1 ? "" : "s"} rejected.`, "error");
      }
    } catch (error) {
      handleError(error);
    }
  }

  async function reviewGeneratedQuestion(questionId, reviewAction) {
    setGeneratedDraftStatus("");
    setStatus("Saving generated question review...");
    try {
      await fetchJson("/api/admin/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "review_generated_question",
          generatedQuestionId: questionId,
          reviewAction,
        }),
      });
      await Promise.all([loadStats(), loadGeneratedPipeline()]);
      setStatus(`Generated question ${reviewAction === "approve" ? "approved" : "rejected"}.`);
    } catch (error) {
      handleError(error);
    }
  }

  async function saveQuestionReview(action) {
    if (!state.selectedQuestion) return;

    setStatus("Saving question review...");
    try {
      const payload = await fetchJson("/api/admin/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: state.selectedQuestion.id,
          action,
          explanation: els.questionExplanationInput.value.trim(),
          notes: els.questionNotesInput.value.trim(),
        }),
      });
      state.selectedQuestion = payload.question;
      renderSelectedQuestion(payload.question);
      await Promise.all([loadStats(), loadQuestions()]);
      setStatus(`Question ${payload.question.id} marked ${payload.question.reviewedStatus}.`);
    } catch (error) {
      handleError(error);
    }
  }

  async function fetchJson(url, options = {}) {
    const response = await fetch(url, {
      credentials: "same-origin",
      cache: "no-store",
      ...options,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || "Admin request failed");
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function renderMetrics(stats) {
    const totals = stats.totals || {};
    const questions = stats.questions || {};
    const metrics = [
      ["Users", totals.users || 0],
      ["Admins", totals.admins || 0],
      ["Purchases", totals.purchases || 0],
      ["Active access", totals.active_entitlements || 0],
      ["Inactive access", totals.inactive_entitlements || 0],
      ["Attempts", totals.attempts || 0],
      ["Flags", totals.flags || 0],
      ["Analytics events", stats.analytics?.last30DaysEventCount || 0],
      ["Source notes", totals.source_documents || 0],
      ["Draft queue", totals.generated_question_drafts || 0],
      ["Questions", questions.total || 0],
      ["Needs review", questions.byReviewStatus?.needs_official_cross_check || 0],
      ["Generated drafts", questions.generatedDrafts || 0],
    ];

    els.metricGrid.innerHTML = "";
    metrics.forEach(([label, value]) => {
      const card = document.createElement("div");
      card.className = "metric-card";
      card.innerHTML = "<span></span><strong></strong>";
      card.querySelector("span").textContent = label;
      card.querySelector("strong").textContent = value;
      els.metricGrid.append(card);
    });
  }

  function renderUsers(users) {
    els.usersMount.innerHTML = "";
    if (!users.length) {
      renderEmpty(els.usersMount, "No users found.");
      return;
    }

    users.forEach((user) => {
      const item = document.createElement("article");
      item.className = "admin-item";
      item.innerHTML = `
        <div>
          <strong></strong>
          <span></span>
        </div>
        <dl></dl>
      `;
      item.querySelector("strong").textContent = user.email;
      item.querySelector("span").textContent = `${user.role} | ${entitlementLabel(user.entitlement)}`;
      item.querySelector("dl").append(
        detail("Purchases", user.purchaseCount),
        detail("Attempts", user.attemptCount),
        detail("Flags", user.flagCount),
        detail("Last login", formatDate(user.lastLoginAt))
      );
      item.addEventListener("click", () => {
        els.entitlementEmail.value = user.email;
        renderPurchases(user.purchases || []);
      });
      els.usersMount.append(item);
    });
  }

  function renderEntitlements(entitlements) {
    els.entitlementsMount.innerHTML = "";
    if (!entitlements.length) {
      renderEmpty(els.entitlementsMount, "No entitlements found.");
      return;
    }

    entitlements.slice(0, 12).forEach((entitlement) => {
      const item = document.createElement("article");
      item.className = "admin-item";
      item.innerHTML = `
        <div>
          <strong></strong>
          <span></span>
        </div>
        <dl></dl>
      `;
      item.querySelector("strong").textContent = entitlement.email;
      item.querySelector("span").textContent = entitlementLabel(entitlement);
      item.querySelector("dl").append(
        detail("Source", entitlement.source || "unknown"),
        detail("Expires", formatDate(entitlement.expiresAt)),
        detail("Revoked", formatDate(entitlement.revokedAt)),
        detail("Updated", formatDate(entitlement.updatedAt))
      );
      item.addEventListener("click", () => {
        els.entitlementEmail.value = entitlement.email;
      });
      els.entitlementsMount.append(item);
    });
  }

  function renderPurchases(purchases) {
    if (!purchases.length) {
      renderEmpty(els.purchasesMount, "No purchases found.");
      return;
    }

    els.purchasesMount.innerHTML = `
      <table class="admin-table">
        <thead>
          <tr>
            <th>Email</th>
            <th>Checkout session</th>
            <th>Payment intent</th>
            <th>Status</th>
            <th>Amount</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    `;
    const body = els.purchasesMount.querySelector("tbody");
    purchases.forEach((purchase) => {
      const row = document.createElement("tr");
      [
        purchase.email,
        purchase.stripe_checkout_session_id || purchase.checkoutSessionId || "",
        purchase.stripe_payment_intent_id || purchase.paymentIntentId || "",
        purchase.status,
        formatMoney(purchase.amount, purchase.currency),
        formatDate(purchase.created_at || purchase.createdAt),
      ].forEach((value) => {
        const cell = document.createElement("td");
        cell.textContent = value || "";
        row.append(cell);
      });
      body.append(row);
    });
  }

  function renderAnalytics(analytics) {
    renderFunnel(analytics.funnel || [], analytics.paywall || {});
    renderMissedCategories(analytics.missedCategories || []);
    renderMissedQuestions(analytics.missedQuestions || []);
  }

  function renderFunnel(funnel, paywall) {
    els.analyticsFunnelMount.innerHTML = "";
    if (!funnel.length) {
      renderEmpty(els.analyticsFunnelMount, "No analytics events yet.");
      return;
    }

    funnel.forEach((item) => {
      const row = document.createElement("article");
      row.className = "admin-item";
      row.innerHTML = "<div><strong></strong><span></span></div>";
      row.querySelector("strong").textContent = labelEvent(item.eventName);
      row.querySelector("span").textContent = `${item.events || 0} events | ${item.visitors || 0} anonymous visitors`;
      els.analyticsFunnelMount.append(row);
    });

    const paywallRow = document.createElement("article");
    paywallRow.className = "admin-item";
    paywallRow.innerHTML = "<div><strong></strong><span></span></div>";
    paywallRow.querySelector("strong").textContent = "Paywall to checkout";
    paywallRow.querySelector("span").textContent =
      `${paywall.checkoutClicks || 0}/${paywall.views || 0} clicks (${paywall.clickRate || 0}%)`;
    els.analyticsFunnelMount.append(paywallRow);
  }

  function renderMissedCategories(categories) {
    els.missedCategoriesMount.innerHTML = "";
    if (!categories.length) {
      renderEmpty(els.missedCategoriesMount, "No missed-category analytics yet.");
      return;
    }

    categories.forEach((item) => {
      const row = document.createElement("article");
      row.className = "admin-item";
      row.innerHTML = "<div><strong></strong><span></span></div>";
      row.querySelector("strong").textContent = item.category;
      row.querySelector("span").textContent = `${item.misses || 0} wrong answers`;
      els.missedCategoriesMount.append(row);
    });
  }

  function renderMissedQuestions(questions) {
    els.missedQuestionsMount.innerHTML = "";
    if (!questions.length) {
      renderEmpty(els.missedQuestionsMount, "No missed-question analytics yet.");
      return;
    }

    questions.forEach((item) => {
      const row = document.createElement("article");
      row.className = "admin-item";
      row.innerHTML = "<div><strong></strong><span></span></div>";
      row.querySelector("strong").textContent = `Question ${item.questionId}`;
      row.querySelector("span").textContent = `${item.misses || 0} wrong | ${item.category}`;
      els.missedQuestionsMount.append(row);
    });
  }

  function renderQuestions(questions) {
    if (!questions.length) {
      renderEmpty(els.questionsMount, "No questions found.");
      return;
    }

    els.questionsMount.innerHTML = `
      <table class="admin-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Status</th>
            <th>Review</th>
            <th>Category</th>
            <th>Question</th>
            <th>Score</th>
            <th>Media</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    `;
    const body = els.questionsMount.querySelector("tbody");
    questions.forEach((question) => {
      const row = document.createElement("tr");
      row.className = "admin-question-row";
      row.tabIndex = 0;
      [
        question.id,
        question.status,
        question.reviewedStatus,
        question.category,
        question.question,
        question.priorityScore || question.priorityLabel || "",
        question.hasImage ? "Image" : "",
      ].forEach((value) => {
        const cell = document.createElement("td");
        cell.textContent = String(value || "");
        row.append(cell);
      });
      row.addEventListener("click", () => selectQuestion(question));
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectQuestion(question);
        }
      });
      body.append(row);
    });
  }

  function renderSourceDocuments(sources) {
    els.sourceDocumentsMount.innerHTML = "";
    els.sourceDocumentSelect.innerHTML = "";

    const approved = sources.filter((source) => source.status === "approved");
    if (!approved.length) {
      els.sourceDocumentSelect.append(new Option("No approved source notes", ""));
      renderEmpty(els.sourceDocumentsMount, "No source notes saved.");
      return;
    }

    approved.forEach((source) => {
      els.sourceDocumentSelect.append(new Option(`${source.title} - ${source.category}`, source.id));
    });

    sources.slice(0, 8).forEach((source) => {
      const item = document.createElement("article");
      item.className = "admin-item";
      item.innerHTML = "<div><strong></strong><span></span></div><dl></dl>";
      item.querySelector("strong").textContent = source.title;
      item.querySelector("span").textContent = `${source.category} | ${source.topic || "No topic"} | ${source.status}`;
      item.querySelector("dl").append(
        detail("Created", formatDate(source.createdAt)),
        detail("Approved", formatDate(source.approvedAt))
      );
      item.addEventListener("click", () => {
        els.sourceDocumentSelect.value = source.id;
      });
      els.sourceDocumentsMount.append(item);
    });
  }

  function renderGeneratedQuestions(questions) {
    els.generatedQuestionsMount.innerHTML = "";
    if (!questions.length) {
      renderEmpty(els.generatedQuestionsMount, "No generated question drafts yet.");
      return;
    }

    questions.slice(0, 40).forEach((question) => {
      const item = document.createElement("article");
      item.className = "admin-item generated-question-card";

      const heading = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = question.questionText;
      const meta = document.createElement("span");
      meta.textContent =
        `${question.status} | ${question.category} | ${question.difficulty} | duplicate ${(question.duplicateScore * 100).toFixed(0)}%`;
      heading.append(title, meta);

      const options = document.createElement("ol");
      options.className = "generated-options";
      (question.options || []).forEach((option, index) => {
        const itemOption = document.createElement("li");
        itemOption.textContent = option.text || "";
        itemOption.classList.toggle("correct-option", index === question.correctIndex);
        options.append(itemOption);
      });

      const explanation = document.createElement("p");
      explanation.className = "generated-explanation";
      explanation.textContent = question.explanation || "";

      const tags = document.createElement("div");
      tags.className = "admin-tag-list";
      (question.highYieldTags || []).slice(0, 6).forEach((tag) => {
        const chip = document.createElement("span");
        chip.textContent = tag;
        tags.append(chip);
      });

      const actions = document.createElement("div");
      actions.className = "review-actions";
      if (question.status === "draft") {
        const reject = document.createElement("button");
        reject.type = "button";
        reject.textContent = "Reject";
        reject.addEventListener("click", () => reviewGeneratedQuestion(question.id, "reject"));

        const approve = document.createElement("button");
        approve.type = "button";
        approve.className = "primary";
        approve.textContent = "Approve";
        approve.addEventListener("click", () => reviewGeneratedQuestion(question.id, "approve"));

        actions.append(reject, approve);
      } else {
        const reviewed = document.createElement("span");
        reviewed.textContent = `${question.status} by ${question.reviewedByEmail || "admin"} | ${formatDate(question.reviewedAt)}`;
        actions.append(reviewed);
      }

      item.append(heading, options, explanation, tags, actions);
      els.generatedQuestionsMount.append(item);
    });
  }

  function selectQuestion(question) {
    state.selectedQuestion = question;
    renderSelectedQuestion(question);
  }

  function renderSelectedQuestion(question) {
    els.questionReviewForm.classList.remove("hidden");
    els.selectedQuestionLabel.textContent = `#${question.id} ${question.category}`;
    els.selectedQuestionStatus.textContent = `${question.reviewedStatus} | ${question.safeToShow ? "safe to show" : "hidden"}`;
    els.questionExplanationInput.value = question.explanation || "";
    els.questionNotesInput.value = question.notes || "";
  }

  function renderAttemptSummary(summary) {
    els.attemptSummaryMount.innerHTML = "";
    if (!summary.length) {
      renderEmpty(els.attemptSummaryMount, "No attempt summary yet.");
      return;
    }

    summary.forEach((item) => {
      const row = document.createElement("article");
      row.className = "admin-item";
      row.innerHTML = "<div><strong></strong><span></span></div>";
      row.querySelector("strong").textContent = item.category;
      row.querySelector("span").textContent =
        `${item.answered} answered | ${item.accuracy}% | ${item.missedCount} missed | ${item.flaggedCount} flagged`;
      els.attemptSummaryMount.append(row);
    });
  }

  function renderAudit(rows) {
    els.auditMount.innerHTML = "";
    if (!rows.length) {
      renderEmpty(els.auditMount, "No audit rows yet.");
      return;
    }

    rows.forEach((entry) => {
      const item = document.createElement("article");
      item.className = "admin-item";
      item.innerHTML = "<div><strong></strong><span></span></div>";
      item.querySelector("strong").textContent = entry.action;
      item.querySelector("span").textContent =
        `${entry.admin_email} -> ${entry.target_email || entry.target_id || entry.target_type} | ${formatDate(entry.created_at)}`;
      els.auditMount.append(item);
    });
  }

  function detail(label, value) {
    const wrap = document.createElement("div");
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    term.textContent = label;
    description.textContent = value || "None";
    wrap.append(term, description);
    return wrap;
  }

  function renderEmpty(mount, text) {
    mount.innerHTML = `<div class="empty-state"></div>`;
    mount.querySelector(".empty-state").textContent = text;
  }

  function handleError(error) {
    if (error.status === 401 || error.status === 403) {
      state.locked = true;
      setStatus(error.status === 401 ? "Log in before opening admin." : "Admin access required.");
      document.body.classList.add("admin-locked");
      return;
    }
    setStatus(error.message || "Admin request failed.");
  }

  function setStatus(message) {
    els.status.textContent = message;
  }

  function setGeneratedDraftStatus(message, tone) {
    els.generatedDraftStatus.textContent = message || "";
    els.generatedDraftStatus.classList.toggle("error", tone === "error");
    els.generatedDraftStatus.classList.toggle("success", tone === "success");
  }

  function entitlementLabel(entitlement) {
    if (!entitlement) return "No entitlement";
    if (entitlement.active) return "Active";
    if (entitlement.revokedAt) return "Revoked";
    if (entitlement.expiresAt && new Date(entitlement.expiresAt).getTime() <= Date.now()) return "Expired";
    return "Inactive";
  }

  function formatMoney(amount, currency) {
    if (!Number.isFinite(Number(amount))) return "";
    return `${(Number(amount) / 100).toFixed(2)} ${(currency || "eur").toUpperCase()}`;
  }

  function formatDate(value) {
    if (!value) return "None";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "None";
    return date.toLocaleString();
  }

  function labelEvent(eventName) {
    const labels = {
      page_view: "Page views",
      preview_started: "Preview started",
      paywall_viewed: "Paywall views",
      checkout_clicked: "Checkout clicks",
      checkout_success: "Checkout success",
      restore_access_clicked: "Restore access",
      mock_started: "Mocks started",
      mock_completed: "Mocks completed",
    };
    return labels[eventName] || String(eventName || "").replace(/_/g, " ");
  }
})();
