(function () {
  "use strict";

  const DATA_URLS = ["./data/questions.enriched.json", "./data/questions.json"];
  const EXAM_SIZE = 40;
  const PASS_MARK = 35;
  const EXAM_SECONDS = 45 * 60;
  const DAILY_TARGET = 25;
  const PREVIEW_LIMIT = 15;
  const STORAGE_KEY = "irish-theory-practice-progress-v2";
  const ACCESS_KEY = "irish-theory-practice-access-v1";
  const ANALYTICS_KEY = "irish-theory-practice-anonymous-id-v1";
  const PROGRESS_SCHEMA_VERSION = 3;
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
    exam: null,
    timerId: null,
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
    startExamBtn: document.getElementById("startExamBtn"),
    finishExamBtn: document.getElementById("finishExamBtn"),
    resetProgressBtn: document.getElementById("resetProgressBtn"),
    checkoutBtn: document.getElementById("checkoutBtn"),
    restoreAccessLink: document.getElementById("restoreAccessLink"),
    restoreForm: document.getElementById("restoreForm"),
    restoreEmail: document.getElementById("restoreEmail"),
    restoreBtn: document.getElementById("restoreBtn"),
    restoreStatus: document.getElementById("restoreStatus"),
    logoutBtn: document.getElementById("logoutBtn"),
    mobileStickyCta: document.getElementById("mobileStickyCta"),
    stickyCheckoutBtn: document.getElementById("stickyCheckoutBtn"),
    stickyRestoreLink: document.getElementById("stickyRestoreLink"),
    unlockBadge: document.getElementById("unlockBadge"),
    unlockStatus: document.getElementById("unlockStatus"),
    answeredStat: document.getElementById("answeredStat"),
    accuracyStat: document.getElementById("accuracyStat"),
    missedStat: document.getElementById("missedStat"),
    flaggedStat: document.getElementById("flaggedStat"),
    highYieldStat: document.getElementById("highYieldStat"),
    signsStat: document.getElementById("signsStat"),
    categorySummary: document.getElementById("categorySummary"),
    targetStat: document.getElementById("targetStat"),
    targetMeter: document.getElementById("targetMeter"),
    coachCopy: document.getElementById("coachCopy"),
    questionCountChip: document.getElementById("questionCountChip"),
    trustQuestionCount: document.getElementById("trustQuestionCount"),
  };

  init();

  async function init() {
    bindEvents();
    bindConnectivityEvents();
    registerServiceWorker();
    trackEvent("page_view", { path: window.location.pathname || "/" });
    setLoading(true);
    renderLoading("Loading question bank...");
    setStatus("Loading recovered questions...");
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
      setStatus(offline ? "Offline. Cached questions were not available yet." : "Waiting for the recovered dataset.");
      renderEmpty(
        offline
          ? "You are offline and this device does not have the question bank cached yet. Reconnect once, then the app can reopen faster."
          : "Let the recovery script finish, then refresh this page."
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
        return { questions: await response.json(), url };
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error("No dataset URL configured.");
  }

  function bindConnectivityEvents() {
    window.addEventListener("online", () => {
      setStatus("Back online. Syncing progress when available.");
      syncPendingAttempts();
      syncPendingFlags();
    });

    window.addEventListener("offline", () => {
      setStatus("Offline mode. Cached questions and images may still work on this device.");
    });
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
    els.modeExam.addEventListener("click", () => setMode("exam"));
    els.modeReview.addEventListener("click", () => setMode("review"));
    els.jumpHighYieldBtn.addEventListener("click", () => setMode("highYield"));
    els.startExamBtn.addEventListener("click", startExam);
    els.finishExamBtn.addEventListener("click", finishExam);
    els.resetProgressBtn.addEventListener("click", resetProgress);
    els.checkoutBtn.addEventListener("click", () => startCheckout("sidebar_unlock"));
    els.stickyCheckoutBtn.addEventListener("click", () => startCheckout("mobile_sticky"));
    els.restoreAccessLink.addEventListener("click", (event) => focusRestoreAccess(event, "sidebar_unlock"));
    els.stickyRestoreLink.addEventListener("click", (event) => focusRestoreAccess(event, "mobile_sticky"));
    els.restoreForm.addEventListener("submit", requestLoginLink);
    els.logoutBtn.addEventListener("click", logout);
  }

  function normalizeQuestions(payload) {
    return payload
      .filter((question) => question && Number.isInteger(question.id))
      .map((question) => {
        const options = Array.isArray(question.options) ? question.options : [];
        const score = Number.isFinite(question.priority_score) ? question.priority_score : 50;
        return {
          id: question.id,
          category: clean(question.category) || "Uncategorised",
          question: clean(question.question),
          explanation: clean(question.explanation),
          correctIndex: Number.isInteger(question.correct_index)
            ? question.correct_index
            : options.findIndex((option) => option.is_correct),
          correctAnswer: clean(question.correct_answer),
          options: options.map((option, index) => ({
            index,
            text: clean(option.text),
            isCorrect: Boolean(option.is_correct),
          })),
          images: Array.isArray(question.local_image_paths) ? question.local_image_paths : [],
          priorityScore: score,
          priorityLabel: clean(question.priority_label) || labelForScore(score),
          studySignals: Array.isArray(question.study_signals) ? question.study_signals.map(clean) : [],
          scoreBreakdown: normalizeScoreBreakdown(question.score_breakdown),
          sourceType: clean(question.source_type) || "recovered_archive",
          sourceReference: clean(question.source_reference || question.source_url || question.archive_url),
          reviewedStatus: clean(question.reviewed_status) || "needs_official_cross_check",
          reviewedBy: clean(question.reviewed_by),
          reviewedAt: clean(question.reviewed_at),
          reviewNotes: clean(question.notes),
          safeToShow: question.safe_to_show !== false,
          hardestRank: Number.isFinite(question.hardest_rank) ? question.hardest_rank : null,
          communityCorrectRate: Number.isFinite(question.community_correct_rate)
            ? question.community_correct_rate
            : null,
          isRoadSign: Boolean(question.is_road_sign) || Boolean(question.local_image_paths && question.local_image_paths.length),
          importanceNote: clean(question.importance_note),
        };
      })
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
    if (score >= 82) return "Critical";
    if (score >= 68) return "High";
    if (score >= 54) return "Medium";
    return "Standard";
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

  function setMode(mode) {
    const previousMode = state.mode;
    state.mode = mode;
    state.activeIndex = 0;
    if (mode !== "exam") {
      stopTimer();
      state.exam = null;
      els.examBar.classList.add("hidden");
    }
    updateModeButtons();
    applyFilters();
    renderInsight();
    render();
    if (previousMode !== mode) {
      trackEvent("mode_selected", {
        mode,
        previousMode,
        requiresAccess: requiresAccess(mode),
      });
    }
  }

  function updateModeButtons() {
    [
      [els.modeRevise, "revise"],
      [els.modeHighYield, "highYield"],
      [els.modeHardest, "hardest"],
      [els.modeSigns, "signs"],
      [els.modeExam, "exam"],
      [els.modeReview, "review"],
    ].forEach(([button, mode]) => button.classList.toggle("active", state.mode === mode));
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
      onAnswer: (index) => recordAnswer(question, index),
      onNext: () => move(1),
      onPrevious: () => move(-1),
    });
  }

  function renderQuestion(question, config) {
    const fragment = els.template.content.cloneNode(true);
    const article = fragment.querySelector(".question-view");
    const category = fragment.querySelector(".category-pill");
    const priority = fragment.querySelector(".priority-pill");
    const priorityMeta = fragment.querySelector(".priority-meta");
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

    category.textContent = question.category;
    priority.textContent = `${question.priorityLabel} ${question.priorityScore}`;
    priority.classList.add(`priority-${question.priorityLabel.toLowerCase()}`);
    number.textContent = `Question ${question.id} - ${config.positionLabel}`;
    title.textContent = question.question;

    const metaParts = [];
    if (question.hardestRank) metaParts.push(`#${question.hardestRank} on archived hardest list`);
    if (question.communityCorrectRate !== null) metaParts.push(`${question.communityCorrectRate.toFixed(1)}% answered correctly`);
    if (question.isRoadSign) metaParts.push("visual/sign practice");
    priorityMeta.textContent = metaParts.join(" - ");

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
      image.src = "./" + question.images[0].replace(/\\/g, "/");
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
      button.innerHTML = `<strong>${String.fromCharCode(65 + index)}</strong><span></span>`;
      button.querySelector("span").textContent = option.text;
      button.addEventListener("click", () => {
        if (article.dataset.answered === "true") return;
        article.dataset.answered = "true";
        paintAnswers(answerList, question, index);
        showFeedback(feedback, question, index);
        config.onAnswer(index);
        appendPreviewAnswerCta(feedback);
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
    flagBtn.textContent = flagged ? "Flagged" : "Flag";
    flagBtn.classList.toggle("flagged", flagged);
    flagBtn.addEventListener("click", () => {
      toggleFlag(question.id);
      render();
    });

    prevBtn.disabled = !canMove(-1);
    nextBtn.disabled = !canMove(1);
    prevBtn.addEventListener("click", config.onPrevious);
    nextBtn.addEventListener("click", config.onNext);

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
      button.classList.toggle("correct", option.isCorrect);
      button.classList.toggle("wrong", index === selectedIndex && !option.isCorrect);
    });
  }

  function showFeedback(feedback, question, selectedIndex) {
    const selected = question.options[selectedIndex];
    const correct = selected && selected.isCorrect;
    feedback.classList.remove("hidden");
    feedback.innerHTML = "";

    const heading = document.createElement("strong");
    heading.textContent = correct ? "Correct" : `Correct answer: ${question.correctAnswer}`;
    feedback.append(heading);

    if (question.explanation) {
      const body = document.createElement("span");
      body.textContent = question.explanation;
      feedback.append(body);
    }

    appendAiExplanationControls(feedback, question, selectedIndex);
  }

  function appendAiExplanationControls(feedback, question, selectedIndex) {
    if (!Number.isInteger(selectedIndex) || !question.options[selectedIndex]) return;

    const wrapper = document.createElement("div");
    wrapper.className = "ai-explain";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "ai-explain-btn";
    button.textContent = "Explain this";

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
    button.textContent = "Explaining...";
    renderAiExplanationStatus(panel, "Building a short coach note.", "");

    try {
      const response = await fetch("/api/ai-explain", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildAiExplanationPayload(question, selectedIndex)),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Could not load explanation.");
      }

      renderAiExplanation(panel, payload.explanation);
      button.textContent = "Explanation ready";
    } catch (error) {
      renderAiExplanationStatus(panel, error.message, "error");
      button.disabled = false;
      button.textContent = "Explain this";
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

  function renderAiExplanation(panel, explanation) {
    panel.classList.remove("hidden", "error");
    panel.innerHTML = "";

    [
      ["Explanation", explanation.shortExplanation],
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
    panel.classList.remove("hidden");
    panel.classList.toggle("error", tone === "error");
    panel.textContent = message;
  }

  function appendPreviewAnswerCta(feedback) {
    if (hasAccess() || state.mode !== "revise" || totalAttemptCount() < 4) return;
    if (feedback.querySelector(".preview-answer-cta")) return;

    const remainingQuestions = Math.max(0, state.questions.length - PREVIEW_LIMIT);
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

  function recordAnswer(question, selectedIndex) {
    const isCorrect = Boolean(question.options[selectedIndex] && question.options[selectedIndex].isCorrect);
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

    state.progress.daily[dayKey()] = (state.progress.daily[dayKey()] || 0) + 1;
    state.progress.pendingAttempts.push(attemptEvent);
    state.categorySummary = [];
    saveProgress();
    syncPendingAttempts();
    updateStats();
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

  function startExam() {
    if (!hasAccess()) {
      state.mode = "exam";
      updateModeButtons();
      renderPaywall();
      return;
    }

    if (state.questions.length < EXAM_SIZE) {
      renderEmpty(`Need at least ${EXAM_SIZE} questions before a mock test can start.`);
      return;
    }
    state.mode = "exam";
    const pool = state.selectedCategory
      ? state.questions.filter((question) => question.category === state.selectedCategory)
      : state.questions;
    state.exam = {
      questions: buildExam(pool.length >= EXAM_SIZE ? pool : state.questions),
      index: 0,
      answers: {},
      startedAt: Date.now(),
      endsAt: Date.now() + EXAM_SECONDS * 1000,
    };
    trackEvent("mock_started", {
      questionCount: state.exam.questions.length,
      category: state.selectedCategory || "All categories",
    });
    updateModeButtons();
    startTimer();
    renderInsight();
    renderExamQuestion();
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
      onAnswer: (index) => recordAnswer(question, index),
      onNext: () => move(1),
      onPrevious: () => move(-1),
    });
  }

  function finishExam() {
    if (!state.exam) return;
    stopTimer();

    const answers = state.exam.answers;
    let correct = 0;
    state.exam.questions.forEach((question) => {
      const selected = answers[String(question.id)];
      if (Number.isInteger(selected) && question.options[selected] && question.options[selected].isCorrect) {
        correct += 1;
      } else {
        state.progress.missed.add(question.id);
      }
    });

    saveProgress();
    const passed = correct >= PASS_MARK;
    trackEvent("mock_completed", {
      score: correct,
      total: EXAM_SIZE,
      passed,
      answered: Object.keys(answers).length,
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
          <span class="priority-pill ${passed ? "priority-high" : "priority-critical"}">${correct}/${EXAM_SIZE}</span>
          <span class="question-number">Mock test result</span>
        </div>
        <h2 class="question-title">${passed ? "You hit the pass mark." : "Close the gaps and go again."}</h2>
        <p class="result-copy">${passed ? "You reached 35 out of 40. Keep drilling high-yield questions so the pass is repeatable." : "The real pass mark is 35. Review missed questions, then try another mock test."}</p>
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
    updateStats();
  }

  function renderInsight() {
    if (!state.questions.length) {
      els.insightBar.classList.add("hidden");
      return;
    }

    const highYield = state.questions.filter((question) => question.priorityScore >= 68).length;
    const critical = state.questions.filter((question) => question.priorityScore >= 82).length;
    const hardest = state.questions.filter((question) => question.hardestRank).length;
    const signs = state.questions.filter((question) => question.isRoadSign).length;
    els.insightBar.classList.toggle("hidden", state.mode === "exam" && Boolean(state.exam));
    els.insightTitle.textContent = modeTitle();
    els.insightCopy.textContent = `${highYield} high-yield questions, ${critical} critical, ${hardest} archived hardest, ${signs} road-sign/image drills. Scores estimate study priority, not official exam frequency.`;
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
    if (state.mode === "highYield") return "No high-yield questions match these filters.";
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
    const restoreLink = fragment.querySelector(".paywall-restore-link");
    button.addEventListener("click", () => startCheckout("paywall"));
    restoreLink.addEventListener("click", (event) => focusRestoreAccess(event, "paywall"));
    els.questionMount.innerHTML = "";
    els.questionMount.append(fragment);
    renderAccess();
  }

  async function startCheckout(source = "unknown") {
    trackEvent("checkout_clicked", { source: cleanAnalyticsText(source), mode: state.mode });
    setCheckoutLoading(true);
    try {
      const response = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
    [
      [els.checkoutBtn, "Unlock for EUR 0.99"],
      [els.stickyCheckoutBtn, "Unlock full coach"],
    ].forEach(([button, readyText]) => {
      if (!button) return;
      button.disabled = isLoading;
      button.textContent = isLoading ? "Opening checkout..." : readyText;
    });
  }

  function focusRestoreAccess(event, source = "unknown") {
    if (event) event.preventDefault();
    trackEvent("restore_access_clicked", { source: cleanAnalyticsText(source) });
    els.restoreForm.classList.remove("hidden");
    document.getElementById("unlock")?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => els.restoreEmail.focus(), 180);
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
      state.entitlement = {
        active: true,
        email: payload.email || "",
        sessionId,
        verifiedAt: new Date().toISOString(),
      };
      saveEntitlement();
      window.history.replaceState({}, "", window.location.pathname);
      trackEvent("checkout_success", { source: "stripe_return" });
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
        throw new Error(payload.error || "Login link is invalid or expired.");
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
      setStatus(`Restore access error: ${error.message}`);
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
    await syncLegacyLocalAttempts();
    await syncPendingAttempts();
    await syncPendingFlags();
    await syncCurrentFlags();
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
        saveProgress();
      }
    } catch {
      // Local progress remains available when the network is offline.
    }
  }

  async function syncPendingAttempts() {
    if (!state.session.authenticated || !state.progress.pendingAttempts.length) return;

    const attempts = state.progress.pendingAttempts.slice(0, 100);
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
      saveProgress();
    } catch {
      // Keep queued attempts for the next online/logged-in session.
    }
  }

  async function syncPendingFlags() {
    if (!state.session.authenticated || !state.progress.pendingFlags.length) return;

    const flags = collapseFlagOperations(state.progress.pendingFlags);
    try {
      const response = await fetch("/api/flags", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flags }),
      });
      if (!response.ok) return;

      state.progress.pendingFlags = [];
      saveProgress();
    } catch {
      // Keep queued flag changes for the next online/logged-in session.
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
    } catch {
      // Local flags still work offline.
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
      saveProgress();
    } catch {
      // Try again on the next logged-in load.
    }
  }

  async function requestLoginLink(event) {
    event.preventDefault();
    const email = els.restoreEmail.value.trim();
    setRestoreStatus("", "");

    if (!email) {
      setRestoreStatus("Enter the email used at checkout.", "error");
      return;
    }

    trackEvent("restore_access_clicked", { source: "restore_form" });
    els.restoreBtn.disabled = true;
    els.restoreBtn.textContent = "Sending...";
    try {
      const response = await fetch("/api/request-login-link", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Could not request login link.");
      }
      setRestoreStatus(payload.message || "Check your email for a login link.", "success");
    } catch (error) {
      setRestoreStatus(error.message, "error");
    } finally {
      els.restoreBtn.disabled = false;
      els.restoreBtn.textContent = "Send login link";
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

  function createAttemptEvent(question, selectedIndex, correct) {
    return {
      clientEventId: createClientEventId(),
      questionId: question.id,
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
      questionId: id,
      category: question?.category || "Uncategorised",
      active,
      updatedAt: new Date().toISOString(),
    });
    state.categorySummary = [];
    saveProgress();
    syncPendingFlags();
    updateStats();
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
    const answers = Object.values(state.progress.answers);
    const answered = answers.reduce((sum, item) => sum + item.attempts, 0);
    const correct = answers.reduce((sum, item) => sum + item.correct, 0);
    const highYield = state.questions.filter((question) => question.priorityScore >= 68).length;
    const signs = state.questions.filter((question) => question.isRoadSign).length;
    const today = state.progress.daily[dayKey()] || 0;
    const targetRatio = Math.min(1, today / DAILY_TARGET);

    els.answeredStat.textContent = String(answered);
    els.accuracyStat.textContent = answered ? `${Math.round((correct / answered) * 100)}%` : "0%";
    els.missedStat.textContent = String(state.progress.missed.size);
    els.flaggedStat.textContent = String(state.progress.flagged.size);
    els.highYieldStat.textContent = String(highYield);
    els.signsStat.textContent = String(signs);
    els.targetStat.textContent = `${Math.min(today, DAILY_TARGET)}/${DAILY_TARGET}`;
    els.targetMeter.style.width = `${Math.round(targetRatio * 100)}%`;
    els.questionCountChip.textContent = `${state.questions.length || 849} questions`;
    els.trustQuestionCount.textContent = String(state.questions.length || 849);
    els.coachCopy.textContent = coachCopy(answered, today);
    renderCategorySummary();
    renderAccess();
  }

  function renderCategorySummary() {
    const summaries = (state.categorySummary.length ? state.categorySummary : buildLocalCategorySummary())
      .slice()
      .sort((a, b) => {
        if (b.missedCount !== a.missedCount) return b.missedCount - a.missedCount;
        if (b.flaggedCount !== a.flaggedCount) return b.flaggedCount - a.flaggedCount;
        return a.accuracy - b.accuracy;
      })
      .slice(0, 4);

    els.categorySummary.innerHTML = "";
    if (!summaries.length) return;

    summaries.forEach((summary) => {
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
    if (state.session.entitlementActive) {
      els.unlockBadge.textContent = "Unlocked";
      els.unlockStatus.textContent = `Full access restored for ${state.session.email}.`;
      els.checkoutBtn.classList.add("hidden");
      els.restoreAccessLink.classList.add("hidden");
      els.restoreForm.classList.add("hidden");
      els.logoutBtn.classList.remove("hidden");
    } else if (state.entitlement.active) {
      els.unlockBadge.textContent = "Unlocked";
      els.unlockStatus.textContent = state.entitlement.email
        ? `Full access active for ${state.entitlement.email}. Use Restore access to sync another device.`
        : "Full access active on this browser. Use Restore access to sync another device.";
      els.checkoutBtn.classList.add("hidden");
      els.restoreAccessLink.classList.add("hidden");
      els.restoreForm.classList.remove("hidden");
      els.logoutBtn.classList.toggle("hidden", !state.session.authenticated);
    } else {
      els.unlockBadge.textContent = state.session.authenticated ? "Signed in" : "Preview";
      els.unlockStatus.textContent = state.session.authenticated
        ? `Signed in as ${state.session.email}. Unlock full coach to practise weak areas, road signs, mocks, and review mode.`
        : `Preview ${PREVIEW_LIMIT} questions. Unlock speed-focused high-yield drills, weak-area review, road signs, and mock tests.`;
      els.checkoutBtn.classList.remove("hidden");
      els.checkoutBtn.disabled = false;
      els.checkoutBtn.textContent = "Unlock for EUR 0.99";
      els.restoreAccessLink.classList.remove("hidden");
      els.restoreForm.classList.remove("hidden");
      els.logoutBtn.classList.toggle("hidden", !state.session.authenticated);
    }
    renderPreviewConversionState(!hasAccess());
    trackPreviewStarted();
  }

  function renderPreviewConversionState(isPreview) {
    els.mobileStickyCta.classList.toggle("hidden", !isPreview);
    document.body.classList.toggle("has-mobile-sticky-cta", isPreview);
  }

  function applyServerSession(payload) {
    state.session = {
      authenticated: Boolean(payload.authenticated),
      email: payload.email || "",
      entitlementActive: Boolean(payload.entitlement && payload.entitlement.active),
    };
  }

  function setRestoreStatus(message, type) {
    els.restoreStatus.textContent = message;
    els.restoreStatus.classList.toggle("success", type === "success");
    els.restoreStatus.classList.toggle("error", type === "error");
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

  function coachCopy(answered, today) {
    if (!answered) return "Start with High yield, then do one Mock test.";
    if (today < DAILY_TARGET) return `${DAILY_TARGET - today} more answers to hit today's target.`;
    if (state.progress.missed.size) return "Target hit. Clear missed questions before a new mock test.";
    return "Target hit. Try a timed mock test while the material is fresh.";
  }

  function dayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function buildStatusMessage(url) {
    const enriched = url.includes("enriched");
    return enriched
      ? `${state.questions.length} questions loaded with high-yield scoring.`
      : `${state.questions.length} recovered questions loaded. Run enrich_dataset.py for high-yield scoring.`;
  }

  function setStatus(message) {
    els.statusBar.textContent = message;
  }

  function setLoading(active) {
    document.body.classList.toggle("app-loading", active);
  }

  function renderLoading(message) {
    els.questionMount.innerHTML = `
      <div class="loading-state" role="status" aria-live="polite">
        <span class="loading-spinner" aria-hidden="true"></span>
        <span>${message}</span>
      </div>
    `;
  }

  function renderEmpty(message) {
    els.questionMount.innerHTML = `<div class="empty-state">${message}</div>`;
  }
})();
