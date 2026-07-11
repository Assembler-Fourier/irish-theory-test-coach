(function () {
  "use strict";

  const state = {
    locked: false,
    stats: null,
    payments: null,
    instructors: null,
    supportCases: [],
    audit: [],
    selectedQuestion: null,
    selectedUser: null,
    sourceDocuments: [],
    generatedQuestions: [],
    contentQuality: null,
  };

  const els = {
    status: document.getElementById("adminStatus"),
    protectedState: document.getElementById("adminProtectedState"),
    protectedCopy: document.getElementById("adminProtectedCopy"),
    overviewRangeForm: document.getElementById("overviewRangeForm"),
    overviewFromInput: document.getElementById("overviewFromInput"),
    overviewToInput: document.getElementById("overviewToInput"),
    refreshBtn: document.getElementById("refreshBtn"),
    metricGrid: document.getElementById("metricGrid"),
    launchReadinessMount: document.getElementById("launchReadinessMount"),
    operationalWarningsMount: document.getElementById("operationalWarningsMount"),
    userSearchForm: document.getElementById("userSearchForm"),
    userSearchInput: document.getElementById("userSearchInput"),
    usersMount: document.getElementById("usersMount"),
    userDetailMount: document.getElementById("userDetailMount"),
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
    refundsMount: document.getElementById("refundsMount"),
    disputesMount: document.getElementById("disputesMount"),
    instructorFilterForm: document.getElementById("instructorFilterForm"),
    instructorSearchInput: document.getElementById("instructorSearchInput"),
    instructorStatusInput: document.getElementById("instructorStatusInput"),
    instructorAccountsMount: document.getElementById("instructorAccountsMount"),
    instructorPacksMount: document.getElementById("instructorPacksMount"),
    instructorInventoryMount: document.getElementById("instructorInventoryMount"),
    instructorRedemptionsMount: document.getElementById("instructorRedemptionsMount"),
    instructorPerformanceMount: document.getElementById("instructorPerformanceMount"),
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
    modeUsageMount: document.getElementById("modeUsageMount"),
    deviceClassMount: document.getElementById("deviceClassMount"),
    conversionSourceMount: document.getElementById("conversionSourceMount"),
    mockCompletionMount: document.getElementById("mockCompletionMount"),
    reportFrequencyMount: document.getElementById("reportFrequencyMount"),
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
    questionDetailMount: document.getElementById("questionDetailMount"),
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
    auditFilterForm: document.getElementById("auditFilterForm"),
    auditSearchInput: document.getElementById("auditSearchInput"),
    auditActionInput: document.getElementById("auditActionInput"),
    auditTargetTypeInput: document.getElementById("auditTargetTypeInput"),
    auditMount: document.getElementById("auditMount"),
    supportFilterForm: document.getElementById("supportFilterForm"),
    supportStatusInput: document.getElementById("supportStatusInput"),
    supportSearchInput: document.getElementById("supportSearchInput"),
    supportCaseForm: document.getElementById("supportCaseForm"),
    supportEmailInput: document.getElementById("supportEmailInput"),
    supportCategoryInput: document.getElementById("supportCategoryInput"),
    supportPriorityInput: document.getElementById("supportPriorityInput"),
    supportNotesInput: document.getElementById("supportNotesInput"),
    supportCasesMount: document.getElementById("supportCasesMount"),
  };

  init();

  function init() {
    setDefaultOverviewRange();
    bindEvents();
    updateEntitlementActionTone();
    refreshAll();
  }

  function bindEvents() {
    els.overviewRangeForm.addEventListener("submit", (event) => {
      event.preventDefault();
      refreshAll();
    });
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
    els.instructorFilterForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      await loadInstructors();
    });
    els.supportFilterForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      await loadSupport();
    });
    els.supportCaseForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      await createSupportCase();
    });
    els.auditFilterForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      await loadAudit();
    });
    els.userDetailMount.addEventListener("click", handleUserDetailAction);
    els.supportCasesMount.addEventListener("click", handleSupportAction);
    els.instructorInventoryMount.addEventListener("click", handleInstructorAction);
    els.stripeEventsMount.addEventListener("click", handlePaymentAction);
    els.entitlementAction.addEventListener("change", updateEntitlementActionTone);
    els.questionReviewForm.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-review-action]");
      if (!button) return;
      await saveQuestionReview(button.dataset.reviewAction);
    });
  }

  function setDefaultOverviewRange() {
    const today = new Date();
    const start = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    els.overviewToInput.value = toDateInputValue(today);
    els.overviewFromInput.value = toDateInputValue(start);
  }

  async function refreshAll() {
    if (state.locked) return;
    setProtectedState(false);
    setStatus("Loading admin dashboard...", "loading");
    renderAdminSkeletons();
    try {
      await loadStats();
      await Promise.all([
        loadOptionalPanel(loadUsers, [els.usersMount, els.userDetailMount]),
        loadOptionalPanel(loadEntitlements, [els.entitlementsMount]),
        loadOptionalPanel(loadReferrals, [els.referralsMount]),
        loadOptionalPanel(loadPayments, [els.checkoutAttemptsMount, els.stripeEventsMount, els.instructorCodesMount, els.refundsMount, els.disputesMount]),
        loadOptionalPanel(loadInstructors, [els.instructorAccountsMount, els.instructorPacksMount, els.instructorInventoryMount, els.instructorRedemptionsMount, els.instructorPerformanceMount]),
        loadOptionalPanel(loadSupport, [els.supportCasesMount]),
        loadOptionalPanel(loadAudit, [els.auditMount]),
        loadOptionalPanel(loadQuestions, [els.questionsMount, els.questionDetailMount]),
        loadOptionalPanel(loadContentQuality, [els.contentQualitySummaryMount, els.contentConflictMount, els.contentDuplicateMount, els.categoryMappingMount, els.editorialBacklogMount, els.qualityDecisionsMount]),
        loadOptionalPanel(loadGeneratedPipeline, [els.sourceDocumentsMount, els.generatedQuestionsMount]),
      ]);
      setStatus("Admin dashboard ready.", "success");
    } catch (error) {
      handleError(error);
    }
  }

  async function loadOptionalPanel(loader, mounts) {
    try {
      await loader();
    } catch (error) {
      if (Number(error.status) === 403) {
        mounts.forEach((mount) => renderRestricted(mount));
        return;
      }
      throw error;
    }
  }

  async function loadStats() {
    const params = new URLSearchParams();
    if (els.overviewFromInput.value) params.set("from", els.overviewFromInput.value);
    if (els.overviewToInput.value) params.set("to", els.overviewToInput.value);
    const payload = await fetchJson(`/api/admin/stats?${params.toString()}`);
    state.stats = payload.stats;
    renderMetrics(payload.stats);
    renderLaunchReadiness(payload.stats);
    renderOperationalWarnings(payload.stats.operationalWarnings || []);
    renderPurchases(payload.stats.recentPurchases || []);
    renderRevenue(payload.stats.revenue || {});
    renderAnalytics(payload.stats.analytics || {});
    renderAttemptSummary(payload.stats.attemptSummary || []);
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

  async function loadInstructors() {
    const params = new URLSearchParams();
    params.set("q", els.instructorSearchInput.value.trim());
    params.set("status", els.instructorStatusInput.value);
    const payload = await fetchJson(`/api/admin/instructors?${params.toString()}`);
    state.instructors = payload;
    renderInstructors(payload);
  }

  async function loadSupport() {
    const params = new URLSearchParams();
    params.set("status", els.supportStatusInput.value);
    params.set("q", els.supportSearchInput.value.trim());
    const payload = await fetchJson(`/api/admin/support?${params.toString()}`);
    state.supportCases = payload.cases || [];
    renderSupportCases(state.supportCases);
  }

  async function loadAudit() {
    const params = new URLSearchParams();
    params.set("q", els.auditSearchInput.value.trim());
    params.set("action", els.auditActionInput.value.trim());
    params.set("targetType", els.auditTargetTypeInput.value.trim());
    const payload = await fetchJson(`/api/admin/audit?${params.toString()}`);
    state.audit = payload.audit || [];
    renderAudit(state.audit, payload.pagination);
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
    const action = els.entitlementAction.value;
    const isRevoke = action === "revoke";
    if (isRevoke && !window.confirm("Revoke this learner's access?")) {
      setStatus("Entitlement change cancelled.", "warning");
      return;
    }
    const reason = window.prompt("Reason for this entitlement change", action) || action;
    try {
      const payload = await fetchJson("/api/admin/entitlements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: els.entitlementEmail.value.trim(),
          action,
          days: Number(els.entitlementDays.value || 0),
          confirm: isRevoke,
          reason,
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

    if (action === "archive" && !window.confirm("Archive this question from publication?")) return;
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
          confirm: action === "archive",
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

  async function loadUserDetail(email) {
    setStatus("Loading user detail...");
    try {
      const payload = await fetchJson(`/api/admin/users?email=${encodeURIComponent(email)}`);
      state.selectedUser = payload.user || null;
      renderUserDetail(state.selectedUser);
      setStatus(payload.user ? "User detail loaded." : "No user detail found.", payload.user ? "success" : "warning");
    } catch (error) {
      handleError(error);
    }
  }

  async function mutateUser(action, email) {
    if (!email) return;
    const destructive = action === "revoke_sessions" || action === "account_deletion_request";
    if (destructive && !window.confirm(`Confirm ${normalizeBadgeLabel(action)} for ${maskEmail(email)}?`)) return;
    const reason = window.prompt("Reason or support note", action) || action;
    setStatus("Saving user operation...");
    try {
      await fetchJson("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          email,
          reason,
          confirm: action === "revoke_sessions",
        }),
      });
      await Promise.all([loadUserDetail(email), loadSupport(), loadAudit()]);
      setStatus("User operation saved.", "success");
    } catch (error) {
      handleError(error);
    }
  }

  async function createSupportCase() {
    setStatus("Creating support case...");
    try {
      await fetchJson("/api/admin/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          requesterEmail: els.supportEmailInput.value.trim(),
          category: els.supportCategoryInput.value,
          priority: els.supportPriorityInput.value,
          internalNotes: els.supportNotesInput.value.trim(),
          reason: "admin_created_support_case",
        }),
      });
      els.supportCaseForm.reset();
      els.supportPriorityInput.value = "normal";
      await Promise.all([loadSupport(), loadStats(), loadAudit()]);
      setStatus("Support case created.", "success");
    } catch (error) {
      handleError(error);
    }
  }

  async function updateSupportCase(caseId, action) {
    const item = state.supportCases.find((supportCase) => supportCase.id === caseId);
    if (!item) return;
    const resolution = action === "resolve" ? window.prompt("Resolution note", item.resolution || "") || "Resolved by admin." : item.resolution || "";
    const internalNotes = window.prompt("Internal note", item.internalNotes || "") || item.internalNotes || "";
    setStatus("Updating support case...");
    try {
      await fetchJson("/api/admin/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          id: caseId,
          status: action === "resolve" ? "resolved" : item.status,
          priority: item.priority,
          internalNotes,
          resolution,
          reason: action,
        }),
      });
      await Promise.all([loadSupport(), loadAudit()]);
      setStatus("Support case updated.", "success");
    } catch (error) {
      handleError(error);
    }
  }

  async function revokeInstructorCode(code) {
    if (!code || !window.confirm(`Revoke instructor code ${code}?`)) return;
    const reason = window.prompt("Reason for revoking this code", "admin_revoked") || "admin_revoked";
    setStatus("Revoking instructor code...");
    try {
      await fetchJson("/api/admin/instructors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "revoke_code",
          code,
          reason,
          confirm: true,
        }),
      });
      await Promise.all([loadInstructors(), loadPayments(), loadAudit()]);
      setStatus("Instructor code revoked.", "success");
    } catch (error) {
      handleError(error);
    }
  }

  async function replayStripeEvent(stripeEventId) {
    if (!stripeEventId || !window.confirm(`Replay Stripe event ${stripeEventId}?`)) return;
    const reason = window.prompt("Replay reason", "admin_replay") || "admin_replay";
    setStatus("Replaying Stripe event...");
    try {
      await fetchJson("/api/admin/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "replay_stripe_event",
          stripeEventId,
          reason,
        }),
      });
      await Promise.all([loadPayments(), loadStats(), loadAudit()]);
      setStatus("Stripe event replay requested.", "success");
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

  function handleUserDetailAction(event) {
    const button = event.target.closest("[data-user-action]");
    if (!button) return;
    mutateUser(button.dataset.userAction, button.dataset.email);
  }

  function handleSupportAction(event) {
    const button = event.target.closest("[data-support-action]");
    if (!button) return;
    updateSupportCase(button.dataset.caseId, button.dataset.supportAction);
  }

  function handleInstructorAction(event) {
    const button = event.target.closest("[data-instructor-action]");
    if (!button) return;
    if (button.dataset.instructorAction === "revoke_code") {
      revokeInstructorCode(button.dataset.code);
    }
  }

  function handlePaymentAction(event) {
    const button = event.target.closest("[data-payment-action]");
    if (!button) return;
    if (button.dataset.paymentAction === "replay_stripe_event") {
      replayStripeEvent(button.dataset.stripeEventId);
    }
  }

  function renderMetrics(stats) {
    const totals = stats.totals || {};
    const questions = stats.questions || {};
    const revenue = stats.revenue || {};
    const funnel = stats.analytics?.funnel || [];
    const eventValue = (eventName) => Number(funnel.find((item) => item.eventName === eventName)?.events || 0);
    const metrics = [
      ["Users", totals.users || 0, "Learner accounts"],
      ["Admins", totals.admins || 0, "Server-authorized"],
      ["Purchases", totals.purchases || 0, "Stripe records"],
      ["Active access", totals.active_entitlements || 0, "Current unlocks"],
      ["Expired access", totals.expired_entitlements || 0, "Access ended"],
      ["Gross revenue", formatMoney(revenue.grossRevenue, "eur"), "Selected period"],
      ["Refunds", formatMoney(revenue.refundAmount, "eur"), `${formatNumber(revenue.refundCount || 0)} refund records`],
      ["Net recorded", formatMoney(revenue.estimatedNetRevenue, "eur"), "Gross minus estimated fees/refunds"],
      ["Preview starts", eventValue("preview_started"), "Selected period"],
      ["Checkout starts", eventValue("checkout_clicked") + eventValue("referral_checkout_started"), "Selected period"],
      ["Completed purchases", eventValue("checkout_success"), "Selected period"],
      ["Restore success", eventValue("restore_access_success"), "Selected period"],
      ["Mock starts", eventValue("mock_started"), "Selected period"],
      ["Mock completions", eventValue("mock_completed"), "Selected period"],
      ["Attempts", totals.attempts || 0, "Synced answers"],
      ["Flags", totals.flags || 0, "Saved review marks"],
      ["Analytics events", stats.analytics?.last30DaysEventCount || 0, "Selected period"],
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
      card.querySelector("strong").textContent = typeof value === "string" ? value : formatNumber(value);
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
      els.operationalWarningsMount,
      els.usersMount,
      els.userDetailMount,
      els.entitlementsMount,
      els.purchasesMount,
      els.checkoutAttemptsMount,
      els.stripeEventsMount,
      els.instructorCodesMount,
      els.refundsMount,
      els.disputesMount,
      els.instructorAccountsMount,
      els.instructorPacksMount,
      els.instructorInventoryMount,
      els.instructorRedemptionsMount,
      els.instructorPerformanceMount,
      els.revenueMount,
      els.planSalesMount,
      els.referralPerformanceMount,
      els.referralsMount,
      els.analyticsFunnelMount,
      els.missedCategoriesMount,
      els.missedQuestionsMount,
      els.modeUsageMount,
      els.deviceClassMount,
      els.conversionSourceMount,
      els.mockCompletionMount,
      els.reportFrequencyMount,
      els.questionsMount,
      els.questionDetailMount,
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
      els.supportCasesMount,
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

  function renderOperationalWarnings(warnings) {
    renderAdminItems(
      els.operationalWarningsMount,
      warnings.map((warning) => ({
        title: normalizeBadgeLabel(warning.warning_type || "warning"),
        subtitle: `${warning.title || "Operational item"} | ${warning.detail || "Needs review"} | ${formatDate(warning.created_at)}`,
        badges: [
          statusBadge("Review", warning.warning_type === "payment_dispute" || warning.warning_type === "failed_webhook" ? "danger" : "warning"),
          statusBadge(warning.target_id || "No target", "neutral"),
        ],
      })),
      "No operational warnings",
      "Failed webhooks, failed checkouts, urgent support cases, and active disputes will appear here."
    );
  }

  function renderUsers(users) {
    els.usersMount.innerHTML = "";
    if (!users.length) {
      renderEmpty(els.usersMount, "No users found", "Try another email search or wait for the first magic-link login or purchase.");
      return;
    }

    users.forEach((user) => {
      const item = adminItem({
        title: user.maskedEmail || maskEmail(user.email),
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
        els.supportEmailInput.value = user.email;
        loadUserDetail(user.email);
      });
      els.usersMount.append(item);
    });
  }

  function renderUserDetail(user) {
    els.userDetailMount.innerHTML = "";
    if (!user) {
      renderEmpty(els.userDetailMount, "No user selected", "Choose a learner from the Users list to inspect account, access, progress, and support operations.");
      return;
    }

    const wrapper = document.createElement("article");
    wrapper.className = "admin-detail-panel";
    const header = adminItem({
      title: user.maskedEmail || maskEmail(user.email),
      subtitle: `${user.displayName || "Learner account"} | Created ${formatDate(user.createdAt)} | Last active ${formatDate(user.lastActiveAt)}`,
      badges: [
        roleBadge(user.role),
        statusBadge(user.deleteRequestedAt ? "Deletion requested" : "Account active", user.deleteRequestedAt ? "warning" : "success"),
      ],
      details: [
        detail("Progress", `${formatNumber(user.progressSummary?.attempts || 0)} attempts, ${formatNumber(user.progressSummary?.flags || 0)} flags`),
        detail("Distinct questions", user.progressSummary?.distinctQuestions || 0),
        detail("Mocks", user.progressSummary?.mocks || 0),
        detail("Last attempt", formatDate(user.progressSummary?.lastAttemptAt)),
      ],
    });

    const actions = document.createElement("div");
    actions.className = "review-actions";
    [
      ["account_export_request", "Create export request", ""],
      ["revoke_sessions", "Revoke sessions", "danger"],
      ["account_deletion_request", "Create deletion request", "danger"],
    ].forEach(([action, label, tone]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.userAction = action;
      button.dataset.email = user.email;
      button.textContent = label;
      if (tone) button.className = tone;
      actions.append(button);
    });

    wrapper.append(
      header,
      actions,
      detailSection("Entitlement history", user.entitlements || [], entitlementDetailItem),
      detailSection("Purchase history", user.purchases || [], purchaseDetailItem),
      detailSection("Sessions", user.sessions || [], sessionDetailItem),
      detailSection("Support notes", user.supportCases || [], supportDetailItem),
      detailSection("Account requests", user.deletionRequests || [], requestDetailItem)
    );
    els.userDetailMount.append(wrapper);
  }

  function detailSection(title, rows, formatter) {
    const section = document.createElement("section");
    section.className = "admin-detail-section";
    const heading = document.createElement("h3");
    heading.textContent = title;
    section.append(heading);
    const list = document.createElement("div");
    list.className = "admin-list";
    if (!rows.length) {
      renderEmpty(list, `No ${title.toLowerCase()}`, "Nothing recorded yet.");
    } else {
      rows.slice(0, 20).forEach((row) => list.append(formatter(row)));
    }
    section.append(list);
    return section;
  }

  function entitlementDetailItem(entitlement) {
    return adminItem({
      title: entitlement.product || "irish-theory-test-coach",
      subtitle: `Source: ${entitlement.source || "unknown"} | Updated ${formatDate(entitlement.updated_at || entitlement.updatedAt)}`,
      badges: [entitlementBadge(normalizeEntitlement(entitlement))],
      details: [
        detail("Expires", formatDate(entitlement.expires_at || entitlement.expiresAt)),
        detail("Revoked", formatDate(entitlement.revoked_at || entitlement.revokedAt)),
      ],
    });
  }

  function purchaseDetailItem(purchase) {
    return adminItem({
      title: labelPlan(purchase.plan_key || purchase.planKey || "unknown"),
      subtitle: `${formatMoney(purchase.amount, purchase.currency)} | ${purchase.environment || "env unknown"} | ${formatDate(purchase.created_at || purchase.createdAt)}`,
      badges: [
        statusBadge(labelStatus(purchase.status), purchaseStatusTone(purchase.status)),
        statusBadge(purchase.refund_state || purchase.entitlement_effect || "Recorded", "neutral"),
      ],
      details: [
        detail("Stripe session", purchase.stripe_checkout_session_id || purchase.checkoutSessionId),
        detail("Payment intent", purchase.stripe_payment_intent_id || purchase.paymentIntentId),
        detail("Referral", purchase.referral_code || purchase.referralCode),
      ],
    });
  }

  function sessionDetailItem(session) {
    return adminItem({
      title: session.revoked_at ? "Revoked session" : "Active or recent session",
      subtitle: `${formatDate(session.created_at)} | Last seen ${formatDate(session.last_seen_at)}`,
      badges: [statusBadge(session.revoked_at ? "Revoked" : "Session", session.revoked_at ? "danger" : "success")],
      details: [
        detail("Expires", formatDate(session.expires_at)),
        detail("Reason", session.revoked_reason || "None"),
      ],
    });
  }

  function supportDetailItem(supportCase) {
    return adminItem({
      title: `${supportCase.category} support`,
      subtitle: `${supportCase.internal_notes || "No note"} | ${formatDate(supportCase.updated_at || supportCase.updatedAt)}`,
      badges: [
        statusBadge(supportCase.status || "open", badgeTone(supportCase.status)),
        statusBadge(supportCase.priority || "normal", supportCase.priority === "urgent" || supportCase.priority === "high" ? "warning" : "neutral"),
      ],
    });
  }

  function requestDetailItem(request) {
    return adminItem({
      title: request.status || "requested",
      subtitle: `${request.reason || "No reason"} | ${formatDate(request.created_at || request.createdAt)}`,
      badges: [statusBadge("Account request", "warning")],
    });
  }

  function versionDetailItem(version) {
    return adminItem({
      title: `Version ${version.version_number || version.versionNumber || "?"}`,
      subtitle: `${version.change_note || version.reason || "No change note"} | ${formatDate(version.created_at || version.createdAt)}`,
      badges: [
        statusBadge(version.reviewed_status || "review", reviewStatusTone(version.reviewed_status)),
        statusBadge(version.safe_to_show ? "Safe to show" : "Hidden", version.safe_to_show ? "success" : "warning"),
      ],
      details: [
        detail("Editor", version.changed_by_email || "Unknown"),
        detail("Fields", Array.isArray(version.fields_changed) ? version.fields_changed.join(", ") : "Not recorded"),
      ],
    });
  }

  function questionReportItem(report) {
    return adminItem({
      title: report.reason_category || "learner_report",
      subtitle: `${report.comment || "No comment"} | ${formatDate(report.created_at || report.createdAt)}`,
      badges: [
        statusBadge(report.status || "open", badgeTone(report.status)),
        statusBadge(report.content_version || "content", "neutral"),
      ],
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
        actions: event.processing_status === "failed"
          ? [actionButton("Replay", "replay_stripe_event", { stripeEventId: event.stripe_event_id, kind: "payment" })]
          : [],
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

    renderAdminItems(
      els.refundsMount,
      (payload.refunds || []).slice(0, 12).map((refund) => ({
        title: `${formatMoney(refund.amount, refund.currency)} refund`,
        subtitle: `${maskEmail(refund.email)} | ${refund.reason || "No reason"} | ${formatDate(refund.created_at)}`,
        badges: [
          statusBadge(labelStatus(refund.status), badgeTone(refund.status)),
          statusBadge(refund.entitlement_effect || "No entitlement effect", "neutral"),
        ],
      })),
      "No refund records",
      "Refunds are tracked from webhook/admin payment operations."
    );

    renderAdminItems(
      els.disputesMount,
      (payload.disputes || []).slice(0, 12).map((dispute) => ({
        title: `${formatMoney(dispute.amount, dispute.currency)} dispute`,
        subtitle: `${maskEmail(dispute.email)} | ${dispute.reason || "No reason"} | ${formatDate(dispute.created_at)}`,
        badges: [
          statusBadge(labelStatus(dispute.status), badgeTone(dispute.status)),
          statusBadge(dispute.entitlement_effect || "No entitlement effect", "warning"),
        ],
        details: [detail("Stripe dispute", dispute.stripe_dispute_id)],
      })),
      "No dispute records",
      "Disputes and chargebacks will appear here when recorded."
    );
  }

  function renderInstructors(payload) {
    renderAdminItems(
      els.instructorAccountsMount,
      (payload.accounts || []).map((account) => ({
        title: account.maskedEmail || maskEmail(account.email),
        subtitle: `${account.organisation || account.name || "Instructor account"} | ${formatNumber(account.used_codes || 0)}/${formatNumber(account.code_count || 0)} used`,
        badges: [
          statusBadge(`${formatNumber(account.pack_purchases || 0)} packs`, "info"),
          statusBadge("Instructor", "primary"),
        ],
        details: [
          detail("Created", formatDate(account.created_at)),
          detail("Updated", formatDate(account.updated_at)),
        ],
      })),
      "No instructor accounts",
      "Instructor accounts appear after instructor pack purchases or admin setup."
    );

    renderAdminItems(
      els.instructorPacksMount,
      (payload.packPurchases || []).map((purchase) => ({
        title: labelPlan(purchase.plan_key),
        subtitle: `${maskEmail(purchase.email)} | ${formatMoney(purchase.amount, purchase.currency)} | ${formatDate(purchase.created_at)}`,
        badges: [
          statusBadge(labelStatus(purchase.status), purchaseStatusTone(purchase.status)),
          statusBadge(`${formatNumber(purchase.generated_codes || 0)} codes`, "info"),
        ],
        details: [
          detail("Stripe session", purchase.stripe_checkout_session_id),
          detail("Used codes", purchase.used_codes || 0),
          detail("Environment", purchase.environment),
        ],
      })),
      "No instructor pack purchases",
      "Instructor pack checkouts will appear here."
    );

    els.instructorInventoryMount.innerHTML = "";
    const codes = payload.codes || [];
    if (!codes.length) {
      renderEmpty(els.instructorInventoryMount, "No code inventory", "Generated learner codes will appear here after instructor pack fulfillment.");
    } else {
      codes.slice(0, 60).forEach((code) => {
        const item = adminItem({
          title: code.code,
          subtitle: `${maskEmail(code.purchase_email)} | ${formatNumber(code.redemption_count || 0)} of ${formatNumber(code.max_redemptions || 1)} used`,
          badges: [
            statusBadge(labelStatus(code.status), badgeTone(code.status)),
            statusBadge(code.plan_key || "Study pass", "info"),
          ],
          details: [
            detail("Expires", formatDate(code.expires_at)),
            detail("Redeemed by", code.redeemed_by_email ? maskEmail(code.redeemed_by_email) : "None"),
            detail("Updated", formatDate(code.updated_at)),
          ],
        });
        if (code.status !== "revoked") {
          const actions = document.createElement("div");
          actions.className = "review-actions";
          actions.append(actionButton("Revoke code", "revoke_code", { code: code.code, kind: "instructor", tone: "danger" }));
          item.append(actions);
        }
        els.instructorInventoryMount.append(item);
      });
    }

    renderAdminItems(
      els.instructorRedemptionsMount,
      (payload.redemptions || []).map((redemption) => ({
        title: redemption.code,
        subtitle: `${redemption.maskedEmail || maskEmail(redemption.email)} | Buyer ${maskEmail(redemption.purchase_email)} | ${formatDate(redemption.created_at)}`,
        badges: [statusBadge(labelStatus(redemption.status), badgeTone(redemption.status))],
      })),
      "No redemptions yet",
      "Learner code redemptions will appear here."
    );

    renderAdminItems(
      els.instructorPerformanceMount,
      (payload.performance || []).map((row) => ({
        title: maskEmail(row.instructor_email),
        subtitle: `${formatNumber(row.used)} used | ${formatNumber(row.active)} active | ${formatNumber(row.revoked)} revoked`,
        badges: [statusBadge(`${formatNumber(row.codes)} codes`, "primary")],
      })),
      "No instructor performance yet",
      "Performance appears after instructor codes are generated and redeemed."
    );
  }

  function renderSupportCases(cases) {
    els.supportCasesMount.innerHTML = "";
    if (!cases.length) {
      renderEmpty(els.supportCasesMount, "No support cases", "Create a case from the form above or wait for account requests to appear.");
      return;
    }

    cases.forEach((supportCase) => {
      const item = adminItem({
        title: `${supportCase.category} | ${supportCase.maskedRequesterEmail || maskEmail(supportCase.requesterEmail)}`,
        subtitle: `${supportCase.internalNotes || "No internal note"} | Updated ${formatDate(supportCase.updatedAt)}`,
        badges: [
          statusBadge(supportCase.status || "open", badgeTone(supportCase.status)),
          statusBadge(supportCase.priority || "normal", supportCase.priority === "urgent" || supportCase.priority === "high" ? "warning" : "neutral"),
        ],
        details: [
          detail("Assigned", supportCase.assignedAdminEmail || "Unassigned"),
          detail("Purchase session", supportCase.stripeCheckoutSessionId || "None"),
          detail("Resolution", supportCase.resolution || "None"),
        ],
      });
      const actions = document.createElement("div");
      actions.className = "review-actions";
      actions.append(
        actionButton("Update note", "update", { kind: "support", caseId: supportCase.id }),
        actionButton("Resolve", "resolve", { kind: "support", caseId: supportCase.id, tone: "primary" })
      );
      item.append(actions);
      els.supportCasesMount.append(item);
    });
  }

  function renderAdminItems(mount, items, emptyTitle, emptyCopy) {
    mount.innerHTML = "";
    if (!items.length) {
      renderEmpty(mount, emptyTitle, emptyCopy);
      return;
    }
    items.forEach((item) => {
      const node = adminItem({
        title: item.title,
        subtitle: item.subtitle,
        badges: item.badges || [],
        details: item.details || [],
      });
      if (item.actions?.length) {
        const actions = document.createElement("div");
        actions.className = "review-actions";
        item.actions.forEach((action) => actions.append(action));
        node.append(actions);
      }
      mount.append(node);
    });
  }

  function renderAnalytics(analytics) {
    renderFunnel(analytics.funnel || [], analytics.paywall || {});
    renderMissedCategories(analytics.missedCategories || []);
    renderMissedQuestions(analytics.missedQuestions || []);
    renderSimpleMetricList(els.modeUsageMount, analytics.modeUsage || [], "mode", "events", "No mode usage yet", "Mode usage appears after learners switch study modes.");
    renderSimpleMetricList(els.deviceClassMount, analytics.deviceClass || [], "device_class", "events", "No device data yet", "Device class is derived from privacy-safe event properties when present.");
    renderSimpleMetricList(els.conversionSourceMount, analytics.conversionSource || [], "source", "events", "No conversion source yet", "Checkout source attribution appears after pricing and referral events.");
    renderMockCompletion(analytics.mockCompletion || {});
    renderSimpleMetricList(els.reportFrequencyMount, analytics.reportFrequency || [], "question_id", "reports", "No question reports yet", "Learner problem reports will appear here for content review.");
  }

  function renderSimpleMetricList(mount, rows, labelKey, valueKey, emptyTitle, emptyCopy) {
    renderAdminItems(
      mount,
      rows.map((row) => ({
        title: labelKey === "question_id" ? `Question ${row[labelKey]}` : normalizeBadgeLabel(row[labelKey]),
        subtitle: `${formatNumber(row[valueKey] || 0)} ${normalizeBadgeLabel(valueKey)}`,
        badges: [statusBadge("Directional", "neutral")],
      })),
      emptyTitle,
      emptyCopy
    );
  }

  function renderMockCompletion(mockCompletion) {
    const starts = Number(mockCompletion.starts || 0);
    const completions = Number(mockCompletion.completions || 0);
    renderAdminItems(
      els.mockCompletionMount,
      [{
        title: "Mock completion",
        subtitle: `${formatNumber(completions)} completions from ${formatNumber(starts)} starts`,
        badges: [statusBadge(starts ? `${Math.round((completions / starts) * 100)}%` : "0%", "primary")],
      }],
      "No mock activity",
      "Mock starts and completions appear after learners use exam mode."
    );
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
    body.confirm = action === "archive_redundant";

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

  async function selectQuestion(question) {
    state.selectedQuestion = question;
    renderSelectedQuestion(question);
    try {
      const payload = await fetchJson(`/api/admin/questions?questionId=${encodeURIComponent(question.id)}`);
      state.selectedQuestion = payload.question || question;
      renderSelectedQuestion(state.selectedQuestion, payload);
    } catch (error) {
      handleError(error);
    }
  }

  function renderSelectedQuestion(question, detailPayload = null) {
    els.questionReviewForm.classList.remove("hidden");
    els.selectedQuestionLabel.textContent = `#${question.id} ${question.category}`;
    els.selectedQuestionStatus.textContent = "";
    els.selectedQuestionStatus.append(
      statusBadge(question.reviewedStatus || "unreviewed", reviewStatusTone(question.reviewedStatus)),
      statusBadge(question.safeToShow ? "Safe to show" : "Hidden", question.safeToShow ? "success" : "warning")
    );
    els.questionExplanationInput.value = question.explanation || "";
    els.questionNotesInput.value = question.notes || "";
    renderQuestionDetail(detailPayload);
  }

  function renderQuestionDetail(payload) {
    els.questionDetailMount.innerHTML = "";
    if (!payload) {
      renderEmpty(els.questionDetailMount, "Loading question detail", "Version history and learner reports will appear here.");
      return;
    }
    els.questionDetailMount.append(
      detailSection("Version history", payload.versions || [], versionDetailItem),
      detailSection("Learner reports", payload.reports || [], questionReportItem)
    );
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

  function renderAudit(rows, pagination = null) {
    els.auditMount.innerHTML = "";
    if (!rows.length) {
      renderEmpty(els.auditMount, "No audit rows yet", "Admin mutations will write audit entries here.");
      return;
    }

    if (pagination) {
      const summary = document.createElement("p");
      summary.className = "admin-section-note";
      summary.textContent = `${formatNumber(pagination.total || rows.length)} audit rows available. Showing ${formatNumber(rows.length)}.`;
      els.auditMount.append(summary);
    }

    rows.forEach((entry) => {
      const item = adminItem({
        title: entry.action,
        subtitle: `${entry.admin_email} -> ${entry.target_email || entry.target_id || entry.target_type} | ${entry.reason || "No reason"} | ${formatDate(entry.created_at)}`,
        badges: [
          statusBadge("Audit", "neutral"),
          statusBadge(entry.request_correlation_id || "No correlation", "info"),
        ],
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
      details.forEach((itemDetail) => {
        if (itemDetail instanceof Node) {
          list.append(itemDetail);
          return;
        }
        list.append(detail("Detail", itemDetail));
      });
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

  function actionButton(label, action, options = {}) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    if (options.tone) button.className = options.tone;
    if (options.kind === "payment") {
      button.dataset.paymentAction = action;
      button.dataset.stripeEventId = options.stripeEventId || "";
    } else if (options.kind === "instructor") {
      button.dataset.instructorAction = action;
      button.dataset.code = options.code || "";
    } else if (options.kind === "support") {
      button.dataset.supportAction = action;
      button.dataset.caseId = options.caseId || "";
    }
    return button;
  }

  function statusBadge(label, tone = "neutral") {
    const badge = document.createElement("span");
    badge.className = `admin-status-badge ${tone}`;
    badge.textContent = normalizeBadgeLabel(label);
    return badge;
  }

  function roleBadge(role) {
    const normalized = String(role || "user").toLowerCase();
    if (normalized === "owner") return statusBadge("Owner", "primary");
    if (normalized === "admin") return statusBadge("Admin", "primary");
    if (normalized === "content_editor") return statusBadge("Content editor", "info");
    if (normalized === "support") return statusBadge("Support", "warning");
    return statusBadge("User", "neutral");
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

  function renderRestricted(mount) {
    mount.innerHTML = "";
    const restricted = document.createElement("div");
    restricted.className = "admin-empty-state admin-restricted-state";
    const heading = document.createElement("strong");
    heading.textContent = "Role permission required";
    const copy = document.createElement("p");
    copy.textContent = "Your admin role does not allow this operation. Server-side authorization is still enforced.";
    restricted.append(heading, copy);
    mount.append(restricted);
  }

  function handleError(error) {
    if (error.status === 401 || (error.status === 403 && !state.stats)) {
      state.locked = true;
      setProtectedState(true, error.status);
      setStatus("Admin access required.", "warning");
      return;
    }
    if (error.status === 403) {
      setStatus("Your admin role does not allow that operation.", "warning");
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

  function normalizeEntitlement(entitlement) {
    const expiresAt = entitlement.expires_at || entitlement.expiresAt || null;
    const revokedAt = entitlement.revoked_at || entitlement.revokedAt || null;
    const rawActive = Boolean(entitlement.active ?? entitlement.rawActive);
    return {
      active: rawActive && !revokedAt && (!expiresAt || new Date(expiresAt).getTime() > Date.now()),
      revokedAt,
      expiresAt,
    };
  }

  function maskEmail(email) {
    const [name, domain] = String(email || "").split("@");
    if (!domain) return "hidden";
    const visible = name.length <= 2 ? name.slice(0, 1) : name.slice(0, 2);
    return `${visible}***@${domain}`;
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

  function toDateInputValue(date) {
    return date.toISOString().slice(0, 10);
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
