(function () {
  "use strict";

  const state = {
    locked: false,
    stats: null,
    payments: null,
    selectedQuestion: null,
    sourceDocuments: [],
    generatedQuestions: [],
    contentQuality: null,
  };

  const els = {
    status: document.getElementById("adminStatus"),
    protectedState: document.getElementById("adminProtectedState"),
    protectedCopy: document.getElementById("adminProtectedCopy"),
    refreshBtn: document.getElementById("refreshBtn"),
    metricGrid: document.getElementById("metricGrid"),
    launchReadinessMount: document.getElementById("launchReadinessMount"),
    userSearchForm: document.getElementById("userSearchForm"),
    userSearchInput: document.getElementById("userSearchInput"),
    usersMount: document.getElementById("usersMount"),
    entitlementForm: document.getElementById("entitlementForm"),
    entitlementEmail: document.getElementById("entitlementEmail"),
    entitlementAction: document.getElementById("entitlementAction"),
    entitlementDays: document.getElementById("entitlementDays"),
    entitlementSubmitBtn: document.getElementById("entitlementSubmitBtn"),
    entitlementsMount: document.getElementById("entitlementsMount"),
    purchasesMount: document.getElementById("purchasesMount"),
    checkoutAttemptsMount: document.getElementById("checkoutAttemptsMount"),
    stripeEventsMount: document.getElementById("stripeEventsMount"),
    instructorCodesMount: document.getElementById("instructorCodesMount"),
    revenueMount: document.getElementById("revenueMount"),
    planSalesMount: document.getElementById("planSalesMount"),
    referralPerformanceMount: document.getElementById("referralPerformanceMount"),
    referralCodeForm: document.getElementById("referralCodeForm"),
    referralCodeInput: document.getElementById("referralCodeInput"),
    referralDescriptionInput: document.getElementById("referralDescriptionInput"),
    referralPlanInput: document.getElementById("referralPlanInput"),
    referralMaxInput: document.getElementById("referralMaxInput"),
    referralDaysInput: document.getElementById("referralDaysInput"),
    referralGrantInput: document.getElementById("referralGrantInput"),
    referralsMount: document.getElementById("referralsMount"),
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
    reloadContentQualityBtn: document.getElementById("reloadContentQualityBtn"),
    contentQualitySummaryMount: document.getElementById("contentQualitySummaryMount"),
    contentConflictMount: document.getElementById("contentConflictMount"),
    contentDuplicateMount: document.getElementById("contentDuplicateMount"),
    categoryMappingMount: document.getElementById("categoryMappingMount"),
    editorialBacklogMount: document.getElementById("editorialBacklogMount"),
    qualityDecisionsMount: document.getElementById("qualityDecisionsMount"),
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
    updateEntitlementActionTone();
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
    els.reloadContentQualityBtn.addEventListener("click", loadContentQuality);
    els.contentConflictMount.addEventListener("click", handleContentQualityAction);
    els.contentDuplicateMount.addEventListener("click", handleContentQualityAction);
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
    els.referralCodeForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      await saveReferralCode();
    });
    els.entitlementAction.addEventListener("change", updateEntitlementActionTone);
    els.questionReviewForm.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-review-action]");
      if (!button) return;
      await saveQuestionReview(button.dataset.reviewAction);
    });
  }

  async function refreshAll() {
    if (state.locked) return;
    setProtectedState(false);
    setStatus("Loading admin dashboard...", "loading");
    renderAdminSkeletons();
    try {
      await Promise.all([
        loadStats(),
        loadUsers(),
        loadEntitlements(),
        loadReferrals(),
        loadPayments(),
        loadQuestions(),
        loadContentQuality(),
        loadGeneratedPipeline(),
      ]);
      setStatus("Admin dashboard ready.", "success");
    } catch (error) {
      handleError(error);
    }
  }

  async function loadStats() {
    const payload = await fetchJson("/api/admin/stats");
    state.stats = payload.stats;
    renderMetrics(payload.stats);
    renderLaunchReadiness(payload.stats);
    renderPurchases(payload.stats.recentPurchases || []);
    renderRevenue(payload.stats.revenue || {});
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

  async function loadReferrals() {
    const payload = await fetchJson("/api/admin/referrals");
    renderReferrals(payload.referrals || []);
  }

  async function loadPayments() {
    const payload = await fetchJson("/api/admin/payments");
    state.payments = payload;
    renderPayments(payload);
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

  async function loadContentQuality() {
    const payload = await fetchJson("/api/admin/content-quality");
    state.contentQuality = payload;
    renderContentQuality(payload);
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

  async function saveReferralCode() {
    setStatus("Saving referral code...");
    try {
      await fetchJson("/api/admin/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: els.referralCodeInput.value.trim(),
          description: els.referralDescriptionInput.value.trim(),
          fixedPricePlan: els.referralPlanInput.value,
          maxRedemptions: Number(els.referralMaxInput.value || 0),
          entitlementDurationDays: Number(els.referralDaysInput.value || 90),
          grantEntitlement: els.referralGrantInput.checked,
          active: true,
        }),
      });
      els.referralCodeForm.reset();
      els.referralDaysInput.value = "90";
      await Promise.all([loadStats(), loadReferrals()]);
      setStatus("Referral code saved.", "success");
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
      const error = new Error("admin_request_failed");
      error.status = response.status;
      error.code = typeof payload.error === "string" ? payload.error : "";
      throw error;
    }
    return payload;
  }

  function renderMetrics(stats) {
    const totals = stats.totals || {};
    const questions = stats.questions || {};
    const metrics = [
      ["Users", totals.users || 0, "Learner accounts"],
      ["Admins", totals.admins || 0, "Server-authorized"],
      ["Purchases", totals.purchases || 0, "Stripe records"],
      ["Active access", totals.active_entitlements || 0, "Current unlocks"],
      ["Inactive access", totals.inactive_entitlements || 0, "Expired or revoked"],
      ["Attempts", totals.attempts || 0, "Synced answers"],
      ["Flags", totals.flags || 0, "Saved review marks"],
      ["Analytics events", stats.analytics?.last30DaysEventCount || 0, "Last 30 days"],
      ["Source notes", totals.source_documents || 0, "Admin notes"],
      ["Draft queue", totals.generated_question_drafts || 0, "AI drafts"],
      ["Questions", questions.total || 0, "Public bank"],
      ["Needs review", questions.byReviewStatus?.needs_official_cross_check || 0, "Content QA"],
      ["Generated drafts", questions.generatedDrafts || 0, "Question pipeline"],
    ];

    els.metricGrid.innerHTML = "";
    metrics.forEach(([label, value, caption], index) => {
      const card = document.createElement("div");
      card.className = "metric-card";
      if (index < 4) card.classList.add("metric-card-primary");
      card.innerHTML = "<span></span><strong></strong><em></em>";
      card.querySelector("span").textContent = label;
      card.querySelector("strong").textContent = formatNumber(value);
      card.querySelector("em").textContent = caption;
      els.metricGrid.append(card);
    });
  }

  function renderAdminSkeletons() {
    const metricSkeletons = Array.from({ length: 8 }, () => `
      <div class="metric-card skeleton-card admin-skeleton-card">
        <span class="skeleton-line short"></span>
        <strong class="skeleton-line title"></strong>
        <em class="skeleton-line medium"></em>
      </div>
    `).join("");
    els.metricGrid.innerHTML = metricSkeletons;

    els.launchReadinessMount.innerHTML = `
      <div class="admin-skeleton-list">
        <span class="skeleton-card"></span>
        <span class="skeleton-card"></span>
        <span class="skeleton-card"></span>
      </div>
    `;

    [
      els.usersMount,
      els.entitlementsMount,
      els.purchasesMount,
      els.revenueMount,
      els.planSalesMount,
      els.referralPerformanceMount,
      els.referralsMount,
      els.analyticsFunnelMount,
      els.missedCategoriesMount,
      els.missedQuestionsMount,
      els.questionsMount,
      els.contentQualitySummaryMount,
      els.contentConflictMount,
      els.contentDuplicateMount,
      els.categoryMappingMount,
      els.editorialBacklogMount,
      els.qualityDecisionsMount,
      els.sourceDocumentsMount,
      els.generatedQuestionsMount,
      els.attemptSummaryMount,
      els.auditMount,
    ].forEach((mount) => {
      mount.innerHTML = `
        <div class="admin-empty-state skeleton-block" aria-hidden="true">
          <span class="skeleton-line medium"></span>
          <span class="skeleton-line"></span>
        </div>
      `;
    });
  }

  function renderLaunchReadiness(stats) {
    const totals = stats.totals || {};
    const questions = stats.questions || {};
    const analyticsEvents = stats.analytics?.last30DaysEventCount || 0;
    const needsReview = questions.byReviewStatus?.needs_official_cross_check || 0;
    const draftCount = totals.generated_question_drafts || questions.generatedDrafts || 0;
    const cards = [
      {
        title: "Admin authorization",
        ready: Number(totals.admins || 0) > 0,
        readyText: `${totals.admins || 0} admin user${Number(totals.admins || 0) === 1 ? "" : "s"} configured`,
        actionText: "Promote at least one admin in Neon before launch.",
      },
      {
        title: "Payment records",
        ready: Number(totals.purchases || 0) > 0,
        readyText: `${totals.purchases || 0} purchase record${Number(totals.purchases || 0) === 1 ? "" : "s"} found`,
        actionText: "Run a Stripe checkout test and confirm webhook purchase recording.",
      },
      {
        title: "Content QA",
        ready: needsReview === 0 && Number(questions.total || 0) > 0,
        readyText: needsReview === 0 ? "No questions currently flagged for cross-check" : `${needsReview} question${needsReview === 1 ? "" : "s"} need review`,
        actionText: "Review priority questions before expanding public content.",
      },
      {
        title: "Analytics signal",
        ready: analyticsEvents > 0,
        readyText: `${analyticsEvents} event${analyticsEvents === 1 ? "" : "s"} in the last 30 days`,
        actionText: "Open the app preview and checkout flow once after deployment.",
      },
      {
        title: "AI draft workflow",
        ready: draftCount > 0 || Number(totals.source_documents || 0) > 0,
        readyText: `${totals.source_documents || 0} source note${Number(totals.source_documents || 0) === 1 ? "" : "s"}, ${draftCount} draft${draftCount === 1 ? "" : "s"}`,
        actionText: "Keep generated questions draft-only until admin review.",
      },
    ];

    els.launchReadinessMount.innerHTML = "";
    cards.forEach((card) => {
      const item = document.createElement("article");
      item.className = "readiness-card";
      item.append(statusBadge(card.ready ? "Ready" : "Needs check", card.ready ? "success" : "warning"));
      const title = document.createElement("strong");
      title.textContent = card.title;
      const copy = document.createElement("p");
      copy.textContent = card.ready ? card.readyText : card.actionText;
      item.append(title, copy);
      els.launchReadinessMount.append(item);
    });
  }

  function renderUsers(users) {
    els.usersMount.innerHTML = "";
    if (!users.length) {
      renderEmpty(els.usersMount, "No users found", "Try another email search or wait for the first magic-link login or purchase.");
      return;
    }

    users.forEach((user) => {
      const item = adminItem({
        title: user.email,
        subtitle: "Click to inspect purchase IDs and prepare an entitlement change.",
        badges: [roleBadge(user.role), entitlementBadge(user.entitlement)],
        details: [
          detail("Purchases", user.purchaseCount),
          detail("Attempts", user.attemptCount),
          detail("Flags", user.flagCount),
          detail("Last login", formatDate(user.lastLoginAt)),
        ],
      });
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
      renderEmpty(els.entitlementsMount, "No entitlements found", "Search by email or grant access from the form above.");
      return;
    }

    entitlements.slice(0, 12).forEach((entitlement) => {
      const item = adminItem({
        title: entitlement.email,
        subtitle: entitlement.source ? `Source: ${entitlement.source}` : "Source: unknown",
        badges: [entitlementBadge(entitlement), roleBadge(entitlement.role || "user")],
        details: [
          detail("Expires", formatDate(entitlement.expiresAt)),
          detail("Revoked", formatDate(entitlement.revokedAt)),
          detail("Updated", formatDate(entitlement.updatedAt)),
          detail("Product", entitlement.product || "coach"),
        ],
      });
      item.addEventListener("click", () => {
        els.entitlementEmail.value = entitlement.email;
      });
      els.entitlementsMount.append(item);
    });
  }

  function renderPurchases(purchases) {
    if (!purchases.length) {
      renderEmpty(els.purchasesMount, "No purchases yet", "Completed Stripe checkouts and webhook-recorded purchases will appear here.");
      return;
    }

    els.purchasesMount.innerHTML = `
      <table class="admin-table">
        <thead>
          <tr>
            <th>Email</th>
            <th>Checkout session</th>
            <th>Payment intent</th>
            <th>Plan</th>
            <th>Code</th>
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
      appendCell(row, purchase.email);
      appendCell(row, purchase.stripe_checkout_session_id || purchase.checkoutSessionId || "");
      appendCell(row, purchase.stripe_payment_intent_id || purchase.paymentIntentId || "");
      appendCell(row, labelPlan(purchase.plan_key || purchase.planKey || ""));
      appendCell(row, purchase.referral_code || purchase.referralCode || "");
      appendCell(row, statusBadge(purchase.status || "unknown", purchaseStatusTone(purchase.status)));
      appendCell(row, formatMoney(purchase.amount, purchase.currency));
      appendCell(row, formatDate(purchase.created_at || purchase.createdAt));
      body.append(row);
    });
  }

  function renderRevenue(revenue) {
    const metrics = [
      ["Gross revenue", formatMoney(revenue.grossRevenue, "eur"), "Before estimated Stripe fees"],
      ["Estimated Stripe fees", formatMoney(revenue.estimatedStripeFees, "eur"), "Approximate, not accounting advice"],
      ["Estimated net", formatMoney(revenue.estimatedNetRevenue, "eur"), "Gross minus estimated fees"],
      ["Refunds", formatNumber(revenue.refundCount || 0), "Refund records if available"],
      ["Refund amount", formatMoney(revenue.refundAmount || 0, "eur"), "Successful or recorded refund amount"],
      ["Referral revenue", formatMoney(revenue.referralRevenue, "eur"), "Purchases linked to referral codes"],
      ["Instructor revenue", formatMoney(revenue.instructorRevenue, "eur"), "Instructor pack purchases"],
    ];
    renderAdminItems(els.revenueMount, metrics.map(([title, value, subtitle]) => ({ title, subtitle, badges: [statusBadge(value, "primary")] })), "No revenue yet", "Revenue appears after paid Stripe purchases are recorded.");

    renderAdminItems(
      els.planSalesMount,
      (revenue.salesByPlan || []).map((plan) => ({
        title: labelPlan(plan.planKey),
        subtitle: `${formatNumber(plan.sales)} sale${Number(plan.sales) === 1 ? "" : "s"} | ${formatMoney(plan.revenue, "eur")}`,
        badges: [statusBadge("Plan", "info")],
      })),
      "No plan sales yet",
      "Plan breakdown appears after checkout records include plan metadata."
    );

    renderAdminItems(
      els.referralPerformanceMount,
      (revenue.referralPerformance || []).map((item) => ({
        title: item.code,
        subtitle: `${formatNumber(item.redemptions)} redemptions | ${formatNumber(item.purchases)} purchases | ${item.conversionRate}% checkout conversion | ${formatMoney(item.revenue, "eur")}`,
        badges: [statusBadge(item.fixedPricePlan || "Referral", "warning")],
      })),
      "No referral performance yet",
      "Create a referral code, then send traffic through it to see conversion."
    );
  }

  function renderReferrals(referrals) {
    renderAdminItems(
      els.referralsMount,
      referrals.map((referral) => ({
        title: referral.code,
        subtitle: `${referral.description || "No description"} | ${formatNumber(referral.redemptions)} redemptions | ${formatNumber(referral.purchases)} purchases | ${formatMoney(referral.revenue, "eur")}`,
        badges: [
          statusBadge(referral.active ? "Active" : "Disabled", referral.active ? "success" : "neutral"),
          statusBadge(referral.fixed_price_plan || "No fixed plan", "info"),
        ],
      })),
      "No referral codes yet",
      "Create an instructor or launch code using the form above."
    );
  }

  function renderPayments(payload) {
    renderAdminItems(
      els.checkoutAttemptsMount,
      (payload.attempts || []).map((attempt) => ({
        title: attempt.resolved_plan_key || attempt.requested_plan_key || "Checkout attempt",
        subtitle: `${attempt.email || attempt.anonymous_id || "Anonymous"} | ${attempt.environment || "env unknown"} | ${formatDate(attempt.created_at)}`,
        badges: [
          statusBadge(labelStatus(attempt.status), badgeTone(attempt.status)),
          statusBadge(attempt.referral_code || "No code", "info"),
        ],
        details: attempt.failure_reason ? [`Failure: ${attempt.failure_reason}`] : [],
      })),
      "No checkout attempts yet",
      "Checkout attempts appear before Stripe redirects a learner."
    );

    renderAdminItems(
      els.stripeEventsMount,
      (payload.events || []).map((event) => ({
        title: event.type || event.stripe_event_id,
        subtitle: `${event.stripe_event_id} | ${formatDate(event.last_received_at)}`,
        badges: [
          statusBadge(labelStatus(event.processing_status), badgeTone(event.processing_status)),
          statusBadge(`${formatNumber(event.replay_count || 0)} replays`, "neutral"),
        ],
        details: event.failure_reason ? [`Failure: ${event.failure_reason}`] : [],
      })),
      "No Stripe webhook events yet",
      "Webhook events appear after Stripe sends signed payment events."
    );

    renderAdminItems(
      els.instructorCodesMount,
      (payload.instructorCodes || []).slice(0, 25).map((code) => ({
        title: code.code,
        subtitle: `${code.purchase_email || "No buyer email"} | ${formatNumber(code.redemption_count || 0)} of ${formatNumber(code.max_redemptions || 1)} used`,
        badges: [
          statusBadge(labelStatus(code.status), badgeTone(code.status)),
          statusBadge(code.plan_key || "Instructor code", "info"),
        ],
        details: [
          code.redeemed_by_email ? `Redeemed by ${code.redeemed_by_email}` : "Not redeemed",
          code.expires_at ? `Expires ${formatDate(code.expires_at)}` : "No expiry recorded",
        ],
      })),
      "No instructor codes yet",
      "Paid instructor packs will generate private learner codes here."
    );
  }

  function renderAdminItems(mount, items, emptyTitle, emptyCopy) {
    mount.innerHTML = "";
    if (!items.length) {
      renderEmpty(mount, emptyTitle, emptyCopy);
      return;
    }
    items.forEach((item) => {
      mount.append(adminItem({
        title: item.title,
        subtitle: item.subtitle,
        badges: item.badges || [],
        details: item.details || [],
      }));
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
      renderEmpty(els.analyticsFunnelMount, "No analytics yet", "Privacy-safe funnel events will appear after visitors use the app.");
      return;
    }

    funnel.forEach((item) => {
      const row = adminItem({
        title: labelEvent(item.eventName),
        subtitle: `${formatNumber(item.events || 0)} events from ${formatNumber(item.visitors || 0)} anonymous visitor${Number(item.visitors || 0) === 1 ? "" : "s"}`,
        badges: [statusBadge("Analytics", "info")],
      });
      els.analyticsFunnelMount.append(row);
    });

    const paywallRow = adminItem({
      title: "Paywall to checkout",
      subtitle: `${paywall.checkoutClicks || 0}/${paywall.views || 0} clicks (${paywall.clickRate || 0}%)`,
      badges: [statusBadge("Funnel", "primary")],
    });
    els.analyticsFunnelMount.append(paywallRow);
  }

  function renderMissedCategories(categories) {
    els.missedCategoriesMount.innerHTML = "";
    if (!categories.length) {
      renderEmpty(els.missedCategoriesMount, "No missed categories yet", "Wrong-answer category trends will appear after logged-in attempts sync.");
      return;
    }

    categories.forEach((item) => {
      const row = adminItem({
        title: item.category,
        subtitle: `${formatNumber(item.misses || 0)} wrong answer${Number(item.misses || 0) === 1 ? "" : "s"}`,
        badges: [statusBadge("Missed", "warning")],
      });
      els.missedCategoriesMount.append(row);
    });
  }

  function renderMissedQuestions(questions) {
    els.missedQuestionsMount.innerHTML = "";
    if (!questions.length) {
      renderEmpty(els.missedQuestionsMount, "No missed questions yet", "The most missed question list appears once learners answer questions.");
      return;
    }

    questions.forEach((item) => {
      const row = adminItem({
        title: `Question ${item.questionId}`,
        subtitle: `${formatNumber(item.misses || 0)} wrong answer${Number(item.misses || 0) === 1 ? "" : "s"} | ${item.category}`,
        badges: [statusBadge("Review", "warning")],
      });
      els.missedQuestionsMount.append(row);
    });
  }

  function renderQuestions(questions) {
    if (!questions.length) {
      renderEmpty(els.questionsMount, "No questions found", "Adjust search, category, review, or high-yield filters and try again.");
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
      appendCell(row, question.id);
      appendCell(row, statusBadge(question.status || "unknown", questionStatusTone(question.status)));
      appendCell(row, statusBadge(question.reviewedStatus || "unreviewed", reviewStatusTone(question.reviewedStatus)));
      appendCell(row, question.category);
      appendCell(row, question.question);
      appendCell(row, question.priorityScore || question.priorityLabel || "");
      appendCell(row, question.hasImage ? statusBadge("Image", "info") : "");
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

  function renderContentQuality(payload) {
    const summary = payload.summary || {};
    renderContentQualitySummary(summary);
    renderQualityGroups(
      els.contentConflictMount,
      payload.conflictingAnswerGroups || [],
      "No conflicting answers found",
      "Repeated stems with different saved correct answers will appear here."
    );
    renderQualityGroups(
      els.contentDuplicateMount,
      payload.duplicateGroups || [],
      "No duplicate groups found",
      "Exact, normalised, reordered-option, image, and near-duplicate groups will appear here."
    );
    renderCategoryMappings(payload.categoryMappings || []);
    renderEditorialBacklog(payload.editorialBacklog || []);
    renderQualityDecisions(payload.recentDecisions || []);
  }

  function renderContentQualitySummary(summary) {
    const metrics = [
      ["Analysed", summary.totalQuestions || 0, "Questions in source bank"],
      ["Categories", summary.canonicalCategories || 0, "Canonical registry"],
      ["Duplicates", summary.duplicateGroups || 0, "Variant groups"],
      ["Conflicts", summary.conflictingAnswerGroups || 0, "Answer review queue"],
      ["Lint findings", summary.lintFindings || 0, "Structure and wording checks"],
      ["Backlog", summary.editorialBacklog || 0, "Editorial work items"],
    ];

    els.contentQualitySummaryMount.innerHTML = "";
    metrics.forEach(([label, value, caption]) => {
      const card = document.createElement("div");
      card.className = "metric-card";
      card.innerHTML = "<span></span><strong></strong><em></em>";
      card.querySelector("span").textContent = label;
      card.querySelector("strong").textContent = formatNumber(value);
      card.querySelector("em").textContent = caption;
      els.contentQualitySummaryMount.append(card);
    });
  }

  function renderQualityGroups(mount, groups, emptyTitle, emptyCopy) {
    mount.innerHTML = "";
    if (!groups.length) {
      renderEmpty(mount, emptyTitle, emptyCopy);
      return;
    }

    groups.slice(0, 20).forEach((group) => {
      const item = document.createElement("article");
      item.className = "admin-item content-quality-card";

      const heading = document.createElement("div");
      heading.className = "admin-item-heading";
      const title = document.createElement("strong");
      title.textContent = `${compactIds(group.questionIds)} -> canonical #${group.canonicalQuestionId}`;
      const badges = document.createElement("div");
      badges.className = "admin-badge-row";
      badges.append(
        statusBadge(group.conflictingCorrectAnswers ? "Conflict" : "Duplicate", group.conflictingCorrectAnswers ? "danger" : "warning"),
        statusBadge(group.reviewStatus || "needs_review", reviewStatusTone(group.reviewStatus)),
        statusBadge(group.duplicateReason || "variant", "info")
      );
      heading.append(title, badges);
      item.append(heading);

      const variantList = document.createElement("div");
      variantList.className = "quality-variant-list";
      (group.variants || []).forEach((variant) => {
        const variantNode = document.createElement("section");
        variantNode.className = "quality-variant";

        const variantHeading = document.createElement("strong");
        variantHeading.textContent = `#${variant.questionId} | ${variant.category}`;
        const stem = document.createElement("p");
        stem.textContent = variant.question || "No question text";
        const answer = document.createElement("em");
        answer.textContent = `Saved answer: ${variant.correctAnswer || "missing"}`;

        const options = document.createElement("ol");
        (variant.options || []).forEach((option) => {
          const li = document.createElement("li");
          li.textContent = option.text || "";
          li.classList.toggle("correct-option", Boolean(option.isCorrect));
          options.append(li);
        });

        const explanation = document.createElement("p");
        explanation.className = "quality-explanation";
        explanation.textContent = variant.explanation || "No explanation";
        variantNode.append(variantHeading, stem, answer, options, explanation);
        variantList.append(variantNode);
      });
      item.append(variantList);

      const actions = document.createElement("div");
      actions.className = "review-actions content-quality-actions";
      [
        ["mark_legitimate_variant", "Legitimate variants", ""],
        ["select_canonical", "Select canonical", ""],
        ["merge_progress_history", "Merge progress", ""],
        ["rewrite_stem", "Rewrite stem", ""],
        ["change_category", "Change category", ""],
        ["archive_redundant", "Archive redundant", "danger"],
        ["publish_decision", "Publish decision", "primary"],
      ].forEach(([action, label, tone]) => {
        actions.append(contentActionButton(action, label, tone, group));
      });
      item.append(actions);
      mount.append(item);
    });
  }

  function contentActionButton(action, label, tone, group) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    if (tone) button.className = tone;
    button.dataset.contentAction = action;
    button.dataset.groupId = group.variantGroupId;
    button.dataset.groupType = group.conflictingCorrectAnswers ? "conflict" : "duplicate";
    button.dataset.questionIds = (group.questionIds || []).join(",");
    button.dataset.canonicalQuestionId = String(group.canonicalQuestionId || "");
    return button;
  }

  async function handleContentQualityAction(event) {
    const button = event.target.closest("[data-content-action]");
    if (!button) return;

    const action = button.dataset.contentAction;
    const questionIds = parseIdList(button.dataset.questionIds);
    const canonicalQuestionId = Number(button.dataset.canonicalQuestionId || questionIds[0]);
    const body = {
      action,
      groupId: button.dataset.groupId,
      groupType: button.dataset.groupType,
      questionIds,
      canonicalQuestionId,
      reason: "",
      notes: "",
    };

    if (action === "select_canonical") {
      const value = window.prompt("Canonical question ID", String(canonicalQuestionId));
      if (!value) return;
      body.canonicalQuestionId = Number(value);
    }

    if (action === "rewrite_stem") {
      const questionId = Number(window.prompt("Question ID to rewrite", String(canonicalQuestionId)));
      const newQuestionText = window.prompt("New question stem");
      if (!Number.isInteger(questionId) || !newQuestionText) return;
      body.questionId = questionId;
      body.newQuestionText = newQuestionText;
    }

    if (action === "change_category") {
      const questionId = Number(window.prompt("Question ID to recategorise", String(canonicalQuestionId)));
      const newCategory = window.prompt("New canonical category display name");
      if (!Number.isInteger(questionId) || !newCategory) return;
      body.questionId = questionId;
      body.newCategory = newCategory;
    }

    if (action === "archive_redundant" && !window.confirm("Archive non-canonical records in this group?")) return;

    body.reason = window.prompt("Reason or editorial note", action) || action;
    setStatus("Saving content-quality decision...");
    try {
      await fetchJson("/api/admin/content-quality", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await Promise.all([loadContentQuality(), loadStats()]);
      setStatus("Content-quality decision saved.", "success");
    } catch (error) {
      handleError(error);
    }
  }

  function renderCategoryMappings(mappings) {
    renderAdminItems(
      els.categoryMappingMount,
      mappings.slice(0, 40).map((mapping) => ({
        title: mapping.originalCategory || "(blank)",
        subtitle: `${mapping.displayName} | ${mapping.mappingReason}`,
        badges: [
          statusBadge(mapping.canonicalKey, mapping.active ? "info" : "warning"),
          statusBadge(mapping.active ? "Active" : "Inactive", mapping.active ? "success" : "warning"),
        ],
      })),
      "No category mappings",
      "Mappings appear after the source bank is analysed."
    );
  }

  function renderEditorialBacklog(items) {
    renderAdminItems(
      els.editorialBacklogMount,
      items.slice(0, 40).map((item) => ({
        title: `${normalizeBadgeLabel(item.itemType)} | ${item.reason}`,
        subtitle: `${compactIds(item.questionIds)} | ${item.message}`,
        badges: [
          statusBadge(item.priority || "review", item.priority === "critical" || item.priority === "error" ? "danger" : "warning"),
          statusBadge(item.reviewStatus || "open", "neutral"),
        ],
      })),
      "No editorial backlog",
      "Lint findings, duplicates, and conflict groups will appear here."
    );
  }

  function renderQualityDecisions(decisions) {
    renderAdminItems(
      els.qualityDecisionsMount,
      decisions.map((decision) => ({
        title: `${normalizeBadgeLabel(decision.action)} | ${decision.groupId}`,
        subtitle: `${compactIds(decision.questionIds)} | ${decision.reason || "No note"} | ${formatDate(decision.createdAt)}`,
        badges: [
          statusBadge(decision.reviewStatus || "reviewed", reviewStatusTone(decision.reviewStatus)),
          statusBadge(decision.createdByEmail || "admin", "neutral"),
        ],
      })),
      "No decisions yet",
      "Editorial actions are audit-logged and will appear here after admins review groups."
    );
  }

  function compactIds(ids) {
    const values = Array.isArray(ids) ? ids : [];
    if (!values.length) return "No question IDs";
    if (values.length <= 4) return values.map((id) => `#${id}`).join(", ");
    return `${values.slice(0, 4).map((id) => `#${id}`).join(", ")} +${values.length - 4}`;
  }

  function parseIdList(value) {
    return String(value || "")
      .split(",")
      .map(Number)
      .filter(Number.isInteger);
  }

  function renderSourceDocuments(sources) {
    els.sourceDocumentsMount.innerHTML = "";
    els.sourceDocumentSelect.innerHTML = "";

    const approved = sources.filter((source) => source.status === "approved");
    if (!approved.length) {
      els.sourceDocumentSelect.append(new Option("No approved source notes", ""));
      renderEmpty(els.sourceDocumentsMount, "No approved source notes", "Save a source note, then approve it before generating draft questions.");
      return;
    }

    approved.forEach((source) => {
      els.sourceDocumentSelect.append(new Option(`${source.title} - ${source.category}`, source.id));
    });

    sources.slice(0, 8).forEach((source) => {
      const item = adminItem({
        title: source.title,
        subtitle: `${source.category} | ${source.topic || "No topic"}`,
        badges: [statusBadge(source.status || "draft", source.status === "approved" ? "success" : "warning")],
        details: [
          detail("Created", formatDate(source.createdAt)),
          detail("Approved", formatDate(source.approvedAt)),
        ],
      });
      item.addEventListener("click", () => {
        els.sourceDocumentSelect.value = source.id;
      });
      els.sourceDocumentsMount.append(item);
    });
  }

  function renderGeneratedQuestions(questions) {
    els.generatedQuestionsMount.innerHTML = "";
    if (!questions.length) {
      renderEmpty(els.generatedQuestionsMount, "No generated drafts yet", "Drafts created from approved source notes will appear here for admin review.");
      return;
    }

    questions.slice(0, 40).forEach((question) => {
      const item = document.createElement("article");
      item.className = "admin-item generated-question-card";

      const heading = document.createElement("div");
      heading.className = "admin-item-heading";
      const title = document.createElement("strong");
      title.textContent = question.questionText;
      const meta = document.createElement("span");
      meta.textContent = `${question.category} | ${question.difficulty} | duplicate ${(question.duplicateScore * 100).toFixed(0)}%`;
      const badges = document.createElement("div");
      badges.className = "admin-badge-row";
      badges.append(statusBadge(question.status || "draft", questionStatusTone(question.status)));
      heading.append(title, badges, meta);

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
        reject.className = "danger";
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
        reviewed.className = "admin-review-note";
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
    els.selectedQuestionStatus.textContent = "";
    els.selectedQuestionStatus.append(
      statusBadge(question.reviewedStatus || "unreviewed", reviewStatusTone(question.reviewedStatus)),
      statusBadge(question.safeToShow ? "Safe to show" : "Hidden", question.safeToShow ? "success" : "warning")
    );
    els.questionExplanationInput.value = question.explanation || "";
    els.questionNotesInput.value = question.notes || "";
  }

  function renderAttemptSummary(summary) {
    els.attemptSummaryMount.innerHTML = "";
    if (!summary.length) {
      renderEmpty(els.attemptSummaryMount, "No attempt summary yet", "Category accuracy appears after logged-in learners answer questions.");
      return;
    }

    summary.forEach((item) => {
      const row = adminItem({
        title: item.category,
        subtitle: `${formatNumber(item.answered)} answered | ${item.accuracy}% accuracy`,
        badges: [
          statusBadge(`${item.missedCount} missed`, Number(item.missedCount || 0) ? "warning" : "success"),
          statusBadge(`${item.flaggedCount} flagged`, Number(item.flaggedCount || 0) ? "info" : "neutral"),
        ],
      });
      els.attemptSummaryMount.append(row);
    });
  }

  function renderAudit(rows) {
    els.auditMount.innerHTML = "";
    if (!rows.length) {
      renderEmpty(els.auditMount, "No audit rows yet", "Admin mutations will write audit entries here.");
      return;
    }

    rows.forEach((entry) => {
      const item = adminItem({
        title: entry.action,
        subtitle: `${entry.admin_email} -> ${entry.target_email || entry.target_id || entry.target_type} | ${formatDate(entry.created_at)}`,
        badges: [statusBadge("Audit", "neutral")],
      });
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

  function adminItem({ title, subtitle = "", badges = [], details = [] }) {
    const item = document.createElement("article");
    item.className = "admin-item";

    const heading = document.createElement("div");
    heading.className = "admin-item-heading";
    const titleNode = document.createElement("strong");
    titleNode.textContent = title || "Untitled";
    const badgeRow = document.createElement("div");
    badgeRow.className = "admin-badge-row";
    badges.filter(Boolean).forEach((badge) => badgeRow.append(badge));
    heading.append(titleNode, badgeRow);

    item.append(heading);
    if (subtitle) {
      const copy = document.createElement("span");
      copy.textContent = subtitle;
      item.append(copy);
    }

    if (details.length) {
      const list = document.createElement("dl");
      list.append(...details);
      item.append(list);
    }

    return item;
  }

  function appendCell(row, value) {
    const cell = document.createElement("td");
    if (value instanceof Node) {
      cell.append(value);
    } else {
      cell.textContent = value || "";
    }
    row.append(cell);
  }

  function statusBadge(label, tone = "neutral") {
    const badge = document.createElement("span");
    badge.className = `admin-status-badge ${tone}`;
    badge.textContent = normalizeBadgeLabel(label);
    return badge;
  }

  function roleBadge(role) {
    const normalized = String(role || "user").toLowerCase();
    return statusBadge(normalized === "admin" ? "Admin" : "User", normalized === "admin" ? "primary" : "neutral");
  }

  function entitlementBadge(entitlement) {
    const label = entitlementLabel(entitlement);
    return statusBadge(label, entitlementTone(label));
  }

  function entitlementTone(label) {
    const normalized = String(label || "").toLowerCase();
    if (normalized === "active") return "success";
    if (normalized === "revoked") return "danger";
    if (normalized === "expired") return "warning";
    if (normalized === "inactive") return "neutral";
    return "muted";
  }

  function purchaseStatusTone(status) {
    const normalized = String(status || "").toLowerCase();
    if (["paid", "complete", "completed", "succeeded"].includes(normalized)) return "success";
    if (["failed", "cancelled", "refunded"].includes(normalized)) return "danger";
    if (["pending", "open", "processing"].includes(normalized)) return "warning";
    return "neutral";
  }

  function badgeTone(status) {
    const normalized = String(status || "").toLowerCase();
    if (["active", "fulfilled", "processed", "paid", "succeeded", "stripe_session_created"].includes(normalized)) return "success";
    if (["failed", "async_payment_failed", "revoked", "expired", "refunded", "disputed"].includes(normalized)) return "danger";
    if (["processing", "pending", "return_seen", "payment_pending"].includes(normalized)) return "warning";
    return "neutral";
  }

  function labelStatus(status) {
    return normalizeBadgeLabel(status || "unknown");
  }

  function questionStatusTone(status) {
    const normalized = String(status || "").toLowerCase();
    if (["published", "approved", "active"].includes(normalized)) return "success";
    if (["draft", "needs_review", "needs_official_cross_check"].includes(normalized)) return "warning";
    if (["rejected", "revoked", "hidden", "disabled"].includes(normalized)) return "danger";
    return "neutral";
  }

  function reviewStatusTone(status) {
    const normalized = String(status || "").toLowerCase();
    if (["approved", "reviewed"].includes(normalized)) return "success";
    if (["rejected"].includes(normalized)) return "danger";
    if (["needs_official_cross_check", "unreviewed", "draft"].includes(normalized)) return "warning";
    return "neutral";
  }

  function normalizeBadgeLabel(value) {
    return String(value || "Unknown")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function renderEmpty(mount, title, copy = "") {
    mount.innerHTML = "";
    const empty = document.createElement("div");
    empty.className = "admin-empty-state";
    const heading = document.createElement("strong");
    heading.textContent = title;
    empty.append(heading);
    if (copy) {
      const body = document.createElement("p");
      body.textContent = copy;
      empty.append(body);
    }
    mount.append(empty);
  }

  function handleError(error) {
    if (error.status === 401 || error.status === 403) {
      state.locked = true;
      setProtectedState(true, error.status);
      setStatus("Admin access required.", "warning");
      return;
    }
    setStatus(adminSafeErrorMessage(error), "error");
  }

  function setStatus(message, tone = "") {
    els.status.textContent = message;
    els.status.classList.toggle("success", tone === "success");
    els.status.classList.toggle("error", tone === "error");
    els.status.classList.toggle("warning", tone === "warning");
    els.status.classList.toggle("loading", tone === "loading");
  }

  function setProtectedState(active, status) {
    document.body.classList.toggle("admin-locked", Boolean(active));
    els.protectedState.classList.toggle("hidden", !active);
    if (!active) return;

    els.protectedCopy.textContent = "You need an admin session to view this workspace.";
  }

  function adminSafeErrorMessage(error) {
    if (Number(error?.status) === 400) return "That admin action could not be saved. Check the form fields and try again.";
    if (Number(error?.status) === 429) return "Too many admin requests. Wait a moment, then try again.";
    if (Number(error?.status) >= 500) return "Admin service is unavailable right now. Try again after checking deployment logs.";
    return "Admin request could not be completed. Try again.";
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

  function updateEntitlementActionTone() {
    const isRevoke = els.entitlementAction.value === "revoke";
    els.entitlementSubmitBtn.classList.toggle("danger", isRevoke);
    els.entitlementSubmitBtn.classList.toggle("primary", !isRevoke);
    els.entitlementSubmitBtn.textContent = isRevoke ? "Revoke access" : "Save entitlement";
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString();
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
      restore_access_started: "Restore starts",
      restore_access_success: "Restore successes",
      pricing_page_viewed: "Pricing page views",
      referral_code_applied: "Referral applied",
      referral_checkout_started: "Referral checkout starts",
      mock_started: "Mocks started",
      mock_completed: "Mocks completed",
    };
    return labels[eventName] || String(eventName || "").replace(/_/g, " ");
  }

  function labelPlan(planKey) {
    const labels = {
      launch_offer: "Launch offer",
      full_study_pass: "Full Study Pass",
      instructor_10: "Instructor pack - 10",
      instructor_25: "Instructor pack - 25",
      unknown: "Unknown plan",
    };
    return labels[planKey] || normalizeBadgeLabel(planKey);
  }
})();
