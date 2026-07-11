import { createApiClient } from "./api-client.js";
import { createSessionStore } from "./session-store.js";
import { applyAnswerReveal, labelForScore as scoreLabel, normalizeClientQuestion, resolveImageSrc } from "./question-renderer.js";
import { createAccessController } from "./access-controller.js";
import { createAnalyticsClient } from "./analytics-client.js";
import { createProgressController } from "./progress-controller.js";

(function () {
  "use strict";

  const PRODUCT_SUMMARY = window.PRODUCT_SUMMARY || {};
  const DATA_URLS = ["./data/preview-questions.json"];
  const EXAM_SIZE = positiveNumber(PRODUCT_SUMMARY.mockSize, 40);
  const PASS_MARK = 35;
  const EXAM_SECONDS = positiveNumber(PRODUCT_SUMMARY.mockDurationSeconds, 45 * 60);
  const DAILY_TARGET = positiveNumber(PRODUCT_SUMMARY.dailyTarget, 25);
  const PREVIEW_LIMIT = positiveNumber(PRODUCT_SUMMARY.previewLimit, 15);
  const CELEBRATION_DURATION_MS = 3600;
  const STORAGE_KEY = "irish-theory-practice-progress-v2";
  const ACCESS_KEY = "irish-theory-practice-access-v1";
  const ANALYTICS_KEY = "irish-theory-practice-anonymous-id-v1";
  const PROGRESS_SCHEMA_VERSION = 3;
  const store = createSessionStore(window.localStorage);
  const studyApi = createApiClient();
  const progressController = createProgressController({ dailyTarget: DAILY_TARGET });
  let analyticsClient = null;
  let accessController = null;
  let lastInputModality = "pointer";
  const CATEGORY_MIX = [
    ["Safe and Responsible Driving", 13],
    ["Legal Matters/Rules of the Road", 8],
    ["Managing Risk", 7],
    ["Control of Vehicle", 5],
    ["Technical", 4],
    ["Traffic Signs", 3],
  ];

  const state = {
    questions: [],
    filtered: [],
    activeIndex: 0,
    mode: "revise",
    selectedCategory: "",
    search: "",
    progress: loadProgress(),
    categorySummary: [],
    entitlement: loadEntitlement(),
    session: {
      authenticated: false,
      email: "",
      entitlementActive: false,
    },
    analytics: {
      anonymousId: loadAnonymousId(),
      previewStartedTracked: false,
    },
    referral: {
      code: "",
      planKey: "",
    },
    studySession: null,
    answerStateToken: "",
    exam: null,
    timerId: null,
    syncRetryTimer: null,
    syncRetryDelayMs: 2000,
    celebrations: {
      dailyTarget: "",
      weakCategories: new Set(),
      mockPass: "",
    },
  };

  const els = {
    statusBar: document.getElementById("statusBar"),
    insightBar: document.getElementById("insightBar"),
    insightTitle: document.getElementById("insightTitle"),
    insightCopy: document.getElementById("insightCopy"),
    jumpHighYieldBtn: document.getElementById("jumpHighYieldBtn"),
    examBar: document.getElementById("examBar"),
    examProgress: document.getElementById("examProgress"),
    examTimer: document.getElementById("examTimer"),
    questionMount: document.getElementById("questionMount"),
    answerLiveRegion: document.getElementById("answerLiveRegion"),
    template: document.getElementById("questionTemplate"),
    paywallTemplate: document.getElementById("paywallTemplate"),
    searchInput: document.getElementById("searchInput"),
    categorySelect: document.getElementById("categorySelect"),
    modeRevise: document.getElementById("modeRevise"),
    modeHighYield: document.getElementById("modeHighYield"),
    modeHardest: document.getElementById("modeHardest"),
    modeSigns: document.getElementById("modeSigns"),
    modeExam: document.getElementById("modeExam"),
    modeReview: document.getElementById("modeReview"),
    mobileModeSelect: document.getElementById("mobileModeSelect"),
    mobileModeSummary: document.getElementById("mobileModeSummary"),
    modeAccessLabel: document.getElementById("modeAccessLabel"),
    startExamBtn: document.getElementById("startExamBtn"),
    finishExamBtn: document.getElementById("finishExamBtn"),
    resetProgressBtn: document.getElementById("resetProgressBtn"),
    heroCheckoutBtn: document.getElementById("heroCheckoutBtn"),
    checkoutBtn: document.getElementById("checkoutBtn"),
    restoreAccessLink: document.getElementById("restoreAccessLink"),
    restoreForm: document.getElementById("restoreForm"),
    restoreEmail: document.getElementById("restoreEmail"),
    restoreBtn: document.getElementById("restoreBtn"),
    restoreStatus: document.getElementById("restoreStatus"),
    restoreCloseBtn: document.getElementById("restoreCloseBtn"),
    logoutBtn: document.getElementById("logoutBtn"),
    mobileStickyCta: document.getElementById("mobileStickyCta"),
    stickyCheckoutBtn: document.getElementById("stickyCheckoutBtn"),
    stickyRestoreLink: document.getElementById("stickyRestoreLink"),
    stickyProgressText: document.getElementById("stickyProgressText"),
    unlockBadge: document.getElementById("unlockBadge"),
    unlockStatus: document.getElementById("unlockStatus"),
    syncStatusText: document.getElementById("syncStatusText"),
    answeredStat: document.getElementById("answeredStat"),
    accuracyStat: document.getElementById("accuracyStat"),
    missedStat: document.getElementById("missedStat"),
    flaggedStat: document.getElementById("flaggedStat"),
    highYieldStat: document.getElementById("highYieldStat"),
    signsStat: document.getElementById("signsStat"),
    categorySummary: document.getElementById("categorySummary"),
    targetStat: document.getElementById("targetStat"),
    targetRing: document.getElementById("targetRing"),
    targetMeter: document.getElementById("targetMeter"),
    coachCopy: document.getElementById("coachCopy"),
    nextActionTitle: document.getElementById("nextActionTitle"),
    nextActionCopy: document.getElementById("nextActionCopy"),
    studyFlowList: document.getElementById("studyFlowList"),
    flowStateLabel: document.getElementById("flowStateLabel"),
    questionCountChip: document.getElementById("questionCountChip"),
    trustQuestionCount: document.getElementById("trustQuestionCount"),
    trustPriorityCount: document.getElementById("trustPriorityCount"),
    trustSignImageCount: document.getElementById("trustSignImageCount"),
  };

  analyticsClient = createAnalyticsClient({ anonymousId: state.analytics.anonymousId });
  accessController = createAccessController({
    pricingConfig,
    productSummary: PRODUCT_SUMMARY,
    hasAccess,
  });

  init();

  function positiveNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
  }

  async function init() {
    configureResponsivePanels();
    bindEvents();
    bindConnectivityEvents();
    registerServiceWorker();
    trackEvent("page_view", { path: window.location.pathname || "/" });
    setLoading(true);
    renderLoading("Loading preview questions...");
    setStatus("Loading secure preview...");
    await handleLoginReturn();
    await refreshServerSession();
    await handleCheckoutReturn();

    try {
      const payload = await loadFirstAvailable(DATA_URLS);
      state.questions = normalizeQuestions(payload.questions);
      hydrateCategories();
      if (state.session.authenticated) {
        await syncLocalProgressWithServer();
        await loadServerProgress();
      }
      applyFilters();
      setStatus(buildStatusMessage(payload.url));
      renderInsight();
      render();
    } catch (error) {
      const offline = !navigator.onLine;
      setStatus(offline ? "Offline. Cached preview was not available yet." : "Waiting for the preview package.");
      renderEmpty(
        offline
          ? "You are offline and this device does not have the preview package cached yet. Reconnect once, then the app can reopen faster."
          : "Run the build step to generate the preview package, then refresh this page."
      );
      console.error(error);
    } finally {
      setLoading(false);
    }

    updateStats();
  }

  async function loadFirstAvailable(urls) {
    let lastError = null;
    for (const url of urls) {
      try {
        const response = await fetch(url, { cache: "default" });
        if (!response.ok) throw new Error(`Status ${response.status}`);
        const payload = await response.json();
        return {
          questions: Array.isArray(payload) ? payload : payload.questions,
          previewPackage: Array.isArray(payload) ? null : payload,
          url,
        };
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error("No dataset URL configured.");
  }

  function bindConnectivityEvents() {
    window.addEventListener("online", () => {
      setStatus("Back online. Syncing progress when available.");
      state.syncRetryDelayMs = 2000;
      syncPendingAttempts();
      syncPendingFlags();
    });

    window.addEventListener("offline", () => {
      setStatus("Offline mode. Cached questions and images may still work on this device.");
      setSyncStatus("Offline. New answers are queued on this device.");
    });
  }

  function configureResponsivePanels() {
    const query = window.matchMedia("(max-width: 860px)");
    const panels = Array.from(document.querySelectorAll(".mobile-collapsible"));
    const syncPanels = () => {
      panels.forEach((panel) => {
        panel.open = !query.matches;
      });
    };

    syncPanels();
    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", syncPanels);
    } else if (typeof query.addListener === "function") {
      query.addListener(syncPanels);
    }
  }

  async function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;

    try {
      const registration = await navigator.serviceWorker.register("./service-worker.js");
      if (registration.waiting) {
        setStatus("Offline cache updated. Reload when convenient.");
      }
    } catch {
      // The app works without the PWA cache layer.
    }
  }

  function bindEvents() {
    window.addEventListener("keydown", (event) => {
      if (["Tab", "Enter", " ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
        lastInputModality = "keyboard";
      }
    }, { passive: true });
    window.addEventListener("pointerdown", () => {
      lastInputModality = "pointer";
    }, { passive: true });

    els.searchInput.addEventListener("input", () => {
      state.search = els.searchInput.value.trim().toLowerCase();
      state.activeIndex = 0;
      applyFilters();
      render();
    });

    els.categorySelect.addEventListener("change", () => {
      state.selectedCategory = els.categorySelect.value;
      state.activeIndex = 0;
      applyFilters();
      render();
    });

    els.modeRevise.addEventListener("click", () => setMode("revise"));
    els.modeHighYield.addEventListener("click", () => setMode("highYield"));
    els.modeHardest.addEventListener("click", () => setMode("hardest"));
    els.modeSigns.addEventListener("click", () => setMode("signs"));
    els.modeExam.addEventListener("click", startExam);
    els.modeReview.addEventListener("click", () => setMode("review"));
    els.mobileModeSelect?.addEventListener("change", () => {
      const selectedMode = els.mobileModeSelect.value;
      if (selectedMode === "exam") {
        startExam();
        return;
      }
      setMode(selectedMode);
    });
    els.jumpHighYieldBtn.addEventListener("click", () => setMode("highYield"));
    els.startExamBtn.addEventListener("click", startExam);
    els.finishExamBtn.addEventListener("click", finishExam);
    els.resetProgressBtn.addEventListener("click", resetProgress);
    els.heroCheckoutBtn?.addEventListener("click", () => startCheckout("hero_unlock"));
    els.checkoutBtn.addEventListener("click", () => startCheckout("sidebar_unlock"));
    els.stickyCheckoutBtn.addEventListener("click", () => startCheckout("mobile_sticky"));
    document.addEventListener("click", (event) => {
      const trigger = event.target.closest("[data-restore-trigger]");
      if (!trigger) return;
      focusRestoreAccess(event, trigger.dataset.restoreSource || "restore_link");
    });
    els.restoreCloseBtn?.addEventListener("click", closeRestoreAccess);
    els.restoreForm.addEventListener("submit", requestLoginLink);
    document.addEventListener("submit", (event) => {
      const form = event.target.closest(".referral-form");
      if (!form) return;
      event.preventDefault();
      applyReferralCode(form);
    });
    els.restoreForm.addEventListener("focusout", () => {
      window.setTimeout(() => setRestoreFocusActive(els.restoreForm.contains(document.activeElement)), 0);
    });
    els.restoreEmail.addEventListener("focus", () => setRestoreFocusActive(true));
    els.restoreEmail.addEventListener("input", () => {
      const emailIssue = validateRestoreEmail(els.restoreEmail.value.trim());
      if (!emailIssue) {
        setRestoreEmailValidity(true);
      }
      if (els.restoreForm.dataset.restoreState === "error" && !emailIssue) {
        setRestoreStatus("idle");
      }
    });
    els.logoutBtn.addEventListener("click", logout);
  }

  function normalizeQuestions(payload) {
    return payload
      .filter((question) => question && Number.isInteger(Number(question.id)))
      .map(normalizeClientQuestion)
      .filter((question) => question.question && question.options.length && isQuestionPublishable(question))
      .sort((a, b) => a.id - b.id);
  }

  function isQuestionPublishable(question) {
    if (!question.safeToShow || question.reviewedStatus === "rejected") return false;
    if (question.sourceType === "ai_generated" && question.reviewedStatus !== "approved") return false;
    return true;
  }

  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function formatCount(value) {
    return Number(value || 0).toLocaleString("en-IE");
  }

  function renderReviewNote(element, question) {
    if (!element) return;
    const parts = [`Content version ${PRODUCT_SUMMARY.contentVersion || "current"}.`];
    const reviewDate = formatReviewDate(question.reviewedAt);
    if (reviewDate) {
      const status = clean(question.reviewedStatus).replace(/_/g, " ");
      parts.push(`Last review: ${reviewDate}${status ? ` (${status})` : ""}.`);
    }
    parts.push("If something looks wrong, use Report a problem after answering.");
    element.textContent = parts.join(" ");
  }

  function formatReviewDate(value) {
    const raw = clean(value);
    if (!raw) return "";
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString("en-IE", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function normalizeScoreBreakdown(value) {
    if (!value || typeof value !== "object") return {};
    return {
      ...value,
      archived_hardest_signal: Number(value.archived_hardest_signal || 0),
      road_sign_or_image_signal: Number(value.road_sign_or_image_signal || 0),
      safety_critical_signal: Number(value.safety_critical_signal || 0),
      legal_consequence_signal: Number(value.legal_consequence_signal || 0),
      category_priority_signal: Number(value.category_priority_signal || 0),
      user_miss_rate_signal: Number(value.user_miss_rate_signal || 0),
    };
  }

  function labelForScore(score) {
    return scoreLabel(score);
  }

  function hydrateCategories() {
    const categories = Array.from(new Set(state.questions.map((question) => question.category))).sort();
    els.categorySelect.innerHTML = "";
    els.categorySelect.append(new Option("All categories", ""));
    categories.forEach((category) => els.categorySelect.append(new Option(category, category)));
  }

  function applyFilters() {
    let questions = state.questions.slice();

    if (!hasAccess() && state.mode === "revise") {
      questions = questions.slice(0, PREVIEW_LIMIT);
    }

    if (state.mode === "highYield") {
      questions = questions
        .filter((question) => question.priorityScore >= 68)
        .sort((a, b) => b.priorityScore - a.priorityScore || (a.hardestRank || 999) - (b.hardestRank || 999));
    }

    if (state.mode === "hardest") {
      questions = questions
        .filter((question) => question.hardestRank)
        .sort((a, b) => a.hardestRank - b.hardestRank);
    }

    if (state.mode === "signs") {
      questions = questions
        .filter((question) => question.isRoadSign)
        .sort((a, b) => b.priorityScore - a.priorityScore || a.id - b.id);
    }

    if (state.mode === "review") {
      const reviewIds = new Set([...state.progress.missed, ...state.progress.flagged]);
      questions = questions.filter((question) => reviewIds.has(question.id));
    }

    if (state.selectedCategory) {
      questions = questions.filter((question) => question.category === state.selectedCategory);
    }

    if (state.search) {
      questions = questions.filter((question) => {
        const haystack = [
          question.question,
          question.category,
          question.explanation,
          question.priorityLabel,
          question.studySignals.join(" "),
          question.options.map((option) => option.text).join(" "),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(state.search);
      });
    }

    state.filtered = questions;
  }

  async function setMode(mode) {
    const previousMode = state.mode;
    state.mode = mode;
    state.activeIndex = 0;
    if (mode !== "exam") {
      stopTimer();
      state.exam = null;
      els.examBar.classList.add("hidden");
    }
    updateModeButtons();

    let secureLoadFailed = false;
    if (mode !== "exam" && (!requiresAccess(mode) || hasAccess())) {
      try {
        await loadStudySessionForMode(mode, { allowPreviewFallback: mode === "revise" && !hasAccess() });
      } catch {
        secureLoadFailed = true;
      }
    } else {
      state.studySession = null;
      state.answerStateToken = "";
    }

    applyFilters();
    renderInsight();
    if (secureLoadFailed && requiresAccess(mode)) {
      renderPaywall();
      return;
    }
    render();
    if (previousMode !== mode) {
      trackEvent("mode_selected", {
        mode,
        previousMode,
        requiresAccess: requiresAccess(mode),
      });
    }
  }

  async function loadStudySessionForMode(mode, options = {}) {
    const premium = hasAccess();
    const reviewQuestionIds = mode === "review"
      ? [...state.progress.missed, ...state.progress.flagged]
      : [];

    try {
      const payload = await studyApi.startStudySession({
        mode,
        premium,
        category: state.selectedCategory,
        reviewQuestionIds,
      });
      applyStudySession(payload.session);
      setStatus(buildStudySessionStatus(payload.session));
      return payload.session;
    } catch (error) {
      state.studySession = null;
      state.answerStateToken = "";
      if (options.allowPreviewFallback) {
        setStatus(navigator.onLine
          ? "Preview loaded locally. Reconnect or retry if answer reveal is unavailable."
          : "Offline preview loaded. Reconnect to reveal answers.");
        return null;
      }
      setStatus(error.status === 401 || error.status === 402
        ? "Restore access to load premium questions from the secure server."
        : "Secure study session is unavailable right now.");
      throw error;
    }
  }

  function applyStudySession(session) {
    if (!session || !Array.isArray(session.questions)) return;
    state.studySession = session;
    state.answerStateToken = "";
    state.questions = normalizeQuestions(session.questions);
    state.activeIndex = 0;
  }

  function buildStudySessionStatus(session) {
    if (!session) return "Preview loaded.";
    const count = Number(session.questionCount || session.questions?.length || 0);
    const modeText = modeLabel(session.mode || state.mode).toLowerCase();
    return session.accessType === "premium"
      ? `Loaded ${count} ${modeText} questions from secure premium access.`
      : `Preview session loaded with ${Math.min(count, PREVIEW_LIMIT)} questions.`;
  }

  function updateModeButtons() {
    const modeButtons = [
      [els.modeRevise, "revise"],
      [els.modeHighYield, "highYield"],
      [els.modeHardest, "hardest"],
      [els.modeSigns, "signs"],
      [els.modeExam, "exam"],
      [els.modeReview, "review"],
    ];

    modeButtons.forEach(([button, mode]) => {
      if (!button) return;
      const isActive = state.mode === mode;
      const isLocked = requiresAccess(mode) && !hasAccess();
      button.classList.toggle("active", isActive);
      button.classList.toggle("is-locked", isLocked);
      button.setAttribute("aria-pressed", String(isActive));
      button.setAttribute("aria-label", `${modeLabel(mode)}: ${modeBenefit(mode)}${isLocked ? ". Premium mode" : ""}`);
    });

    document.querySelectorAll("[data-mode-button]").forEach((button) => {
      const isActive = button.dataset.mode === state.mode;
      const isLocked = requiresAccess(button.dataset.mode) && !hasAccess();
      button.classList.toggle("active", isActive);
      button.classList.toggle("is-locked", isLocked);
      button.setAttribute("aria-pressed", String(isActive));
      button.querySelectorAll("[data-premium-badge]").forEach((badge) => {
        badge.textContent = isLocked ? "Premium" : "Full";
      });
    });

    if (els.modeAccessLabel) {
      els.modeAccessLabel.textContent = hasAccess() ? "Full access" : "Preview";
    }

    if (els.mobileModeSelect && els.mobileModeSelect.value !== state.mode) {
      els.mobileModeSelect.value = state.mode;
    }
    if (els.mobileModeSummary) {
      const locked = requiresAccess(state.mode) && !hasAccess();
      els.mobileModeSummary.textContent = `${modeLabel(state.mode)} mode. ${modeBenefit(state.mode)}.${locked ? " Premium access required." : hasAccess() ? " Full access active." : " Free preview."}`;
    }
  }

  function modeLabel(mode) {
    return {
      revise: "Revise",
      highYield: "High-yield",
      hardest: "Hardest",
      signs: "Signs",
      exam: "Mock test",
      review: "Review",
    }[mode] || "Mode";
  }

  function modeBenefit(mode) {
    return {
      revise: "Work through the bank",
      highYield: "Focus on estimated priority",
      hardest: "Challenge weak spots",
      signs: "Drill road signs",
      exam: "40 questions, 45 minutes",
      review: "Clear missed and flagged",
    }[mode] || "";
  }

  function render() {
    updateStats();
    updateModeButtons();

    if (state.mode === "exam" && state.exam) {
      renderExamQuestion();
      return;
    }

    if (requiresAccess(state.mode) && !hasAccess()) {
      renderPaywall();
      return;
    }

    els.examBar.classList.add("hidden");
    if (!state.filtered.length) {
      renderEmpty(emptyMessage());
      return;
    }

    const question = state.filtered[Math.min(state.activeIndex, state.filtered.length - 1)];
    renderQuestion(question, {
      positionLabel: `${state.activeIndex + 1} of ${state.filtered.length}`,
      selectedIndex: null,
      onAnswer: (index, correct) => recordAnswer(question, index, correct),
      onNext: () => move(1),
      onPrevious: () => move(-1),
    });
  }

  function renderQuestion(question, config) {
    const fragment = els.template.content.cloneNode(true);
    const article = fragment.querySelector(".question-view");
    const category = fragment.querySelector(".category-pill");
    const priority = fragment.querySelector(".priority-pill");
    const highYieldBadge = fragment.querySelector(".high-yield-reason-badge");
    const priorityMeta = fragment.querySelector(".priority-meta");
    const reviewNote = fragment.querySelector(".question-review-note");
    const number = fragment.querySelector(".question-number");
    const title = fragment.querySelector(".question-title");
    const imageWrap = fragment.querySelector(".question-image-wrap");
    const image = fragment.querySelector(".question-image");
    const answerList = fragment.querySelector(".answer-list");
    const signalList = fragment.querySelector(".signal-list");
    const feedback = fragment.querySelector(".feedback");
    const flagBtn = fragment.querySelector(".flag-btn");
    const prevBtn = fragment.querySelector(".prev-btn");
    const nextBtn = fragment.querySelector(".next-btn");
    const finishExamBtn = fragment.querySelector(".finish-exam-inline-btn");

    category.textContent = question.category;
    priority.textContent = `${question.priorityLabel} ${question.priorityScore}`;
    priority.classList.add(`priority-${question.priorityLabel.toLowerCase()}`);
    number.textContent = `Question ${question.id} - ${config.positionLabel}`;
    title.textContent = question.question;
    article.classList.toggle("is-exam-question", Boolean(config.isExam));
    renderReviewNote(reviewNote, question);

    const metaParts = [];
    if (question.hardestRank) metaParts.push(`#${question.hardestRank} on archived hardest list`);
    if (question.communityCorrectRate !== null) metaParts.push(`${question.communityCorrectRate.toFixed(1)}% answered correctly`);
    if (question.isRoadSign) metaParts.push("visual/sign practice");
    priorityMeta.textContent = metaParts.join(" - ");

    const highYieldReasons = highYieldReasonItems(question);
    if (question.priorityScore >= 68 && highYieldReasons.length) {
      highYieldBadge.textContent = highYieldReasons[0].label;
      highYieldBadge.classList.remove("hidden");
    }

    const highYieldPanel = buildHighYieldPanel(question);
    if (highYieldPanel) {
      title.insertAdjacentElement("afterend", highYieldPanel);
    }

    if (question.images.length) {
      imageWrap.classList.remove("hidden");
      imageWrap.classList.add("image-loading");
      image.loading = "lazy";
      image.decoding = "async";
      image.fetchPriority = question.isRoadSign ? "high" : "auto";
      image.src = resolveImageSrc(question.images[0]);
      image.alt = `Image for question ${question.id}`;
      image.addEventListener("load", () => imageWrap.classList.remove("image-loading"), { once: true });
      image.addEventListener("error", () => {
        imageWrap.classList.remove("image-loading");
        imageWrap.classList.add("image-error");
      }, { once: true });
    }

    question.options.forEach((option, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "answer-option";
      const letter = String.fromCharCode(65 + index);
      button.innerHTML = `<strong aria-hidden="true">${letter}</strong><span class="answer-text"></span><span class="answer-state-label" aria-hidden="true"></span>`;
      button.querySelector(".answer-text").textContent = option.text;
      button.setAttribute("aria-label", `${letter}. ${option.text}`);
      button.addEventListener("click", async () => {
        if (article.dataset.answered === "true") return;
        article.dataset.answered = "true";
        setAnswerPending(answerList, index);
        try {
          const result = await revealAnswerFromServer(question, index);
          applyAnswerReveal(question, result);
          paintAnswers(answerList, question, index);
          showFeedback(feedback, question, index);
          config.onAnswer(index, result.correct);
          appendPreviewAnswerCta(feedback);
        } catch {
          article.dataset.answered = "false";
          setAnswerError(feedback);
          Array.from(answerList.children).forEach((item) => {
            item.disabled = false;
            item.classList.remove("selected");
          });
        }
      });
      answerList.append(button);
    });

    if (Number.isInteger(config.selectedIndex)) {
      article.dataset.answered = "true";
      paintAnswers(answerList, question, config.selectedIndex);
      showFeedback(feedback, question, config.selectedIndex);
    }

    renderSignals(signalList, question);

    const flagged = state.progress.flagged.has(question.id);
    flagBtn.textContent = flagged ? "Flagged for review" : "Flag for review";
    flagBtn.classList.toggle("flagged", flagged);
    flagBtn.addEventListener("click", () => {
      toggleFlag(question.id);
      render();
    });

    prevBtn.disabled = !canMove(-1);
    nextBtn.disabled = !canMove(1);
    prevBtn.addEventListener("click", config.onPrevious);
    nextBtn.addEventListener("click", config.onNext);
    if (config.isExam && config.onFinish) {
      finishExamBtn.classList.remove("hidden");
      finishExamBtn.addEventListener("click", config.onFinish);
    }

    els.questionMount.innerHTML = "";
    els.questionMount.append(fragment);
  }

  function renderSignals(signalList, question) {
    signalList.innerHTML = "";
    const signals = question.studySignals.slice(0, 6);
    if (!signals.length && !question.importanceNote) return;

    signals.forEach((signal) => {
      const tag = document.createElement("span");
      tag.textContent = signal;
      signalList.append(tag);
    });
  }

  function buildHighYieldPanel(question) {
    if (question.priorityScore < 68) return null;

    const reasons = highYieldReasonItems(question);
    if (!reasons.length) return null;

    const panel = document.createElement("section");
    panel.className = "why-high-yield";
    panel.setAttribute("aria-label", "Why high-yield");

    const title = document.createElement("strong");
    title.textContent = "Why high-yield?";

    const list = document.createElement("ul");
    reasons.slice(0, 5).forEach((reason) => {
      const item = document.createElement("li");
      const label = document.createElement("span");
      const detail = document.createElement("em");
      label.textContent = reason.label;
      detail.textContent = reason.detail;
      item.append(label, detail);
      list.append(item);
    });

    panel.append(title, list);
    return panel;
  }

  function highYieldReasonItems(question) {
    const breakdown = question.scoreBreakdown || {};
    const reasons = [];

    if (breakdown.archived_hardest_signal > 0 || breakdown.user_miss_rate_signal > 0) {
      const detail = question.communityCorrectRate !== null
        ? `${question.communityCorrectRate.toFixed(1)}% archived correct rate`
        : "Archived hardest or saved miss-rate signal";
      reasons.push({ label: "Commonly missed", detail });
    }

    if (breakdown.road_sign_or_image_signal > 0 || question.isRoadSign) {
      reasons.push({ label: "Road sign/image", detail: "Visual or road-marking practice" });
    }

    if (breakdown.safety_critical_signal > 0) {
      reasons.push({ label: "Safety-critical", detail: "Hazard, control, vulnerable-road-user, or emergency wording" });
    }

    if (breakdown.legal_consequence_signal > 0) {
      reasons.push({ label: "Legal/rules", detail: "Rules, signs, markings, duties, or restrictions wording" });
    }

    if (!reasons.length && breakdown.category_priority_signal > 0) {
      reasons.push({ label: "Core category", detail: "Weighted as a core study area" });
    }

    return reasons;
  }

  function paintAnswers(answerList, question, selectedIndex) {
    Array.from(answerList.children).forEach((button, index) => {
      button.disabled = true;
      const option = question.options[index];
      const selected = index === selectedIndex;
      const correct = Boolean(option.isCorrect);
      const stateLabel = button.querySelector(".answer-state-label");
      button.classList.remove("pending");
      button.classList.toggle("selected", selected);
      button.classList.toggle("correct", correct);
      button.classList.toggle("wrong", selected && !correct);
      if (stateLabel) {
        stateLabel.textContent = selected && correct
          ? "Selected, correct"
          : selected && !correct
            ? "Selected, not correct"
            : correct
              ? "Correct answer"
              : "";
      }
      const letter = String.fromCharCode(65 + index);
      const resultText = stateLabel?.textContent ? `. ${stateLabel.textContent}` : "";
      button.setAttribute("aria-label", `${letter}. ${option.text}${resultText}`);
    });
  }

  function setAnswerPending(answerList, selectedIndex) {
    Array.from(answerList.children).forEach((button, index) => {
      button.disabled = true;
      button.classList.toggle("selected", index === selectedIndex);
      button.classList.toggle("pending", index === selectedIndex);
      button.classList.remove("correct", "wrong");
      const stateLabel = button.querySelector(".answer-state-label");
      if (stateLabel) stateLabel.textContent = index === selectedIndex ? "Checking answer" : "";
    });
  }

  function setAnswerError(feedback) {
    feedback.classList.remove("hidden", "is-correct");
    feedback.classList.add("is-wrong");
    if (els.answerLiveRegion) {
      els.answerLiveRegion.textContent = "Could not reveal that answer. Reconnect or restore access, then try again.";
    }
    feedback.innerHTML = `
      <div class="feedback-header">
        <span class="feedback-status-icon" aria-hidden="true">!</span>
        <div>
          <strong>Could not reveal that answer</strong>
          <p>Reconnect or restore access, then try again. Correct answers are checked securely after submission.</p>
        </div>
      </div>
    `;
  }

  async function revealAnswerFromServer(question, selectedIndex) {
    const mode = state.exam ? "exam" : state.mode;
    if (!state.studySession || !sessionIncludesQuestion(state.studySession, question.id)) {
      await loadStudySessionForMode(mode, { allowPreviewFallback: mode === "revise" && !hasAccess() });
    }

    if (!state.studySession || !sessionIncludesQuestion(state.studySession, question.id)) {
      const error = new Error("Study session is not ready");
      error.status = 503;
      throw error;
    }

    const payload = await studyApi.submitAnswer(state.studySession.id, {
      questionId: question.id,
      selectedIndex,
      answerStateToken: state.answerStateToken,
    });
    state.answerStateToken = payload.answerStateToken || state.answerStateToken;
    return payload.result;
  }

  function sessionIncludesQuestion(session, questionId) {
    return Array.isArray(session?.questions) && session.questions.some((item) => Number(item.id) === Number(questionId));
  }

  function showFeedback(feedback, question, selectedIndex) {
    const selected = question.options[selectedIndex];
    const correct = selected && selected.isCorrect;
    feedback.classList.remove("hidden");
    feedback.classList.toggle("is-correct", Boolean(correct));
    feedback.classList.toggle("is-wrong", !correct);
    feedback.setAttribute("tabindex", "-1");
    feedback.closest(".question-view")?.classList.add(correct ? "answered-correct" : "answered-wrong");
    feedback.innerHTML = "";
    announceAnswerResult(correct, question, selected);

    const header = document.createElement("div");
    header.className = "feedback-header";

    const icon = document.createElement("span");
    icon.className = "feedback-status-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = correct ? "OK" : "!";

    const titleWrap = document.createElement("div");
    const heading = document.createElement("strong");
    heading.textContent = correct ? "Correct" : "Not quite";
    const subheading = document.createElement("p");
    subheading.textContent = correct
      ? "Good answer. Now lock in the rule so it sticks."
      : `Saved correct answer: ${question.correctAnswer}`;
    titleWrap.append(heading, subheading);
    header.append(icon, titleWrap);
    feedback.append(header);

    const explanation = document.createElement("p");
    explanation.className = "feedback-explanation";
    explanation.textContent = buildCoachingExplanation(question, selected, correct);
    feedback.append(explanation);

    const why = document.createElement("p");
    why.className = "feedback-why";
    why.innerHTML = `<strong>Why this matters:</strong> <span></span>`;
    why.querySelector("span").textContent = buildWhyThisMatters(question, correct);

    const details = document.createElement("details");
    details.className = "feedback-details";
    const summary = document.createElement("summary");
    summary.textContent = "More coaching details";
    details.append(summary, why);

    if (question.coachVisuals.length) {
      const visual = document.createElement("figure");
      visual.className = "feedback-coach-visual";
      const visualImage = document.createElement("img");
      visualImage.loading = "lazy";
      visualImage.decoding = "async";
      visualImage.src = "./" + question.coachVisuals[0].replace(/\\/g, "/");
      visualImage.alt = `Coach visual for question ${question.id}`;
      const caption = document.createElement("figcaption");
      caption.textContent = "Coach visual";
      visual.append(visualImage, caption);
      details.append(visual);
    }

    const memoryTip = buildMemoryTip(question);
    if (memoryTip) {
      const tip = document.createElement("section");
      tip.className = "feedback-tip";
      tip.innerHTML = "<strong>Memory tip</strong><p></p>";
      tip.querySelector("p").textContent = memoryTip;
      details.append(tip);
    }

    const reasonPanel = buildFeedbackHighYieldPanel(question);
    if (reasonPanel) details.append(reasonPanel);

    appendAiExplanationControls(details, question, selectedIndex);
    feedback.append(details);
    appendFeedbackActions(feedback, question, selectedIndex);
    focusFeedbackAfterAnswer(feedback);
  }

  function announceAnswerResult(correct, question, selected) {
    if (!els.answerLiveRegion) return;
    const chosen = selected?.text ? ` You selected: ${selected.text}.` : "";
    const correctText = question.correctAnswer ? ` Correct answer: ${question.correctAnswer}.` : "";
    els.answerLiveRegion.textContent = correct
      ? `Correct.${chosen}`
      : `Not quite.${chosen}${correctText}`;
  }

  function focusFeedbackAfterAnswer(feedback) {
    if (lastInputModality !== "keyboard") return;
    window.setTimeout(() => feedback.focus({ preventScroll: true }), 0);
  }

  function buildCoachingExplanation(question, selected, correct) {
    const explanation = firstMeaningfulSentence(question.explanation, 280);
    if (explanation) return explanation;

    if (correct) {
      return "Your answer matches the saved correct answer. Keep practising the rule, not just the wording.";
    }

    return shortText(
      `You chose ${selected?.text || "that option"}. Compare it with ${question.correctAnswer || "the saved correct answer"} and look for the rule or safety detail that changes the answer.`,
      280
    );
  }

  function buildWhyThisMatters(question, correct) {
    const reasons = highYieldReasonItems(question);
    const labels = reasons.map((reason) => reason.label.toLowerCase());

    if (labels.includes("road sign/image")) {
      return "Visual questions reward quick recognition, so repeat the image or road-marking cue until it feels automatic.";
    }

    if (labels.includes("safety-critical")) {
      return "Safety-critical wording is about the safest action first, especially where other road users may be affected.";
    }

    if (labels.includes("legal/rules")) {
      return "Rules questions often turn on exact words like must, should, first, only, and except.";
    }

    if (labels.includes("commonly missed")) {
      return "This is estimated high-yield because learners often miss this kind of wording in archived practice data.";
    }

    return correct
      ? "You are building recognition. Repeat the same rule in a few different questions so it transfers."
      : "A wrong answer is useful here: save the rule, then clear it again in review mode.";
  }

  function buildMemoryTip(question) {
    if (question.memoryTip) return question.memoryTip;

    const signals = question.studySignals || [];
    if (signals.some((signal) => /must|never|only|except|first/i.test(signal))) {
      return "Slow down on absolute words like must, never, only, except, and first before choosing.";
    }

    if (question.isRoadSign || signals.some((signal) => /sign|marking|visual/i.test(signal))) {
      return "Name the sign or marking in your head first, then choose the action it requires.";
    }

    if (signals.some((signal) => /emergency|danger|hazard|safe|risk/i.test(signal))) {
      return "When the wording mentions danger or risk, choose the option that reduces risk before convenience.";
    }

    if (question.category) {
      return `For ${question.category} questions, identify the rule being tested before comparing the options.`;
    }

    return "";
  }

  function buildFeedbackHighYieldPanel(question) {
    const reasons = highYieldReasonItems(question).slice(0, 4);
    if (question.priorityScore < 68 || !reasons.length) return null;

    const panel = document.createElement("section");
    panel.className = "feedback-high-yield";
    panel.setAttribute("aria-label", "Estimated high-yield reasons");

    const title = document.createElement("strong");
    title.textContent = "Estimated high-yield signals";
    const list = document.createElement("div");
    list.className = "feedback-reason-list";

    reasons.forEach((reason) => {
      const item = document.createElement("span");
      item.innerHTML = "<strong></strong><em></em>";
      item.querySelector("strong").textContent = reason.label;
      item.querySelector("em").textContent = reason.detail;
      list.append(item);
    });

    panel.append(title, list);
    return panel;
  }

  function firstMeaningfulSentence(value, maxLength = 240) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (!text) return "";

    const sentence = text.match(/^(.+?[.!?])(\s|$)/);
    return shortText(sentence ? sentence[1] : text, maxLength);
  }

  function shortText(value, maxLength = 240) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (text.length <= maxLength) return text;

    const clipped = text.slice(0, maxLength - 3);
    const lastSpace = clipped.lastIndexOf(" ");
    return `${clipped.slice(0, lastSpace > 80 ? lastSpace : clipped.length).trim()}...`;
  }

  function appendFeedbackActions(feedback, question, selectedIndex) {
    if (feedback.querySelector(".feedback-next-actions")) return;

    const actions = document.createElement("div");
    actions.className = "feedback-next-actions";

    const nextButton = document.createElement("button");
    nextButton.type = "button";
    nextButton.className = "primary";
    nextButton.textContent = "Next question";
    nextButton.disabled = !canMove(1);
    nextButton.addEventListener("click", () => move(1));
    actions.append(nextButton);

    const reviewButton = document.createElement("button");
    reviewButton.type = "button";
    reviewButton.className = "secondary";
    reviewButton.textContent = "Review missed";
    const currentAnswerIsWrong = !question.options[selectedIndex]?.isCorrect;
    reviewButton.disabled = state.exam ? true : state.progress.missed.size === 0 && !currentAnswerIsWrong;
    reviewButton.addEventListener("click", () => setMode("review"));
    actions.append(reviewButton);

    const reportButton = document.createElement("button");
    reportButton.type = "button";
    reportButton.className = "ghost feedback-report-action";
    reportButton.textContent = "Report a problem";
    reportButton.addEventListener("click", () => showQuestionReportForm(feedback, question));
    actions.append(reportButton);

    const attemptsAfterThisAnswer = totalAttemptCount() + 1;
    if (!state.exam && state.questions.length >= EXAM_SIZE && attemptsAfterThisAnswer >= DAILY_TARGET) {
      const mockButton = document.createElement("button");
      mockButton.type = "button";
      mockButton.className = "secondary feedback-mock-action";
      mockButton.textContent = "Start mock test";
      mockButton.addEventListener("click", startExam);
      actions.append(mockButton);
    }

    feedback.append(actions);
  }

  function showQuestionReportForm(feedback, question) {
    const existing = feedback.querySelector(".question-report");
    if (existing) {
      existing.querySelector("select")?.focus();
      return;
    }

    const panel = document.createElement("section");
    panel.className = "question-report";
    panel.setAttribute("aria-label", "Report a problem with this question");

    const title = document.createElement("strong");
    title.textContent = "Report a problem with this question";
    const copy = document.createElement("p");
    copy.textContent = "Tell us what looks wrong. A reviewer can inspect the question, answer options, image, category, or explanation.";

    const form = document.createElement("form");
    form.className = "question-report-form";

    const reasonLabel = document.createElement("label");
    reasonLabel.className = "field";
    reasonLabel.innerHTML = "<span>Problem type</span>";
    const reason = document.createElement("select");
    [
      ["answer", "Saved answer"],
      ["wording", "Question wording"],
      ["image", "Image or sign"],
      ["explanation", "Explanation"],
      ["category", "Category"],
      ["technical", "Technical issue"],
      ["other", "Other"],
    ].forEach(([value, label]) => reason.append(new Option(label, value)));
    reasonLabel.append(reason);

    const commentLabel = document.createElement("label");
    commentLabel.className = "field";
    commentLabel.innerHTML = "<span>Comment optional</span>";
    const comment = document.createElement("textarea");
    comment.rows = 3;
    comment.maxLength = 1200;
    comment.placeholder = "What should the reviewer check?";
    commentLabel.append(comment);

    const status = document.createElement("p");
    status.className = "question-report-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");

    const actions = document.createElement("div");
    actions.className = "review-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "secondary";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => panel.remove());
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "primary";
    submit.textContent = "Send report";
    actions.append(cancel, submit);

    form.append(reasonLabel, commentLabel, actions, status);
    form.addEventListener("submit", (event) => submitQuestionReport(event, question, form, status, submit));
    panel.append(title, copy, form);
    feedback.append(panel);
    reason.focus();
  }

  async function submitQuestionReport(event, question, form, status, submitButton) {
    event.preventDefault();
    const formReason = form.querySelector("select")?.value || "other";
    const comment = form.querySelector("textarea")?.value || "";

    status.textContent = "Sending report...";
    status.className = "question-report-status sending";
    submitButton.disabled = true;

    try {
      const response = await fetch("/api/question-feedback", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: question.id,
          reasonCategory: formReason,
          comment,
          appVersion: PRODUCT_SUMMARY.productVersion || "",
          contentVersion: PRODUCT_SUMMARY.contentVersion || "",
          anonymousId: state.analytics.anonymousId,
          reviewState: question.duplicateReviewStatus || question.reviewedStatus || "open",
        }),
      });

      if (!response.ok) {
        const error = new Error("question_report_failed");
        error.status = response.status;
        throw error;
      }

      status.textContent = "Thanks. This is now in the review queue.";
      status.className = "question-report-status sent";
      form.querySelectorAll("input, select, textarea, button").forEach((control) => {
        control.disabled = true;
      });
    } catch (error) {
      status.textContent = Number(error?.status) === 429
        ? "Too many reports right now. Please wait a moment and try again."
        : "Could not send that report. Try again in a moment.";
      status.className = Number(error?.status) === 429
        ? "question-report-status rate-limited"
        : "question-report-status error";
      submitButton.disabled = false;
    }
  }

  function appendAiExplanationControls(feedback, question, selectedIndex) {
    if (!Number.isInteger(selectedIndex) || !question.options[selectedIndex]) return;

    const wrapper = document.createElement("div");
    wrapper.className = "ai-explain";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "ai-explain-btn";
    button.textContent = "Explain this simply";

    const panel = document.createElement("div");
    panel.className = "ai-explain-panel hidden";
    panel.setAttribute("aria-live", "polite");

    button.addEventListener("click", () => loadAiExplanation(question, selectedIndex, button, panel));
    wrapper.append(button, panel);
    feedback.append(wrapper);
  }

  async function loadAiExplanation(question, selectedIndex, button, panel) {
    if (button.dataset.loading === "true") return;

    button.dataset.loading = "true";
    button.disabled = true;
    button.textContent = "Explaining simply...";
    renderAiExplanationStatus(panel, "Building a simple coach note.", "loading");

    try {
      const response = await fetch("/api/ai-explain", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildAiExplanationPayload(question, selectedIndex)),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok || !payload.ok) {
        const error = new Error(payload.error || "Could not load explanation.");
        error.status = response.status;
        throw error;
      }

      renderAiExplanation(panel, payload.explanation, {
        cached: Boolean(payload.cached),
        fallback: Boolean(payload.fallback),
      });
      button.textContent = payload.cached
        ? "Cached explanation"
        : payload.fallback
          ? "Fallback ready"
          : "Explanation ready";
    } catch (error) {
      renderAiExplanationStatus(panel, safeAiErrorMessage(error), "error");
      button.disabled = false;
      button.textContent = "Explain this simply";
    } finally {
      button.dataset.loading = "false";
    }
  }

  function buildAiExplanationPayload(question, selectedIndex) {
    const selected = question.options[selectedIndex];
    const correctOption = question.options.find((option) => option.isCorrect);

    return {
      questionId: question.id,
      questionText: question.question,
      answerChoices: question.options.map((option) => option.text),
      correctAnswer: question.correctAnswer || correctOption?.text || "",
      selectedAnswer: selected?.text || "",
      selectedIndex,
      category: question.category,
    };
  }

  function renderAiExplanation(panel, explanation, meta = {}) {
    panel.classList.remove("hidden", "error", "status");
    panel.classList.toggle("cached", Boolean(meta.cached));
    panel.classList.toggle("fallback", Boolean(meta.fallback));
    panel.innerHTML = "";

    const metaRow = document.createElement("div");
    metaRow.className = "ai-explain-meta";
    const metaTitle = document.createElement("strong");
    metaTitle.textContent = "Simple explanation";
    const badge = document.createElement("span");
    badge.textContent = meta.fallback ? "Fallback coach note" : meta.cached ? "Cached" : "Fresh";
    metaRow.append(metaTitle, badge);
    panel.append(metaRow);

    if (meta.fallback) {
      const fallbackNote = document.createElement("p");
      fallbackNote.className = "ai-explain-note";
      fallbackNote.textContent = "AI is unavailable right now, so this uses the saved answer and supplied question content.";
      panel.append(fallbackNote);
    }

    [
      ["Simple version", explanation.shortExplanation],
      ["Your answer", explanation.selectedAnswerReview],
      ["Memory tip", explanation.memoryTip],
    ].forEach(([label, text]) => {
      if (!text) return;
      const section = document.createElement("div");
      section.className = "ai-explain-section";
      const title = document.createElement("strong");
      title.textContent = label;
      const body = document.createElement("p");
      body.textContent = text;
      section.append(title, body);
      panel.append(section);
    });

    const tags = Array.isArray(explanation.relatedTopicTags) ? explanation.relatedTopicTags : [];
    if (tags.length) {
      const tagList = document.createElement("div");
      tagList.className = "ai-tag-list";
      tags.slice(0, 5).forEach((tag) => {
        const item = document.createElement("span");
        item.textContent = tag;
        tagList.append(item);
      });
      panel.append(tagList);
    }
  }

  function renderAiExplanationStatus(panel, message, tone) {
    panel.classList.remove("hidden", "cached", "fallback");
    panel.classList.toggle("error", tone === "error");
    panel.classList.toggle("status", tone !== "error");
    panel.innerHTML = "";

    const status = document.createElement("div");
    status.className = "ai-explain-loading";
    status.textContent = message;
    panel.append(status);
  }

  function safeAiErrorMessage(error) {
    const status = Number(error?.status || 0);
    const message = String(error?.message || "");
    if (status === 429 || /too many|rate limit/i.test(message)) {
      return "Too many explanation requests. Try again later.";
    }
    return "Could not load an explanation right now. Try again in a moment.";
  }

  function appendPreviewAnswerCta(feedback) {
    if (hasAccess() || state.mode !== "revise" || totalAttemptCount() < 4) return;
    if (feedback.querySelector(".preview-answer-cta")) return;

    const remainingQuestions = Math.max(0, positiveNumber(PRODUCT_SUMMARY.totalPublishedQuestions, state.questions.length) - PREVIEW_LIMIT);
    const cta = document.createElement("div");
    cta.className = "preview-answer-cta";

    const copy = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = "You have the rhythm now.";
    const body = document.createElement("p");
    body.textContent = `Unlock the full coach to move from ${PREVIEW_LIMIT} preview questions to ${remainingQuestions} more questions, weak-area review, road signs, and 40-question mocks.`;
    copy.append(title, body);

    const actions = document.createElement("div");
    actions.className = "preview-answer-actions";

    const unlockButton = document.createElement("button");
    unlockButton.type = "button";
    unlockButton.className = "primary";
    unlockButton.textContent = "Unlock full coach";
    unlockButton.addEventListener("click", () => startCheckout("post_answer"));

    const restoreLink = document.createElement("a");
    restoreLink.href = "#restoreEmail";
    restoreLink.textContent = "Restore access";
    restoreLink.addEventListener("click", (event) => focusRestoreAccess(event, "post_answer"));

    actions.append(unlockButton, restoreLink);
    cta.append(copy, actions);
    feedback.append(cta);
  }

  function recordAnswer(question, selectedIndex, serverCorrect) {
    const isCorrect = typeof serverCorrect === "boolean"
      ? serverCorrect
      : Boolean(question.options[selectedIndex] && question.options[selectedIndex].isCorrect);
    const today = dayKey();
    const beforeToday = state.progress.daily[today] || 0;
    const beforeCategory = getCategorySnapshot(question.category);
    const attemptEvent = createAttemptEvent(question, selectedIndex, isCorrect);
    trackQuestionAnswer(question, selectedIndex, isCorrect);
    const existing = state.progress.answers[String(question.id)] || { attempts: 0, correct: 0, wrong: 0 };
    existing.attempts += 1;
    existing.correct += isCorrect ? 1 : 0;
    existing.wrong += isCorrect ? 0 : 1;
    state.progress.answers[String(question.id)] = existing;

    if (isCorrect) {
      state.progress.missed.delete(question.id);
    } else {
      state.progress.missed.add(question.id);
    }

    if (state.exam) {
      state.exam.answers[String(question.id)] = selectedIndex;
    }

    state.progress.daily[today] = beforeToday + 1;
    state.progress.pendingAttempts.push(attemptEvent);
    state.categorySummary = [];
    saveProgress();
    syncPendingAttempts();
    updateStats();
    maybeCelebrateAnswerProgress(question, isCorrect, beforeToday, state.progress.daily[today], beforeCategory, getCategorySnapshot(question.category));
  }

  function maybeCelebrateAnswerProgress(question, isCorrect, beforeToday, afterToday, beforeCategory, afterCategory) {
    const today = dayKey();
    if (beforeToday < DAILY_TARGET && afterToday >= DAILY_TARGET && state.celebrations.dailyTarget !== today) {
      state.celebrations.dailyTarget = today;
      showCelebration("Daily target complete", "25 answers logged today. Nice momentum for the next short review round.");
    }

    const category = question.category || "";
    const categoryKey = `${today}:${category}`;
    if (
      isCorrect &&
      category &&
      beforeCategory.answered >= 3 &&
      beforeCategory.accuracy < 70 &&
      afterCategory.accuracy >= 70 &&
      !state.celebrations.weakCategories.has(categoryKey)
    ) {
      state.celebrations.weakCategories.add(categoryKey);
      showCelebration("Weak category improved", `${category} is trending stronger now. Keep one more short round going.`);
    }
  }

  function getCategorySnapshot(category) {
    const target = category || "Uncategorised";
    const questionById = buildQuestionMap();
    return Object.entries(state.progress.answers).reduce(
      (snapshot, [questionId, answer]) => {
        const question = questionById.get(Number(questionId));
        if ((question?.category || "Uncategorised") !== target) return snapshot;
        snapshot.answered += Number(answer.attempts || 0);
        snapshot.correct += Number(answer.correct || 0);
        snapshot.accuracy = snapshot.answered ? Math.round((snapshot.correct / snapshot.answered) * 100) : 0;
        return snapshot;
      },
      { answered: 0, correct: 0, accuracy: 0 }
    );
  }

  function move(delta) {
    if (!canMove(delta)) return;
    if (state.exam) {
      state.exam.index += delta;
      renderExamQuestion();
      return;
    }
    state.activeIndex += delta;
    render();
  }

  function canMove(delta) {
    if (state.exam) {
      const next = state.exam.index + delta;
      return next >= 0 && next < state.exam.questions.length;
    }
    const next = state.activeIndex + delta;
    return next >= 0 && next < state.filtered.length;
  }

  async function startExam() {
    if (!hasAccess()) {
      state.mode = "exam";
      updateModeButtons();
      renderPaywall();
      scrollQuestionIntoView();
      return;
    }

    state.mode = "exam";
    updateModeButtons();
    renderLoading("Starting secure mock test...");

    try {
      await loadStudySessionForMode("exam");
    } catch {
      renderEmpty("Secure mock test is unavailable. Restore access or try again in a moment.");
      scrollQuestionIntoView();
      return;
    }

    if (state.questions.length < EXAM_SIZE) {
      renderEmpty(`Need at least ${EXAM_SIZE} questions before a mock test can start.`);
      return;
    }

    const startedAt = state.studySession?.startedAt
      ? Date.parse(state.studySession.startedAt)
      : Date.now();
    const durationSeconds = positiveNumber(state.studySession?.durationSeconds, EXAM_SECONDS);
    state.exam = {
      questions: state.questions.slice(0, EXAM_SIZE),
      index: 0,
      answers: {},
      startedAt,
      endsAt: startedAt + durationSeconds * 1000,
    };
    trackEvent("mock_started", {
      questionCount: state.exam.questions.length,
      category: state.selectedCategory || "All categories",
    });
    updateModeButtons();
    startTimer();
    renderInsight();
    renderExamQuestion();
    scrollQuestionIntoView();
  }

  function scrollQuestionIntoView() {
    els.questionMount?.scrollIntoView({ behavior: "auto", block: "start" });
  }

  function buildExam(pool) {
    if (state.selectedCategory) {
      return shuffle(pool).slice(0, EXAM_SIZE);
    }

    const selected = [];
    const used = new Set();
    CATEGORY_MIX.forEach(([needle, count]) => {
      const matches = pool.filter((question) => question.category.toLowerCase().includes(needle.toLowerCase()));
      takeQuestions(matches, count, selected, used);
    });

    takeQuestions(pool, EXAM_SIZE - selected.length, selected, used);
    return shuffle(selected).slice(0, EXAM_SIZE);
  }

  function takeQuestions(pool, count, selected, used) {
    const weighted = shuffle(pool)
      .filter((question) => !used.has(question.id))
      .sort((a, b) => b.priorityScore - a.priorityScore);
    weighted.slice(0, Math.max(0, count)).forEach((question) => {
      used.add(question.id);
      selected.push(question);
    });
  }

  function renderExamQuestion() {
    if (!state.exam) {
      renderEmpty("Start a mock test when you are ready.");
      return;
    }

    els.examBar.classList.remove("hidden");
    const question = state.exam.questions[state.exam.index];
    const selected = state.exam.answers[String(question.id)];
    els.examProgress.textContent = `Question ${state.exam.index + 1} of ${state.exam.questions.length}`;
    updateTimer();
    renderQuestion(question, {
      positionLabel: `${state.exam.index + 1} of ${state.exam.questions.length}`,
      selectedIndex: Number.isInteger(selected) ? selected : null,
      isExam: true,
      onAnswer: (index, correct) => recordAnswer(question, index, correct),
      onNext: () => move(1),
      onPrevious: () => move(-1),
      onFinish: finishExam,
    });
  }

  async function finishExam() {
    if (!state.exam) return;
    stopTimer();

    const answers = state.exam.answers;
    let serverResult = null;
    if (state.studySession?.id) {
      try {
        serverResult = await studyApi.completeStudySession(state.studySession.id, {
          answerStateToken: state.answerStateToken,
        });
      } catch {
        setStatus("Could not confirm the mock score with the secure server. Showing local revealed progress.");
      }
    }

    let correct = 0;
    state.exam.questions.forEach((question) => {
      const selected = answers[String(question.id)];
      if (Number.isInteger(selected) && question.options[selected] && question.options[selected].isCorrect) {
        correct += 1;
      } else {
        state.progress.missed.add(question.id);
      }
    });

    correct = Number.isInteger(serverResult?.score) ? serverResult.score : correct;
    const resultTotal = Number.isInteger(serverResult?.total) ? serverResult.total : EXAM_SIZE;
    const answeredCount = Number.isInteger(serverResult?.answered) ? serverResult.answered : Object.keys(answers).length;
    const passed = typeof serverResult?.passed === "boolean" ? serverResult.passed : correct >= PASS_MARK;
    recordMockResult(correct, passed, answeredCount);
    saveProgress();
    trackEvent("mock_completed", {
      score: correct,
      total: resultTotal,
      passed,
      answered: answeredCount,
      durationSeconds: Math.max(0, Math.round((Date.now() - state.exam.startedAt) / 1000)),
    });
    const byCategory = {};
    state.exam.questions.forEach((question) => {
      const selected = answers[String(question.id)];
      const ok = Number.isInteger(selected) && question.options[selected] && question.options[selected].isCorrect;
      byCategory[question.category] = byCategory[question.category] || { total: 0, correct: 0 };
      byCategory[question.category].total += 1;
      byCategory[question.category].correct += ok ? 1 : 0;
    });

    els.examBar.classList.add("hidden");
    els.questionMount.innerHTML = `
      <section class="question-view">
        <div class="question-meta">
          <span class="category-pill">${passed ? "Pass" : "Keep practising"}</span>
          <span class="priority-pill ${passed ? "priority-high" : "priority-critical"}">${correct}/${resultTotal}</span>
          <span class="question-number">Mock test result</span>
        </div>
        <h2 class="question-title">${passed ? "You hit the pass mark." : "Close the gaps and go again."}</h2>
        <p class="result-copy">${passed ? "You reached 35 out of 40. Keep drilling estimated high-yield questions so your practice stays consistent." : "The practice pass mark is 35. Review missed questions, then try another mock test."}</p>
        <div class="result-list" id="resultList"></div>
        <div class="question-actions">
          <button id="reviewMissedBtn" type="button">Review missed</button>
          <button id="newExamBtn" class="primary" type="button">New mock test</button>
        </div>
      </section>
    `;

    const resultList = document.getElementById("resultList");
    Object.entries(byCategory)
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([category, result]) => {
        const row = document.createElement("div");
        row.className = "result-row";
        row.innerHTML = `<span></span><strong>${result.correct}/${result.total}</strong>`;
        row.querySelector("span").textContent = category;
        resultList.append(row);
      });

    document.getElementById("reviewMissedBtn").addEventListener("click", () => setMode("review"));
    document.getElementById("newExamBtn").addEventListener("click", startExam);
    state.exam = null;
    state.studySession = null;
    state.answerStateToken = "";
    updateStats();
    if (passed) {
      const mockKey = `${dayKey()}:${correct}:${Date.now()}`;
      state.celebrations.mockPass = mockKey;
      showCelebration("Mock pass mark reached", `You scored ${correct}/${EXAM_SIZE}. Repeat it once more to make the routine feel solid.`);
    }
  }

  function recordMockResult(score, passed, answered) {
    const results = Array.isArray(state.progress.mockResults) ? state.progress.mockResults.slice() : [];
    results.unshift({
      score,
      total: EXAM_SIZE,
      passed: Boolean(passed),
      answered,
      finishedAt: new Date().toISOString(),
    });
    state.progress.mockResults = results.slice(0, 10);
  }

  function renderInsight() {
    if (!state.questions.length) {
      els.insightBar.classList.add("hidden");
      return;
    }

    const highYield = positiveNumber(PRODUCT_SUMMARY.estimatedPriorityQuestionCount, state.questions.filter((question) => question.priorityScore >= 68).length);
    const critical = positiveNumber(PRODUCT_SUMMARY.criticalQuestionCount, state.questions.filter((question) => question.priorityScore >= 82).length);
    const hardest = state.questions.filter((question) => question.hardestRank).length;
    const signs = positiveNumber(PRODUCT_SUMMARY.signOrImageQuestionCount, state.questions.filter((question) => question.isRoadSign).length);
    els.insightBar.classList.toggle("hidden", state.mode === "exam" && Boolean(state.exam));
    els.insightTitle.textContent = modeTitle();
    els.insightCopy.textContent = `${highYield} estimated high-yield questions, ${critical} critical, ${hardest} archived hardest, ${signs} road-sign/image drills. Scores estimate study priority, not official exam frequency.`;
    renderAccess();
  }

  function modeTitle() {
    if (state.mode === "highYield") return "High-yield drill";
    if (state.mode === "hardest") return "Archived hardest questions";
    if (state.mode === "signs") return "Road signs and visual judgement";
    if (state.mode === "review") return "Your missed and flagged queue";
    if (state.mode === "exam") return "Mock test mode";
    return "Study map";
  }

  function emptyMessage() {
    if (state.mode === "review") return "No missed or flagged questions yet.";
    if (state.mode === "hardest") return "No archived hardest-question signals match these filters.";
    if (state.mode === "signs") return "No road-sign questions match these filters.";
    if (state.mode === "highYield") return "No estimated high-yield questions match these filters.";
    return "No questions match the current filters.";
  }

  function requiresAccess(mode) {
    return ["highYield", "hardest", "signs", "exam", "review"].includes(mode);
  }

  function renderPaywall() {
    stopTimer();
    state.exam = null;
    els.examBar.classList.add("hidden");
    trackEvent("paywall_viewed", { mode: state.mode, source: "locked_mode" });
    const fragment = els.paywallTemplate.content.cloneNode(true);
    const button = fragment.querySelector(".paywall-checkout-btn");
    button.addEventListener("click", () => startCheckout("paywall"));
    els.questionMount.innerHTML = "";
    els.questionMount.append(fragment);
    renderAccess();
    els.mobileStickyCta.classList.add("hidden");
    document.body.classList.remove("has-mobile-access-prompt");
  }

  async function startCheckout(source = "unknown") {
    const planKey = currentCheckoutPlan().key;
    const referralCode = state.referral.code || "";
    trackEvent("checkout_clicked", {
      source: cleanAnalyticsText(source),
      mode: state.mode,
      planKey,
      referralCode,
    });
    if (referralCode) {
      trackEvent("referral_checkout_started", { source: cleanAnalyticsText(source), planKey });
    }
    setCheckoutLoading(true);
    try {
      const response = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planKey,
          referralCode,
          anonymousId: state.analytics.anonymousId,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.url) {
        throw new Error(payload.error || "Could not open checkout");
      }
      window.location.href = payload.url;
    } catch (error) {
      setStatus(`Checkout error: ${error.message}`);
      setCheckoutLoading(false);
    }
  }

  function setCheckoutLoading(isLoading) {
    const checkoutButtons = [
      [els.checkoutBtn, checkoutCtaText()],
      [els.heroCheckoutBtn, "Unlock full coach"],
      [els.stickyCheckoutBtn, "Unlock full coach"],
    ];
    document.querySelectorAll(".paywall-checkout-btn").forEach((button) => {
      checkoutButtons.push([button, "Unlock full coach"]);
    });
    document.querySelectorAll(".preview-answer-cta .primary").forEach((button) => {
      checkoutButtons.push([button, "Unlock full coach"]);
    });

    document.body.classList.toggle("checkout-loading", isLoading);
    checkoutButtons.forEach(([button, readyText]) => {
      if (!button) return;
      button.disabled = isLoading;
      button.classList.toggle("is-loading", isLoading);
      button.setAttribute("aria-busy", isLoading ? "true" : "false");
      button.textContent = isLoading ? "Opening checkout..." : readyText;
    });
  }

  function focusRestoreAccess(event, source = "unknown") {
    if (event) event.preventDefault();
    trackEvent("restore_access_clicked", { source: cleanAnalyticsText(source) });
    els.restoreForm.dataset.restoreOpen = "true";
    els.restoreForm.classList.remove("hidden");
    if (!["sending", "sent"].includes(els.restoreForm.dataset.restoreState)) {
      setRestoreStatus("idle");
    }
    document.getElementById("unlock")?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => els.restoreEmail.focus(), 180);
  }

  function closeRestoreAccess() {
    els.restoreForm.dataset.restoreOpen = "false";
    if (!["sending", "sent"].includes(els.restoreForm.dataset.restoreState)) {
      els.restoreForm.classList.add("hidden");
      setRestoreStatus("idle");
    }
    setRestoreFocusActive(false);
  }

  async function handleCheckoutReturn() {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    const sessionId = params.get("session_id");

    if (checkout === "cancelled") {
      setStatus("Checkout cancelled. Preview mode is still available.");
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }

    if (checkout !== "success" || !sessionId) return;

    setStatus("Verifying payment...");
    try {
      const response = await fetch(`/api/verify-session?session_id=${encodeURIComponent(sessionId)}`);
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Payment could not be verified");
      }
      if (payload.fulfillmentPending) {
        window.history.replaceState({}, "", window.location.pathname);
        setStatus("Payment received. Access is being activated securely; refresh in a moment or use Restore access with your checkout email.");
        return;
      }
      state.entitlement = {
        active: true,
        email: payload.email || "",
        sessionId,
        verifiedAt: new Date().toISOString(),
      };
      saveEntitlement();
      if (payload.authenticated) {
        applyServerSession({
          authenticated: true,
          email: payload.email || "",
          entitlement: { active: true },
        });
      }
      window.history.replaceState({}, "", window.location.pathname);
      trackEvent("checkout_success", { source: "stripe_return", planKey: currentCheckoutPlan().key, referralCode: state.referral.code || "" });
      if (state.referral.code) {
        trackEvent("referral_purchase_completed", { source: "stripe_return", planKey: currentCheckoutPlan().key });
      }
      setStatus("Payment verified. Full access unlocked.");
    } catch (error) {
      setStatus(`Payment verification error: ${error.message}`);
    }
  }

  async function handleLoginReturn() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("login_token");
    if (!token) return;

    setStatus("Restoring access...");
    try {
      const response = await fetch("/api/consume-login-link", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        const loginError = new Error(payload.error || "Login link is invalid or expired.");
        loginError.code = payload.code || "";
        throw loginError;
      }

      applyServerSession({
        authenticated: true,
        email: payload.email || "",
        entitlement: payload.entitlement || { active: false },
      });
      removeUrlParams(["login_token"]);
      setStatus("Access restored. Full access is linked to this browser.");
    } catch (error) {
      removeUrlParams(["login_token"]);
      if (error.code === "expired_link") {
        setStatus("Restore link expired. Request a new secure link from Account or Restore access.");
      } else if (error.code === "used_link") {
        setStatus("Restore link already used. Request a fresh secure link if you need to sign in again.");
      } else {
        setStatus(`Restore access error: ${error.message}`);
      }
    }
  }

  async function refreshServerSession() {
    try {
      const response = await fetch("/api/me", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) return;
      const payload = await response.json();
      applyServerSession(payload);
    } catch {
      applyServerSession({ authenticated: false, entitlement: { active: false } });
    }
  }

  async function syncLocalProgressWithServer() {
    if (!state.session.authenticated) return;
    setSyncStatus("Syncing queued progress...");
    await syncLegacyLocalAttempts();
    await syncPendingAttempts();
    await syncPendingFlags();
    await syncCurrentFlags();
    updateSyncStatus();
  }

  async function loadServerProgress() {
    if (!state.session.authenticated) return;

    try {
      const response = await fetch("/api/progress", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) return;

      const payload = await response.json();
      if (payload.ok && payload.progress) {
        applyServerProgress(payload.progress);
        state.progress.syncStatus.lastPulledAt = new Date().toISOString();
        saveProgress();
      }
    } catch {
      // Local progress remains available when the network is offline.
    }
  }

  async function syncPendingAttempts() {
    if (!state.session.authenticated || !state.progress.pendingAttempts.length) return;

    const attempts = state.progress.pendingAttempts.slice(0, 100);
    setSyncStatus(`Syncing ${attempts.length} queued answer${attempts.length === 1 ? "" : "s"}...`);
    try {
      const response = await fetch("/api/attempts", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attempts }),
      });
      if (!response.ok) return;

      const syncedIds = new Set(attempts.map((attempt) => attempt.clientEventId));
      state.progress.pendingAttempts = state.progress.pendingAttempts.filter(
        (attempt) => !syncedIds.has(attempt.clientEventId)
      );
      state.progress.syncStatus.lastPushedAt = new Date().toISOString();
      state.syncRetryDelayMs = 2000;
      saveProgress();
    } catch {
      // Keep queued attempts for the next online/logged-in session.
      scheduleProgressRetry();
    }
  }

  async function syncPendingFlags() {
    if (!state.session.authenticated || !state.progress.pendingFlags.length) return;

    const flags = collapseFlagOperations(state.progress.pendingFlags);
    setSyncStatus(`Syncing ${flags.length} queued flag change${flags.length === 1 ? "" : "s"}...`);
    try {
      const response = await fetch("/api/flags", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flags }),
      });
      if (!response.ok) return;

      state.progress.pendingFlags = [];
      state.progress.syncStatus.lastPushedAt = new Date().toISOString();
      state.syncRetryDelayMs = 2000;
      saveProgress();
    } catch {
      // Keep queued flag changes for the next online/logged-in session.
      scheduleProgressRetry();
    }
  }

  async function syncCurrentFlags() {
    if (!state.session.authenticated || !state.progress.flagged.size) return;

    const flags = Array.from(state.progress.flagged).map((questionId) => {
      const question = findQuestionById(questionId);
      return {
        questionId,
        category: question?.category || "Uncategorised",
        active: true,
        updatedAt: new Date().toISOString(),
      };
    });

    try {
      await fetch("/api/flags", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flags }),
      });
      state.progress.syncStatus.lastPushedAt = new Date().toISOString();
      updateSyncStatus();
    } catch {
      // Local flags still work offline.
      scheduleProgressRetry();
    }
  }

  async function syncLegacyLocalAttempts() {
    if (!state.session.authenticated || !state.progress.legacyMergeNeeded) return;

    const alreadySynced = new Set(state.progress.syncedLegacyAttemptKeys);
    const exactCounts = countExactPendingAttemptsByQuestion();
    const attempts = [];

    Object.entries(state.progress.answers).forEach(([questionId, answer]) => {
      const qid = Number(questionId);
      if (!Number.isInteger(qid)) return;

      const exact = exactCounts.get(qid) || { attempts: 0, correct: 0, wrong: 0 };
      const legacyAttempts = Math.max(0, Number(answer.attempts || 0) - exact.attempts);
      if (!legacyAttempts) return;

      const legacyCorrect = Math.max(0, Number(answer.correct || 0) - exact.correct);
      const legacyWrong = Math.max(0, Number(answer.wrong || 0) - exact.wrong);
      const clientEventId = `legacy:${qid}:${legacyAttempts}:${legacyCorrect}:${legacyWrong}`;
      if (alreadySynced.has(clientEventId)) return;

      const question = findQuestionById(qid);
      attempts.push({
        clientEventId,
        questionId: qid,
        canonicalQuestionId: question?.canonicalQuestionId || qid,
        selectedIndex: null,
        correct: legacyWrong === 0 && legacyCorrect > 0,
        mode: "legacy",
        category: question?.category || "Uncategorised",
        answeredAt: new Date().toISOString(),
      });
    });

    if (!attempts.length) {
      state.progress.legacyMergeNeeded = false;
      saveProgress();
      return;
    }

    try {
      const response = await fetch("/api/attempts", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attempts }),
      });
      if (!response.ok) return;

      state.progress.syncedLegacyAttemptKeys.push(...attempts.map((attempt) => attempt.clientEventId));
      state.progress.legacyMergeNeeded = false;
      state.progress.syncStatus.lastPushedAt = new Date().toISOString();
      saveProgress();
    } catch {
      // Try again on the next logged-in load.
      scheduleProgressRetry();
    }
  }

  async function requestLoginLink(event) {
    event.preventDefault();
    const email = els.restoreEmail.value.trim();
    const emailIssue = validateRestoreEmail(email);

    if (emailIssue) {
      setRestoreEmailValidity(false);
      setRestoreStatus("error", emailIssue.title, emailIssue.copy);
      els.restoreEmail.focus();
      return;
    }

    setRestoreEmailValidity(true);
    trackEvent("restore_access_started", { source: "restore_form" });
    els.restoreBtn.disabled = true;
    els.restoreBtn.textContent = "Sending...";
    setRestoreStatus("sending", "Sending secure link", "Checking the email and preparing a one-time access link.");
    try {
      const response = await fetch("/api/request-login-link", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      let payload = {};
      try {
        payload = await response.json();
      } catch {
        payload = {};
      }
      if (!response.ok || !payload.ok) {
        const restoreError = new Error("restore_request_failed");
        restoreError.status = response.status;
        restoreError.code = typeof payload.error === "string" ? payload.error : "";
        throw restoreError;
      }
      setRestoreStatus("sent", "Check your inbox", "The link expires soon for security.");
      trackEvent("restore_access_success", { source: "restore_form" });
    } catch (error) {
      if (isRestoreRateLimited(error)) {
        setRestoreStatus("rate-limited", "Too many attempts", "Wait a little, then try again.");
      } else {
        setRestoreStatus(
          "error",
          "We could not send the link",
          "Check the email address and try again. Contact support if it keeps happening."
        );
      }
    } finally {
      els.restoreBtn.disabled = false;
      els.restoreBtn.textContent = els.restoreForm.dataset.restoreState === "sent" ? "Send another link" : "Send secure link";
    }
  }

  async function logout() {
    els.logoutBtn.disabled = true;
    try {
      await fetch("/api/logout", {
        method: "POST",
        credentials: "same-origin",
      });
    } catch {
      // The local state can still be cleared even if the network request fails.
    }

    applyServerSession({ authenticated: false, entitlement: { active: false } });
    clearEntitlement();
    applyFilters();
    render();
    setStatus("Logged out on this browser.");
    els.logoutBtn.disabled = false;
  }

  function applyServerProgress(progress) {
    const serverAnswers = progress.answers || {};
    const mergedAnswers = { ...serverAnswers };

    Object.entries(state.progress.answers).forEach(([questionId, localAnswer]) => {
      const serverAnswer = mergedAnswers[questionId];
      if (!serverAnswer || Number(localAnswer.attempts || 0) > Number(serverAnswer.attempts || 0)) {
        mergedAnswers[questionId] = localAnswer;
      }
    });

    const missed = new Set(progress.missed || []);
    state.progress.pendingAttempts.forEach((attempt) => {
      if (attempt.correct) {
        missed.delete(attempt.questionId);
      } else {
        missed.add(attempt.questionId);
      }
    });

    const flagged = new Set(progress.flagged || []);
    state.progress.flagged.forEach((questionId) => flagged.add(questionId));
    state.progress.pendingFlags.forEach((flag) => {
      if (flag.active) {
        flagged.add(flag.questionId);
      } else {
        flagged.delete(flag.questionId);
      }
    });

    state.progress.answers = mergedAnswers;
    state.progress.missed = missed;
    state.progress.flagged = flagged;
    state.categorySummary = Array.isArray(progress.categories) ? progress.categories : [];
  }

  function scheduleProgressRetry() {
    if (!state.session.authenticated || state.syncRetryTimer || !navigator.onLine) {
      updateSyncStatus();
      return;
    }
    const delay = state.syncRetryDelayMs;
    state.syncRetryDelayMs = Math.min(60_000, state.syncRetryDelayMs * 2);
    setSyncStatus(`Sync paused. Retrying in ${Math.round(delay / 1000)} seconds.`);
    state.syncRetryTimer = window.setTimeout(() => {
      state.syncRetryTimer = null;
      syncPendingAttempts();
      syncPendingFlags();
    }, delay);
  }

  function updateSyncStatus() {
    const pending = state.progress.pendingAttempts.length + state.progress.pendingFlags.length;
    if (!state.session.authenticated) {
      setSyncStatus("Progress saves locally until you sign in.");
      return;
    }
    if (pending) {
      setSyncStatus(`${pending} progress update${pending === 1 ? "" : "s"} queued for sync.`);
      return;
    }
    const last = state.progress.syncStatus?.lastPushedAt || state.progress.syncStatus?.lastPulledAt || "";
    setSyncStatus(last ? `Progress synced ${relativeTime(last)}.` : "Progress sync is ready.");
  }

  function setSyncStatus(message) {
    if (els.syncStatusText) {
      els.syncStatusText.textContent = message;
    }
    if (state.progress?.syncStatus) {
      state.progress.syncStatus.message = message;
    }
  }

  function createAttemptEvent(question, selectedIndex, correct) {
    return {
      clientEventId: createClientEventId(),
      questionId: question.id,
      canonicalQuestionId: question.canonicalQuestionId || question.id,
      selectedIndex,
      correct,
      mode: state.exam ? "exam" : state.mode,
      category: question.category || "Uncategorised",
      answeredAt: new Date().toISOString(),
    };
  }

  function countExactPendingAttemptsByQuestion() {
    const counts = new Map();
    state.progress.pendingAttempts.forEach((attempt) => {
      const current = counts.get(attempt.questionId) || { attempts: 0, correct: 0, wrong: 0 };
      current.attempts += 1;
      current.correct += attempt.correct ? 1 : 0;
      current.wrong += attempt.correct ? 0 : 1;
      counts.set(attempt.questionId, current);
    });
    return counts;
  }

  function collapseFlagOperations(flags) {
    const byQuestion = new Map();
    flags.forEach((flag) => byQuestion.set(flag.questionId, flag));
    return Array.from(byQuestion.values());
  }

  function startTimer() {
    stopTimer();
    state.timerId = window.setInterval(() => {
      updateTimer();
      if (state.exam && Date.now() >= state.exam.endsAt) {
        finishExam();
      }
    }, 1000);
  }

  function stopTimer() {
    if (state.timerId) {
      window.clearInterval(state.timerId);
      state.timerId = null;
    }
  }

  function updateTimer() {
    if (!state.exam) return;
    const remaining = Math.max(0, Math.ceil((state.exam.endsAt - Date.now()) / 1000));
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    els.examTimer.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function shuffle(items) {
    const copy = items.slice();
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[swap]] = [copy[swap], copy[index]];
    }
    return copy;
  }

  function toggleFlag(id) {
    const question = findQuestionById(id);
    let active;
    if (state.progress.flagged.has(id)) {
      state.progress.flagged.delete(id);
      active = false;
    } else {
      state.progress.flagged.add(id);
      active = true;
    }
    state.progress.pendingFlags.push({
      operationId: createClientEventId(),
      questionId: id,
      category: question?.category || "Uncategorised",
      active,
      updatedAt: new Date().toISOString(),
    });
    state.categorySummary = [];
    saveProgress();
    syncStudySessionFlag(id, active);
    syncPendingFlags();
    updateSyncStatus();
    updateStats();
  }

  async function syncStudySessionFlag(questionId, active) {
    if (!state.studySession?.id || !sessionIncludesQuestion(state.studySession, questionId)) return;
    try {
      await studyApi.flagQuestion(state.studySession.id, { questionId, active });
    } catch {
      // Existing progress-sync endpoints keep the flag queued for authenticated users.
    }
  }

  function loadProgress() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      const schemaVersion = Number(parsed.schemaVersion || 0);
      return {
        schemaVersion: PROGRESS_SCHEMA_VERSION,
        answers: parsed.answers || {},
        missed: new Set(parsed.missed || []),
        flagged: new Set(parsed.flagged || []),
        daily: parsed.daily || {},
        pendingAttempts: Array.isArray(parsed.pendingAttempts) ? parsed.pendingAttempts : [],
        pendingFlags: Array.isArray(parsed.pendingFlags) ? parsed.pendingFlags : [],
        mockResults: Array.isArray(parsed.mockResults) ? parsed.mockResults : [],
        syncStatus: parsed.syncStatus && typeof parsed.syncStatus === "object" ? parsed.syncStatus : {},
        syncedLegacyAttemptKeys: Array.isArray(parsed.syncedLegacyAttemptKeys)
          ? parsed.syncedLegacyAttemptKeys
          : [],
        legacyMergeNeeded: schemaVersion < PROGRESS_SCHEMA_VERSION && Boolean(parsed.answers),
      };
    } catch {
      return emptyProgress();
    }
  }

  function emptyProgress() {
    return {
      schemaVersion: PROGRESS_SCHEMA_VERSION,
      answers: {},
      missed: new Set(),
      flagged: new Set(),
      daily: {},
      pendingAttempts: [],
      pendingFlags: [],
      mockResults: [],
      syncStatus: {},
      syncedLegacyAttemptKeys: [],
      legacyMergeNeeded: false,
    };
  }

  function loadEntitlement() {
    try {
      const raw = window.localStorage.getItem(ACCESS_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return { active: Boolean(parsed.active), email: parsed.email || "", sessionId: parsed.sessionId || "" };
    } catch {
      return { active: false, email: "", sessionId: "" };
    }
  }

  function loadAnonymousId() {
    try {
      const existing = window.localStorage.getItem(ANALYTICS_KEY);
      if (existing) return existing;
      const next = `anon_${createClientEventId().replace(/[^a-zA-Z0-9_-]/g, "_")}`;
      window.localStorage.setItem(ANALYTICS_KEY, next);
      return next;
    } catch {
      return `anon_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    }
  }

  function saveEntitlement() {
    window.localStorage.setItem(ACCESS_KEY, JSON.stringify(state.entitlement));
  }

  function clearEntitlement() {
    state.entitlement = { active: false, email: "", sessionId: "" };
    window.localStorage.removeItem(ACCESS_KEY);
  }

  function hasAccess() {
    return Boolean(state.session.entitlementActive || state.entitlement.active);
  }

  function trackPreviewStarted() {
    if (state.analytics.previewStartedTracked || hasAccess() || !state.questions.length) return;
    state.analytics.previewStartedTracked = true;
    trackEvent("preview_started", {
      previewLimit: PREVIEW_LIMIT,
      questionCount: state.questions.length,
    });
  }

  function trackQuestionAnswer(question, selectedIndex, correct) {
    const properties = questionAnalyticsProperties(question, selectedIndex, correct);
    trackEvents([
      { eventName: "question_answered", properties },
      {
        eventName: correct ? "answer_correct" : "answer_wrong",
        properties,
      },
    ]);
  }

  function questionAnalyticsProperties(question, selectedIndex, correct) {
    return {
      questionId: question.id,
      category: question.category || "Uncategorised",
      mode: state.exam ? "exam" : state.mode,
      correct,
      selectedIndex,
      priorityScore: question.priorityScore,
      priorityLabel: question.priorityLabel,
      isRoadSign: Boolean(question.isRoadSign),
      isHighYield: question.priorityScore >= 68,
    };
  }

  function trackEvent(eventName, properties = {}) {
    return trackEvents([{ eventName, properties }]);
  }

  function trackEvents(events) {
    const payload = {
      anonymousId: state.analytics.anonymousId,
      events: events.map((event) => ({
        eventName: event.eventName,
        properties: event.properties || {},
      })),
    };

    fetch("/api/events", {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {
      // Analytics is intentionally non-blocking.
    });
  }

  function cleanAnalyticsText(value) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, 80);
  }

  function saveProgress() {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        answers: state.progress.answers,
        missed: Array.from(state.progress.missed),
        flagged: Array.from(state.progress.flagged),
        daily: state.progress.daily,
        schemaVersion: PROGRESS_SCHEMA_VERSION,
        pendingAttempts: state.progress.pendingAttempts,
        pendingFlags: state.progress.pendingFlags,
        mockResults: state.progress.mockResults,
        syncStatus: state.progress.syncStatus,
        syncedLegacyAttemptKeys: state.progress.syncedLegacyAttemptKeys,
        legacyMergeNeeded: state.progress.legacyMergeNeeded,
      })
    );
  }

  function resetProgress() {
    if (!window.confirm("Reset local practice progress on this browser?")) return;
    state.progress = emptyProgress();
    state.categorySummary = [];
    saveProgress();
    applyFilters();
    render();
  }

  function updateStats() {
    const metrics = buildProgressMetrics();
    const highYield = positiveNumber(
      PRODUCT_SUMMARY.estimatedPriorityQuestionCount,
      state.questions.filter((question) => question.priorityScore >= 68).length
    );
    const signs = positiveNumber(
      PRODUCT_SUMMARY.signOrImageQuestionCount,
      state.questions.filter((question) => question.isRoadSign).length
    );

    els.answeredStat.textContent = String(metrics.answered);
    els.accuracyStat.textContent = metrics.answered ? `${metrics.accuracy}%` : "0%";
    els.missedStat.textContent = String(state.progress.missed.size);
    els.flaggedStat.textContent = String(state.progress.flagged.size);
    els.highYieldStat.textContent = String(highYield);
    els.signsStat.textContent = String(signs);
    els.targetStat.textContent = `${Math.min(metrics.today, DAILY_TARGET)}/${DAILY_TARGET}`;
    if (els.stickyProgressText) {
      els.stickyProgressText.textContent = `Today ${Math.min(metrics.today, DAILY_TARGET)}/${DAILY_TARGET}`;
    }
    els.targetMeter.style.width = `${Math.round(metrics.targetRatio * 100)}%`;
    els.targetRing?.style.setProperty("--target-progress", `${Math.round(metrics.targetRatio * 100)}%`);
    const totalQuestions = positiveNumber(PRODUCT_SUMMARY.totalPublishedQuestions, state.questions.length);
    const totalPriority = highYield;
    const totalSigns = signs;
    els.questionCountChip.textContent = `${formatCount(totalQuestions)} questions`;
    els.trustQuestionCount.textContent = formatCount(totalQuestions);
    if (els.trustPriorityCount) els.trustPriorityCount.textContent = formatCount(totalPriority);
    if (els.trustSignImageCount) els.trustSignImageCount.textContent = formatCount(totalSigns);
    els.coachCopy.textContent = coachCopy(metrics);
    renderNextAction(metrics);
    renderStudyFlow(metrics);
    renderCategorySummary(metrics.categorySummaries);
    renderAccess();
    updateSyncStatus();
  }

  function buildProgressMetrics() {
    const answers = Object.values(state.progress.answers);
    const answered = answers.reduce((sum, item) => sum + Number(item.attempts || 0), 0);
    const correct = answers.reduce((sum, item) => sum + Number(item.correct || 0), 0);
    const today = state.progress.daily[dayKey()] || 0;
    const targetRatio = Math.min(1, today / DAILY_TARGET);
    const signalCounts = buildAnsweredSignalCounts();
    const mockResults = Array.isArray(state.progress.mockResults) ? state.progress.mockResults : [];
    const categorySummaries = state.categorySummary.length ? state.categorySummary.slice() : buildLocalCategorySummary();

    return {
      answered,
      correct,
      accuracy: answered ? Math.round((correct / answered) * 100) : 0,
      today,
      targetRatio,
      remainingToday: Math.max(0, DAILY_TARGET - today),
      highYieldAnswered: signalCounts.highYieldAnswered,
      signsAnswered: signalCounts.signsAnswered,
      missedCount: state.progress.missed.size,
      flaggedCount: state.progress.flagged.size,
      mockResults,
      mockPassCount: mockResults.filter((result) => result && result.passed).length,
      mockCompletedCount: mockResults.length,
      categorySummaries,
    };
  }

  function buildAnsweredSignalCounts() {
    const questionById = buildQuestionMap();
    return Object.entries(state.progress.answers).reduce(
      (counts, [questionId, answer]) => {
        const attempts = Number(answer.attempts || 0);
        const question = questionById.get(Number(questionId));
        if (!question || !attempts) return counts;
        if (question.priorityScore >= 68) counts.highYieldAnswered += attempts;
        if (question.isRoadSign) counts.signsAnswered += attempts;
        return counts;
      },
      { highYieldAnswered: 0, signsAnswered: 0 }
    );
  }

  function renderNextAction(metrics) {
    if (!els.nextActionTitle || !els.nextActionCopy) return;

    const next = nextRecommendedAction(metrics);
    els.nextActionTitle.textContent = next.title;
    els.nextActionCopy.textContent = next.copy;
  }

  function nextRecommendedAction(metrics) {
    if (!metrics.answered) {
      return {
        title: "Drill estimated high-yield",
        copy: "Start with estimated priority questions to build a quick baseline.",
      };
    }

    if (metrics.today < DAILY_TARGET) {
      return {
        title: "Keep the daily target moving",
        copy: `${metrics.remainingToday} more to hit today's target.`,
      };
    }

    if (metrics.missedCount || metrics.flaggedCount) {
      return {
        title: "Clear missed",
        copy: `${metrics.missedCount + metrics.flaggedCount} missed or flagged item${metrics.missedCount + metrics.flaggedCount === 1 ? "" : "s"} waiting in review.`,
      };
    }

    if (metrics.signsAnswered < 12) {
      return {
        title: "Road signs",
        copy: "Road signs need another round before the next timed mock.",
      };
    }

    if (metrics.mockPassCount < 2) {
      return {
        title: "Mock exam",
        copy: "Mock-ready when you hit 35/40 twice.",
      };
    }

    return {
      title: "Maintain the rhythm",
      copy: "Daily target done. Rotate review mode, road signs, and mock tests to keep weak areas fresh.",
    };
  }

  function renderStudyFlow(metrics) {
    if (!els.studyFlowList) return;

    const steps = buildStudyFlow(metrics);
    steps.forEach((step) => {
      const item = els.studyFlowList.querySelector(`[data-flow-step="${step.key}"]`);
      if (!item) return;
      item.dataset.state = step.state;
      item.querySelector(".flow-state").textContent = labelFlowState(step.state);
      item.querySelector("p").textContent = step.copy;
    });

    const doneCount = steps.filter((step) => step.state === "done").length;
    if (els.flowStateLabel) {
      els.flowStateLabel.textContent = doneCount === steps.length ? "Done" : `${doneCount}/${steps.length} done`;
    }
  }

  function buildStudyFlow(metrics) {
    return [
      {
        key: "highYield",
        state: flowState(metrics.highYieldAnswered, DAILY_TARGET, state.mode === "highYield"),
        copy: metrics.highYieldAnswered
          ? `${Math.min(metrics.highYieldAnswered, DAILY_TARGET)}/${DAILY_TARGET} estimated high-yield answers logged.`
          : "Focus on estimated priority.",
      },
      {
        key: "review",
        state: reviewFlowState(metrics),
        copy: metrics.missedCount || metrics.flaggedCount
          ? `${metrics.missedCount + metrics.flaggedCount} missed or flagged item${metrics.missedCount + metrics.flaggedCount === 1 ? "" : "s"} to clear.`
          : metrics.answered
            ? "No missed questions waiting right now."
            : "Wrong answers will collect here.",
      },
      {
        key: "signs",
        state: flowState(metrics.signsAnswered, 12, state.mode === "signs"),
        copy: metrics.signsAnswered >= 12
          ? "Road-sign round complete for today."
          : "Road signs need another round.",
      },
      {
        key: "mock",
        state: mockFlowState(metrics),
        copy: metrics.mockPassCount >= 2
          ? "Two 35/40 mock pass marks logged."
          : "Mock-ready when you hit 35/40 twice.",
      },
    ];
  }

  function flowState(count, doneAt, active) {
    if (count >= doneAt) return "done";
    if (count > 0 || active) return "in-progress";
    return "not-started";
  }

  function reviewFlowState(metrics) {
    if (metrics.answered && !metrics.missedCount && !metrics.flaggedCount) return "done";
    if (metrics.missedCount || metrics.flaggedCount || state.mode === "review") return "in-progress";
    return "not-started";
  }

  function mockFlowState(metrics) {
    if (metrics.mockPassCount >= 2) return "done";
    if (state.exam || metrics.mockCompletedCount) return "in-progress";
    return "not-started";
  }

  function labelFlowState(value) {
    if (value === "done") return "Done";
    if (value === "in-progress") return "In progress";
    return "Not started";
  }

  function renderCategorySummary(inputSummaries) {
    const summaries = normalizeCategorySummaries(inputSummaries);
    const meaningful = summaries.filter((summary) => summary.answered || summary.missedCount || summary.flaggedCount);

    els.categorySummary.innerHTML = "";

    const strongest = findStrongestCategory(meaningful);
    const weakest = findWeakestCategory(meaningful);
    const recommended = findRecommendedCategory(meaningful) || starterCategorySummary();

    const overview = document.createElement("div");
    overview.className = "category-summary-overview";
    overview.append(
      buildCategoryHighlight("Strongest category", strongest, "Answer a few questions to reveal this."),
      buildCategoryHighlight("Weakest category", weakest, "Missed questions will reveal this."),
      buildCategoryHighlight("Recommended next category", recommended, "Start here to build coverage.")
    );
    els.categorySummary.append(overview);

    if (!meaningful.length) {
      const empty = document.createElement("p");
      empty.className = "category-summary-empty";
      empty.textContent = "Answer a few questions to reveal category accuracy and weak areas.";
      els.categorySummary.append(empty);
      return;
    }

    meaningful
      .slice()
      .sort((a, b) => {
        if (b.missedCount !== a.missedCount) return b.missedCount - a.missedCount;
        if (b.flaggedCount !== a.flaggedCount) return b.flaggedCount - a.flaggedCount;
        return a.accuracy - b.accuracy;
      })
      .slice(0, 3)
      .forEach((summary) => {
      const row = document.createElement("div");
      row.className = "category-summary-row";
      row.innerHTML = "<strong></strong><span></span><em></em>";
      row.querySelector("strong").textContent = summary.category;
      row.querySelector("span").textContent =
        `${summary.answered} answered | ${summary.accuracy}% | ${summary.missedCount} missed | ${summary.flaggedCount} flagged`;
      row.querySelector("em").textContent = `Next: ${labelMode(summary.recommendedNextMode)}`;
      els.categorySummary.append(row);
    });
  }

  function buildLocalCategorySummary() {
    if (!state.questions.length) return [];

    const byCategory = new Map();
    const questionById = buildQuestionMap();

    Object.entries(state.progress.answers).forEach(([questionId, answer]) => {
      const question = questionById.get(Number(questionId));
      const category = question?.category || "Uncategorised";
      const summary = getCategorySummaryBucket(byCategory, category);
      summary.answered += Number(answer.attempts || 0);
      summary.correct += Number(answer.correct || 0);
    });

    state.progress.missed.forEach((questionId) => {
      const category = questionById.get(Number(questionId))?.category || "Uncategorised";
      getCategorySummaryBucket(byCategory, category).missedCount += 1;
    });

    state.progress.flagged.forEach((questionId) => {
      const category = questionById.get(Number(questionId))?.category || "Uncategorised";
      getCategorySummaryBucket(byCategory, category).flaggedCount += 1;
    });

    return Array.from(byCategory.values()).map((summary) => {
      const accuracy = summary.answered ? Math.round((summary.correct / summary.answered) * 100) : 0;
      return {
        category: summary.category,
        answered: summary.answered,
        accuracy,
        missedCount: summary.missedCount,
        flaggedCount: summary.flaggedCount,
        recommendedNextMode: recommendNextMode({
          answered: summary.answered,
          accuracy,
          missedCount: summary.missedCount,
          flaggedCount: summary.flaggedCount,
        }),
      };
    });
  }

  function normalizeCategorySummaries(summaries) {
    return (Array.isArray(summaries) ? summaries : []).map((summary) => ({
      category: clean(summary.category) || "Uncategorised",
      answered: Number(summary.answered || 0),
      accuracy: Number(summary.accuracy || 0),
      missedCount: Number(summary.missedCount || 0),
      flaggedCount: Number(summary.flaggedCount || 0),
      recommendedNextMode: summary.recommendedNextMode || recommendNextMode(summary),
    }));
  }

  function findStrongestCategory(summaries) {
    return summaries
      .filter((summary) => summary.answered > 0)
      .slice()
      .sort((a, b) => {
        if (b.accuracy !== a.accuracy) return b.accuracy - a.accuracy;
        return b.answered - a.answered;
      })[0] || null;
  }

  function findWeakestCategory(summaries) {
    return summaries
      .slice()
      .sort((a, b) => {
        if (b.missedCount !== a.missedCount) return b.missedCount - a.missedCount;
        if (a.accuracy !== b.accuracy) return a.accuracy - b.accuracy;
        return b.flaggedCount - a.flaggedCount;
      })[0] || null;
  }

  function findRecommendedCategory(summaries) {
    return summaries
      .slice()
      .sort((a, b) => {
        const aNeedsReview = a.missedCount + a.flaggedCount;
        const bNeedsReview = b.missedCount + b.flaggedCount;
        if (bNeedsReview !== aNeedsReview) return bNeedsReview - aNeedsReview;
        if (a.accuracy !== b.accuracy) return a.accuracy - b.accuracy;
        return b.answered - a.answered;
      })[0] || null;
  }

  function starterCategorySummary() {
    if (!state.questions.length) return null;
    const counts = state.questions.reduce((map, question) => {
      map.set(question.category, (map.get(question.category) || 0) + 1);
      return map;
    }, new Map());
    const [category] = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0] || [];
    return category
      ? {
          category,
          answered: 0,
          accuracy: 0,
          missedCount: 0,
          flaggedCount: 0,
          recommendedNextMode: "revise",
        }
      : null;
  }

  function buildCategoryHighlight(label, summary, emptyCopy) {
    const card = document.createElement("div");
    card.className = "category-highlight-card";
    card.innerHTML = "<span></span><strong></strong><em></em>";
    card.querySelector("span").textContent = label;

    if (!summary) {
      card.querySelector("strong").textContent = "Not enough data";
      card.querySelector("em").textContent = emptyCopy;
      return card;
    }

    card.querySelector("strong").textContent = summary.category;
    card.querySelector("em").textContent = summary.answered
      ? `${summary.accuracy}% accuracy | ${summary.answered} answered`
      : `${labelMode(summary.recommendedNextMode)} recommended`;
    return card;
  }

  function getCategorySummaryBucket(map, category) {
    if (!map.has(category)) {
      map.set(category, {
        category,
        answered: 0,
        correct: 0,
        missedCount: 0,
        flaggedCount: 0,
      });
    }
    return map.get(category);
  }

  function recommendNextMode(summary) {
    if (summary.missedCount || summary.flaggedCount) return "review";
    if (summary.answered >= 5 && summary.accuracy < 75) return "highYield";
    if (summary.answered >= 20 && summary.accuracy >= 85) return "exam";
    return "revise";
  }

  function labelMode(mode) {
    if (mode === "highYield") return "High yield";
    if (mode === "review") return "Review";
    if (mode === "exam") return "Mock test";
    return "Revise";
  }

  function renderAccess() {
    updatePricingText();
    if (state.session.entitlementActive) {
      els.unlockBadge.textContent = "Unlocked";
      els.unlockStatus.textContent = `Full access restored for ${state.session.email}.`;
      els.heroCheckoutBtn?.classList.add("hidden");
      els.checkoutBtn.classList.add("hidden");
      els.restoreAccessLink.classList.add("hidden");
      els.restoreForm.classList.add("hidden");
      els.restoreForm.dataset.restoreOpen = "false";
      els.logoutBtn.classList.remove("hidden");
    } else if (state.entitlement.active) {
      els.unlockBadge.textContent = "Unlocked";
      els.unlockStatus.textContent = state.entitlement.email
        ? `Full access active for ${state.entitlement.email}. Use Restore access to sync another device.`
        : "Full access active on this browser. Use Restore access to sync another device.";
      els.heroCheckoutBtn?.classList.add("hidden");
      els.checkoutBtn.classList.add("hidden");
      els.restoreAccessLink.classList.add("hidden");
      els.restoreForm.classList.add("hidden");
      els.restoreForm.dataset.restoreOpen = "false";
      els.logoutBtn.classList.toggle("hidden", !state.session.authenticated);
    } else {
      els.unlockBadge.textContent = state.session.authenticated ? "Signed in" : "Preview";
      els.unlockStatus.textContent = state.session.authenticated
        ? `Signed in as ${state.session.email}. Unlock full coach to practise weak areas, road signs, mocks, and review mode.`
        : `Preview ${PREVIEW_LIMIT} questions. Unlock speed-focused estimated high-yield drills, weak-area review, road signs, and mock tests.`;
      els.heroCheckoutBtn?.classList.remove("hidden");
      if (els.heroCheckoutBtn) {
        els.heroCheckoutBtn.disabled = false;
        els.heroCheckoutBtn.textContent = "Unlock full coach";
      }
      els.checkoutBtn.classList.remove("hidden");
      els.checkoutBtn.disabled = false;
      els.checkoutBtn.textContent = checkoutCtaText();
      els.restoreAccessLink.classList.remove("hidden");
      els.restoreForm.classList.toggle("hidden", !shouldShowRestoreForm());
      els.logoutBtn.classList.toggle("hidden", !state.session.authenticated);
    }
    renderPreviewConversionState(!hasAccess());
    updateModeButtons();
    trackPreviewStarted();
  }

  function renderPreviewConversionState(isPreview) {
    const showPrompt = shouldShowMobileAccessPrompt(isPreview);
    els.mobileStickyCta.classList.toggle("hidden", !showPrompt);
    document.body.classList.toggle("has-mobile-access-prompt", showPrompt);
  }

  function shouldShowMobileAccessPrompt(isPreview) {
    if (!isPreview) return false;
    if (state.exam || state.mode === "exam") return false;
    if (requiresAccess(state.mode)) return false;
    return totalAttemptCount() >= Math.min(PREVIEW_LIMIT, 6);
  }

  function shouldShowRestoreForm() {
    const restoreState = els.restoreForm.dataset.restoreState || "idle";
    return els.restoreForm.dataset.restoreOpen === "true" || ["sending", "sent", "error", "rate-limited"].includes(restoreState);
  }

  async function applyReferralCode(form) {
    const codeInput = form.querySelector("[name='referralCode']");
    const emailInput = form.querySelector("[name='referralEmail']");
    const status = form.querySelector(".referral-status");
    const code = String(codeInput?.value || "").trim();
    if (!code) {
      renderReferralStatus(status, "Enter a code first.");
      return;
    }

    trackEvent("referral_code_viewed", { source: form.dataset.source || "referral_form" });
    form.classList.add("is-loading");
    try {
      const response = await fetch("/api/referral-code", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          email: emailInput?.value || "",
          anonymousId: state.analytics.anonymousId,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error("referral_failed");
      state.referral = {
        code: payload.code || code.toUpperCase(),
        planKey: payload.fixedPricePlan || "",
      };
      if (state.referral.planKey) renderReferralStatus(status, `Code applied. Checkout will use ${labelPricingPlan(state.referral.planKey)}.`);
      else if (payload.grantEntitlement) renderReferralStatus(status, payload.message || "Code applied. Restore access with the same email.");
      else renderReferralStatus(status, "Code applied. Continue to checkout when ready.");
      trackEvent("referral_code_applied", { source: form.dataset.source || "referral_form", planKey: state.referral.planKey || currentCheckoutPlan().key });
      updatePricingText();
    } catch {
      renderReferralStatus(status, "Code could not be applied. Check it and try again.");
    } finally {
      form.classList.remove("is-loading");
    }
  }

  function renderReferralStatus(status, message) {
    if (!status) return;
    status.textContent = message;
  }

  function updatePricingText() {
    const plan = currentCheckoutPlan();
    document.querySelectorAll("[data-price-label]").forEach((item) => {
      item.textContent = plan.displayPrice;
    });
    document.querySelectorAll("[data-plan-label]").forEach((item) => {
      item.textContent = plan.label;
    });
    document.querySelectorAll(".paywall-checkout-btn").forEach((button) => {
      if (!button.disabled) button.textContent = "Unlock full coach";
    });
  }

  function pricingConfig() {
    const fallbackPrice = PRODUCT_SUMMARY.activePrice || "EUR 4.99";
    return window.PRICING_CONFIG || {
      activeLearnerPlanKey: "full_study_pass",
      plans: [
        { key: "full_study_pass", label: "Full Study Pass", displayPrice: fallbackPrice, amountCents: 499, currency: "EUR", enabled: true },
      ],
    };
  }

  function currentCheckoutPlan() {
    const config = pricingConfig();
    const key = state.referral.planKey || config.activeLearnerPlanKey || "full_study_pass";
    return config.plans.find((plan) => plan.key === key && plan.enabled !== false)
      || config.plans.find((plan) => plan.key === "full_study_pass")
      || config.plans[0];
  }

  function checkoutCtaText() {
    const plan = currentCheckoutPlan();
    return `Unlock for ${plan.displayPrice}`;
  }

  function labelPricingPlan(planKey) {
    const plan = pricingConfig().plans.find((item) => item.key === planKey);
    return plan ? `${plan.label} (${plan.displayPrice})` : "the selected plan";
  }

  function applyServerSession(payload) {
    state.session = {
      authenticated: Boolean(payload.authenticated),
      email: payload.email || "",
      entitlementActive: Boolean(payload.entitlement && payload.entitlement.active),
    };
  }

  function setRestoreStatus(type = "idle", title, copy) {
    const content = restoreStatusContent(type, title, copy);
    els.restoreForm.dataset.restoreState = content.type;
    els.restoreStatus.className = `restore-status ${content.type}`;

    const statusTitle = document.createElement("strong");
    statusTitle.textContent = content.title;
    const statusCopy = document.createElement("span");
    statusCopy.textContent = content.copy;
    els.restoreStatus.replaceChildren(statusTitle, statusCopy);
  }

  function restoreStatusContent(type, title, copy) {
    const states = {
      idle: {
        title: "Secure email link",
        copy: "No password needed. We only use this to restore access.",
      },
      sending: {
        title: "Sending secure link",
        copy: "Checking the email and preparing a one-time access link.",
      },
      sent: {
        title: "Check your inbox",
        copy: "The link expires soon for security.",
      },
      error: {
        title: "Something went wrong",
        copy: "Please check the email and try again.",
      },
      "rate-limited": {
        title: "Too many attempts",
        copy: "Wait a little, then try again.",
      },
    };
    const safeType = Object.prototype.hasOwnProperty.call(states, type) ? type : "idle";
    return {
      type: safeType,
      title: title || states[safeType].title,
      copy: copy || states[safeType].copy,
    };
  }

  function validateRestoreEmail(email) {
    if (!email) {
      return {
        title: "Email required",
        copy: "Enter the email you used at checkout.",
      };
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return {
        title: "Enter a valid email",
        copy: "Use the email address you used when you unlocked the coach.",
      };
    }

    return null;
  }

  function setRestoreEmailValidity(valid) {
    if (valid) {
      els.restoreEmail.removeAttribute("aria-invalid");
    } else {
      els.restoreEmail.setAttribute("aria-invalid", "true");
    }
    els.restoreEmail.setCustomValidity(valid ? "" : "Enter a valid email address.");
  }

  function setRestoreFocusActive(active) {
    document.body.classList.toggle("restore-focus-active", Boolean(active));
  }

  function isRestoreRateLimited(error) {
    const code = String(error && error.code ? error.code : "").toLowerCase();
    return Number(error && error.status) === 429 || code.includes("rate") || code.includes("too many");
  }

  function removeUrlParams(names) {
    const url = new URL(window.location.href);
    names.forEach((name) => url.searchParams.delete(name));
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function findQuestionById(id) {
    return state.questions.find((question) => question.id === Number(id));
  }

  function buildQuestionMap() {
    return new Map(state.questions.map((question) => [question.id, question]));
  }

  function totalAttemptCount() {
    return Object.values(state.progress.answers).reduce((sum, item) => sum + Number(item.attempts || 0), 0);
  }

  function createClientEventId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return `evt:${Date.now()}:${Math.random().toString(16).slice(2)}`;
  }

  function coachCopy(metrics) {
    if (!metrics.answered) return "Start with estimated high-yield questions to find your baseline.";
    if (metrics.today < DAILY_TARGET) return `${metrics.remainingToday} more to hit today's target.`;
    if (metrics.missedCount || metrics.flaggedCount) return "Target hit. Clear missed questions before a new mock test.";
    if (metrics.signsAnswered < 12) return "Road signs need another round.";
    if (metrics.mockPassCount < 2) return "Mock-ready when you hit 35/40 twice.";
    return "Target hit. Keep rotating road signs, review mode, and mock tests.";
  }

  function dayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function relativeTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "recently";
    const seconds = Math.max(1, Math.round((Date.now() - date.getTime()) / 1000));
    if (seconds < 60) return "just now";
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    const days = Math.round(hours / 24);
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }

  function buildStatusMessage(url) {
    return url.includes("preview-questions")
      ? `${state.questions.length} preview questions loaded. Answers reveal securely after submission.`
      : `${state.questions.length} preview questions loaded.`;
  }

  function setStatus(message) {
    els.statusBar.textContent = message;
  }

  function setLoading(active) {
    document.body.classList.toggle("app-loading", active);
  }

  function renderLoading(message) {
    els.questionMount.innerHTML = `
      <section class="question-view question-skeleton" role="status" aria-live="polite">
        <div class="loading-state">
          <span class="loading-spinner" aria-hidden="true"></span>
          <span>${message}</span>
        </div>
        <div class="skeleton-pill-row" aria-hidden="true">
          <span class="skeleton-pill"></span>
          <span class="skeleton-pill short"></span>
        </div>
        <div class="skeleton-line title" aria-hidden="true"></div>
        <div class="skeleton-line medium" aria-hidden="true"></div>
        <div class="question-skeleton-options" aria-hidden="true">
          <span class="skeleton-card"></span>
          <span class="skeleton-card"></span>
          <span class="skeleton-card"></span>
          <span class="skeleton-card"></span>
        </div>
      </section>
    `;
  }

  function renderEmpty(message) {
    els.questionMount.innerHTML = `<div class="empty-state">${message}</div>`;
  }

  function showCelebration(title, copy) {
    document.querySelector(".celebration-toast")?.remove();
    const toast = document.createElement("div");
    toast.className = "celebration-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");

    const heading = document.createElement("strong");
    heading.textContent = title;
    const body = document.createElement("p");
    body.textContent = copy;
    toast.append(heading, body);
    document.body.append(toast);

    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(() => {
      toast.classList.add("is-hiding");
      window.setTimeout(() => toast.remove(), reducedMotion ? 20 : 220);
    }, CELEBRATION_DURATION_MS);
  }
})();
