(function () {
  var config = window.FlashCardsConfig || {};
  var baseURL = normalizeBase(config.baseURL || "/");
  var SOUND_EFFECTS = {
    correct: "audio/SNES - The Legend of Zelda_ A Link to the Past - Miscellaneous - Sound Effects/cursor.wav",
    wrong: "audio/SNES - The Legend of Zelda_ A Link to the Past - Miscellaneous - Sound Effects/cursor.wav",
    flipForward: "audio/SNES - The Legend of Zelda_ A Link to the Past - Miscellaneous - Sound Effects/arrow 1.wav",
    flipBack: "audio/SNES - The Legend of Zelda_ A Link to the Past - Miscellaneous - Sound Effects/arrow 2.wav",
    previous: "audio/SNES - The Legend of Zelda_ A Link to the Past - Miscellaneous - Sound Effects/fighter sword 1.wav",
    next: "audio/SNES - The Legend of Zelda_ A Link to the Past - Miscellaneous - Sound Effects/fighter sword 2.wav",
    cursor: "audio/SNES - The Legend of Zelda_ A Link to the Past - Miscellaneous - Sound Effects/cursor.wav"
  };
  var menu = [];
  var chapters = [];
  var progress = { sections: {} };
  var state = {
    chapterIndex: 0,
    sectionName: "",
    cardIndex: 0,
    flipped: false,
    transitioning: false,
    skipNextSeenMark: false,
    studyMode: "all",
    activeControllerPanel: "study",
    lastTocFocusKey: "",
    preferStudyPrimaryFocus: false,
    rovingIndexes: { toc: 0, study: 0, modal: 0 },
    gamepadCooldowns: {}
  };
  var session = { startedAt: Date.now(), reviews: 0, correct: 0 };
  var cardFitFrame = 0;
  var jsonCache = {};
  var speechState = { active: false };

  var els = {
    app: document.querySelector(".app-shell"),
    tocPanel: document.querySelector("[data-controller-panel='toc']"),
    studyPanel: document.querySelector("[data-controller-panel='study']"),
    controllerCommandBar: document.getElementById("controller-command-bar"),
    toc: document.getElementById("toc"),
    overallLabel: document.getElementById("overall-label"),
    overallBar: document.getElementById("overall-bar"),
    sectionLabel: document.getElementById("section-label"),
    chapterLabel: document.getElementById("chapter-label"),
    card: document.getElementById("card"),
    studyToolsLabel: document.querySelector("[data-study-tools-label]"),
    front: document.getElementById("card-front"),
    back: document.getElementById("card-back"),
    prev: document.getElementById("prev-card"),
    flip: document.getElementById("flip-card"),
    speak: document.getElementById("speak-card"),
    speakQuestion: document.getElementById("speak-question"),
    speakAnswer: document.getElementById("speak-answer"),
    stopSpeaking: document.getElementById("stop-speaking"),
    speechRate: document.getElementById("speech-rate"),
    speechVoice: document.getElementById("speech-voice"),
    speechStatus: document.getElementById("speech-status"),
    right: document.getElementById("right-card"),
    wrong: document.getElementById("wrong-card"),
    next: document.getElementById("next-card"),
    again: document.getElementById("again-card"),
    hard: document.getElementById("hard-card"),
    good: document.getElementById("good-card"),
    easy: document.getElementById("easy-card"),
    bookmark: document.getElementById("bookmark-card"),
    suspend: document.getElementById("suspend-card"),
    shuffle: document.getElementById("shuffle-mode"),
    dueMode: document.getElementById("due-mode"),
    sessionSummary: document.getElementById("session-summary"),
    count: document.getElementById("card-count"),
    audioPlayer: document.getElementById("audio-player"),
    sfxPlayer: document.getElementById("sfx-player"),
    controllerStatus: document.getElementById("controller-status"),
    controllerStatusLabel: document.getElementById("controller-status-label"),
    controllerStatusDetail: document.getElementById("controller-status-detail"),
    resetProgressButton: document.querySelector("[data-reset-progress]"),
    resetProgressStatus: document.querySelector("[data-reset-progress-status]"),
    mobileDeckToggle: document.querySelector("[data-mobile-deck-toggle]"),
    mobileDeckClosers: Array.from(document.querySelectorAll("[data-mobile-deck-close]"))
  };

  if (window.FlashCardsPretext) {
    boot();
  } else {
    window.addEventListener("flashcards-pretext-ready", boot, { once: true });
  }

  async function boot() {
    bindControls();

    try {
      menu = await fetchJson("assets/menu.json");
      var test = getCurrentTest();

      progress = loadProgress(test);
      chapters = await loadChapters(test);

      setInitialSection();
      renderAll();
    } catch (error) {
      console.error(error);
      showEmpty("The cards could not be loaded.");
    }
  }

  function normalizeBase(value) {
    return value.endsWith("/") ? value : value + "/";
  }

  function assetURL(path) {
    return baseURL + path.replace(/^\/+/, "");
  }

  async function fetchJson(path) {
    var url = assetURL(path);

    if (!jsonCache[url]) {
      jsonCache[url] = fetch(url).then(function (response) {
        if (!response.ok) {
          throw new Error("Unable to load " + path + ": " + response.status);
        }
        return response.json();
      });
    }

    return jsonCache[url];
  }

  function getCurrentTest() {
    var index = Number(config.testIndex);
    var test = menu[index];

    if (!test && config.testName) {
      test = menu.find(function (item) {
        return item.name === config.testName;
      });
      index = menu.indexOf(test);
    }

    if (!test) {
      throw new Error("Practice test not found.");
    }

    test.index = index;
    return test;
  }

  async function loadChapters(test) {
    return Promise.all(test.chapter.map(async function (chapter, i) {
      var deck = {};

      if (chapter.file) {
        deck = await fetchJson("assets/" + deckPath(test, chapter));
      }

      return {
        index: i,
        name: chapter.name,
        color: chapter.color || "#6E298D",
        file: chapter.file,
        sections: chapter.section || [],
        deck: normalizeDeck(deck),
        deckMeta: getDeckMeta(deck)
      };
    }));
  }

  function deckPath(test, chapter) {
    if (chapter.file.indexOf("/") >= 0) {
      return chapter.file;
    }

    if (test.assetPath) {
      return normalizeBase(test.assetPath) + chapter.file;
    }

    if (test.name === "CompTIA Network+") {
      return "Network+/" + chapter.file;
    }

    return chapter.file;
  }

  function getDeckMeta(deck) {
    if (!deck || typeof deck !== "object") {
      return {};
    }

    return {
      id: deck.id || "",
      name: deck.name || "",
      description: deck.description || ""
    };
  }

  function normalizeDeck(deck) {
    var normalized = {};

    if (!deck || typeof deck !== "object") {
      return normalized;
    }

    Object.keys(deck).forEach(function (key) {
      if (Array.isArray(deck[key])) {
        normalized[key] = deck[key].map(normalizeCard);
      }
    });

    if (Array.isArray(deck.cards)) {
      normalized[deck.id || "cards"] = deck.cards.map(normalizeNodeCard);
    }

    return normalized;
  }

  function normalizeCard(card) {
    var answers = normalizeAnswerList(card && card.A);
    var options = card && Array.isArray(card.O) ? card.O.map(String) : undefined;

    return {
      Q: card && card.Q ? String(card.Q) : "",
      A: answers,
      O: options,
      questionType: normalizeQuestionType(card && card.questionType, options, answers),
      frontAudio: card && card.frontAudio ? card.frontAudio : "",
      backAudio: card && card.backAudio ? card.backAudio : ""
    };
  }

  function normalizeNodeCard(card) {
    var front = card && card.front ? card.front : {};
    var back = card && card.back ? card.back : {};

    return {
      Q: front.text ? String(front.text) : "",
      A: back.text ? [String(back.text)] : [],
      O: undefined,
      frontAudio: front.audio || "",
      backAudio: back.audio || "",
      plainBack: true
    };
  }

  function normalizeAnswerList(answers) {
    if (Array.isArray(answers)) {
      return answers.map(String);
    }

    if (answers === undefined || answers === null) {
      return [];
    }

    return [String(answers)];
  }

  function normalizeQuestionType(questionType, options, answers) {
    var supported = ["true_false", "single_choice", "multiple_choice"];
    var value = String(questionType || "").trim().toLowerCase();

    if (!options || !options.length) {
      return "";
    }

    if (supported.indexOf(value) >= 0) {
      return value;
    }

    if (options.length === 2 && hasTrueFalseOptions(options)) {
      return "true_false";
    }

    return answers.length === 1 ? "single_choice" : "multiple_choice";
  }

  function hasTrueFalseOptions(options) {
    var values = options.map(function (option) {
      return String(option || "").trim().toLowerCase().replace(/[.?!]+$/, "");
    });

    return values.length === 2 && values.indexOf("true") >= 0 && values.indexOf("false") >= 0;
  }

  function isSingleChoiceQuestion(card) {
    return card && (card.questionType === "true_false" || card.questionType === "single_choice");
  }

  function questionTypeLabel(questionType) {
    if (questionType === "true_false") return "True or False";
    if (questionType === "single_choice") return "Single choice";
    return "Multiple choice";
  }

  function setInitialSection() {
    var hash = decodeURIComponent(window.location.hash.replace(/^#/, ""));
    var hashParts = new URLSearchParams(hash);
    var sectionFromHash = hashParts.get("section");
    var cardFromHash = Number(hashParts.get("card")) - 1;
    var target = findSection(sectionFromHash) || firstSectionWithCards() || firstSection();

    if (!target) {
      return;
    }

    state.chapterIndex = target.chapter.index;
    state.sectionName = target.section.name;
    state.cardIndex = Number.isFinite(cardFromHash) && cardFromHash >= 0 ? cardFromHash : 0;
    clampCardIndex();
  }

  function bindControls() {
    bindTestNavSound();

    if (els.mobileDeckToggle) {
      els.mobileDeckToggle.addEventListener("click", function () {
        setMobileDeckOpen(!els.app.classList.contains("is-mobile-deck-open"));
      });
    }
    els.mobileDeckClosers.forEach(function (closer) {
      closer.addEventListener("click", function () { setMobileDeckOpen(false, true); });
    });
    setMobileDeckOpen(false);

    els.prev.addEventListener("click", previousCard);
    els.next.addEventListener("click", nextCard);
    if (els.again) els.again.addEventListener("click", function () { gradeSpacedRepetition("again"); });
    if (els.hard) els.hard.addEventListener("click", function () { gradeSpacedRepetition("hard"); });
    if (els.good) els.good.addEventListener("click", function () { gradeSpacedRepetition("good"); });
    if (els.easy) els.easy.addEventListener("click", function () { gradeSpacedRepetition("easy"); });
    if (els.bookmark) els.bookmark.addEventListener("click", toggleBookmark);
    if (els.suspend) els.suspend.addEventListener("click", toggleSuspend);
    if (els.shuffle) els.shuffle.addEventListener("click", jumpToRandomCard);
    if (els.dueMode) els.dueMode.addEventListener("click", jumpToNextDueCard);
    els.flip.addEventListener("click", flipCard);
    els.speak.addEventListener("click", speakFullCard);
    if (els.speakQuestion) els.speakQuestion.addEventListener("click", speakQuestion);
    if (els.speakAnswer) els.speakAnswer.addEventListener("click", speakAnswer);
    if (els.stopSpeaking) els.stopSpeaking.addEventListener("click", stopPlayback);
    if (els.speechRate) els.speechRate.addEventListener("change", persistSpeechPreferences);
    if (els.speechVoice) els.speechVoice.addEventListener("change", persistSpeechPreferences);
    initializeSpeechControls();
    els.right.addEventListener("click", function () {
      markSelfGrade(true);
    });
    els.wrong.addEventListener("click", function () {
      markSelfGrade(false);
    });
    if (els.resetProgressButton && els.app && els.app.hasAttribute("data-enable-progress-reset")) {
      els.resetProgressButton.addEventListener("click", resetStoredProgress);
    }
    var cardGesture = { pointerId: null, x: 0, y: 0, time: 0, suppressClickUntil: 0 };
    els.card.addEventListener("pointerdown", function (event) {
      if (event.pointerType === "mouse" || (event.target instanceof Element && event.target.closest("button, a"))) {
        return;
      }
      cardGesture.pointerId = event.pointerId;
      cardGesture.x = event.clientX;
      cardGesture.y = event.clientY;
      cardGesture.time = Date.now();
    }, { passive: true });
    els.card.addEventListener("pointerup", function (event) {
      if (cardGesture.pointerId !== event.pointerId) return;
      var deltaX = event.clientX - cardGesture.x;
      var deltaY = event.clientY - cardGesture.y;
      var elapsed = Date.now() - cardGesture.time;
      cardGesture.pointerId = null;
      if (elapsed > 650) return;
      if (Math.abs(deltaX) > 54 && Math.abs(deltaX) > Math.abs(deltaY) * 1.15) {
        cardGesture.suppressClickUntil = Date.now() + 450;
        if (deltaX < 0) nextCard(); else previousCard();
      } else if (deltaY < -54 && Math.abs(deltaY) > Math.abs(deltaX) * 1.15) {
        cardGesture.suppressClickUntil = Date.now() + 450;
        flipCard();
      }
    }, { passive: true });
    els.card.addEventListener("pointercancel", function () {
      cardGesture.pointerId = null;
    }, { passive: true });
    els.card.addEventListener("click", function (event) {
      if (Date.now() < cardGesture.suppressClickUntil || (event.target instanceof Element && event.target.closest("button, a"))) {
        return;
      }

      flipCard();
    });

    document.addEventListener("click", function (event) {
      var action = event.target instanceof Element ? event.target.closest("button, a") : null;

      if (
        !action ||
        action.disabled ||
        action.closest(".test-nav") ||
        isControllerAction(action) ||
        action.closest(".quiz-controls")
      ) {
        return;
      }

      playSoundEffect("cursor");
    });

    document.addEventListener("keydown", function (event) {
      if (isTextInput(event.target)) {
        return;
      }

      var key = event.key.toLowerCase();
      var focusedControl = event.target instanceof HTMLElement && /a|button/i.test(event.target.tagName);

      if (event.key === "Escape" && els.app.classList.contains("is-mobile-deck-open")) {
        event.preventDefault();
        setMobileDeckOpen(false, true);
        return;
      }

      if (event.key === "ArrowLeft") {
        previousCard();
      } else if (event.key === "ArrowRight") {
        nextCard();
      } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        flipCard();
      } else if (!focusedControl && (event.key === " " || event.key === "Enter")) {
        event.preventDefault();
        flipCard();
      } else if (key === "x") {
        flipCard();
      } else if (key === "y") {
        speakFullCard();
      } else if (key === "a") {
        markSelfGrade(true);
      } else if (key === "b") {
        markSelfGrade(false);
      }
    });

    window.addEventListener("resize", function () {
      setMobileDeckOpen(false);
      scheduleCardContentFit();
    });

    window.addEventListener("gamepadconnected", function (event) {
      syncConnectedGamepadStatus(event.gamepad);
      ensureFocusedElement();
    });
    window.addEventListener("gamepaddisconnected", function () {
      syncConnectedGamepadStatus();
    });

    syncConnectedGamepadStatus();
    exposeControllerDebugApi();
    pollGamepads();
  }

  function setMobileDeckOpen(open, restoreFocus) {
    if (!els.app || !els.mobileDeckToggle || !els.tocPanel) return;
    var isMobile = window.matchMedia("(max-width: 800px)").matches;
    var shouldOpen = Boolean(open && isMobile);
    els.app.classList.toggle("is-mobile-deck-open", shouldOpen);
    els.mobileDeckToggle.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
    els.tocPanel.setAttribute("aria-hidden", shouldOpen || !isMobile ? "false" : "true");
    els.mobileDeckClosers.forEach(function (closer) { closer.tabIndex = shouldOpen ? 0 : -1; });

    if (shouldOpen) {
      window.requestAnimationFrame(function () {
        var active = els.tocPanel.querySelector(".section-button.is-active") || els.tocPanel.querySelector(".section-button:not(:disabled)");
        if (active) {
          active.focus({ preventScroll: true });
          active.scrollIntoView({ block: "nearest" });
        }
      });
    } else if (restoreFocus && els.mobileDeckToggle) {
      els.mobileDeckToggle.focus({ preventScroll: true });
    }
    scheduleCardContentFit();
  }

  function renderAll() {
    var chapter = currentChapter();

    if (chapter) {
      els.app.style.setProperty("--deck-accent", chapter.color);
    }

    if (state.skipNextSeenMark) {
      state.skipNextSeenMark = false;
    } else {
      markSeen();
    }
    renderToc();
    renderProgress();
    renderCard();
    renderControls();
    renderControllerPanelState();
    updateLocation();
    ensureFocusedElement();
    scheduleCardContentFit();
  }

  function renderToc() {
    els.toc.innerHTML = "";

    chapters.forEach(function (chapter) {
      var segment = document.createElement("section");
      var summary = document.createElement("button");
      var sectionList = document.createElement("div");
      var chapterProgress = getChapterProgress(chapter);

      segment.className = "chapter-segment";
      segment.style.setProperty("--chapter-color", chapter.color);

      summary.type = "button";
      summary.className = "chapter-summary";
      summary.innerHTML =
        "<strong>" + escapeHtml(chapter.name) + "</strong>" +
        '<small><span class="chapter-score">' + chapterProgress.percent + "%</span> " +
        chapterProgress.seen + "/" + chapterProgress.total + "</small>" +
        '<div class="progress-track"><span style="width: ' + chapterProgress.percent + '%"></span></div>';
      summary.addEventListener("click", function () {
        var target = firstSectionWithCards(chapter) || { chapter: chapter, section: chapter.sections[0] };
        if (target && target.section) {
          selectSection(chapter.index, target.section.name);
        }
      });

      sectionList.className = "section-list";

      chapter.sections.forEach(function (section) {
        var button = document.createElement("button");
        var cards = getCards(chapter, section.name);
        var sectionProgress = getSectionProgress(chapter, section.name);
        var isActive = chapter.index === state.chapterIndex && section.name === state.sectionName;

        button.type = "button";
        button.className = "section-button";
        button.dataset.controllerTarget = "toc";
        button.dataset.sectionKey = chapter.index + ":" + section.name;
        button.disabled = cards.length === 0;
        button.title = section.label ? section.name + " " + section.label : section.name;
        button.innerHTML =
          "<strong>" + escapeHtml(section.name) + "</strong>" +
          (section.label ? '<span class="section-title">' + escapeHtml(section.label) + "</span>" : "") +
          "<small>" + sectionProgress.seen + "/" + sectionProgress.total + " studied</small>";

        if (isActive) {
          button.classList.add("is-active");
        }

        if (sectionProgress.total > 0 && sectionProgress.seen === sectionProgress.total) {
          button.classList.add("is-complete");
        }

        button.addEventListener("click", function () {
          selectSection(chapter.index, section.name);
        });

        sectionList.appendChild(button);
      });

      segment.appendChild(summary);
      segment.appendChild(sectionList);
      els.toc.appendChild(segment);
    });
  }

  function renderProgress() {
    var totals = getOverallProgress();
    var quiz = getOverallQuizProgress();

    var progressText;

    if (!totals.total) {
      progressText = "No cards in this test yet";
    } else if (quiz.total) {
      progressText = totals.seen + " of " + totals.total + " cards studied | Score " + quizSummaryText(quiz);
    } else {
      progressText = totals.seen + " of " + totals.total + " cards studied";
    }

    setPretextText(els.overallLabel, progressText);

    els.overallBar.style.width = totals.percent + "%";
  }

  function renderCard() {
    var chapter = currentChapter();
    var cards = currentCards();
    var card = cards[state.cardIndex];

    if (!chapter || !card) {
      showEmpty("This practice test route is ready, but no card deck has been added for it yet.");
      return;
    }

    setPretextText(els.sectionLabel, sectionHeading());
    setPretextText(els.chapterLabel, chapter.name);
    els.card.classList.toggle("is-flipped", state.flipped);

    renderQuestion(els.front, card);
    renderAnswers(els.back, card.A, card);

    setPretextText(els.count, "Card " + (state.cardIndex + 1) + " of " + cards.length);
  }

  function renderControls() {
    var cards = currentCards();
    var hasCard = cards.length > 0;
    var selfGrade = hasCard ? getSelfGrade(currentSectionKey(), state.cardIndex) : null;

    els.prev.disabled = state.transitioning || !previousTarget();
    els.next.disabled = state.transitioning || !nextTarget();
    els.flip.disabled = state.transitioning || !hasCard;
    els.speak.disabled = state.transitioning || !hasCard;
    if (els.speakQuestion) els.speakQuestion.disabled = state.transitioning || !hasCard;
    if (els.speakAnswer) els.speakAnswer.disabled = state.transitioning || !hasCard;
    if (els.stopSpeaking) els.stopSpeaking.disabled = !speechState.active;
    els.right.disabled = state.transitioning || !hasCard;
    els.wrong.disabled = state.transitioning || !hasCard;
    if (els.again) els.again.disabled = state.transitioning || !hasCard;
    if (els.hard) els.hard.disabled = state.transitioning || !hasCard;
    if (els.good) els.good.disabled = state.transitioning || !hasCard;
    if (els.easy) els.easy.disabled = state.transitioning || !hasCard;
    if (els.bookmark) {
      els.bookmark.disabled = !hasCard;
      els.bookmark.classList.toggle("is-selected", hasCard && isBookmarked(currentSectionKey(), state.cardIndex));
      els.bookmark.textContent = hasCard && isBookmarked(currentSectionKey(), state.cardIndex) ? "Bookmarked" : "Bookmark";
    }
    if (els.suspend) {
      els.suspend.disabled = !hasCard;
      els.suspend.classList.toggle("is-selected", hasCard && isSuspended(currentSectionKey(), state.cardIndex));
      els.suspend.textContent = hasCard && isSuspended(currentSectionKey(), state.cardIndex) ? "Suspended" : "Suspend";
    }
    renderSessionSummary();
    els.right.classList.toggle("is-selected", Boolean(selfGrade && selfGrade.correct));
    els.wrong.classList.toggle("is-selected", Boolean(selfGrade && !selfGrade.correct));
    syncStudyState();
  }

  function syncStudyState() {
    var showingAnswer = Boolean(state.flipped);
    var side = showingAnswer ? "back" : "front";
    var flipLabel = els.flip && els.flip.querySelector("span:last-child");

    if (els.app) {
      els.app.dataset.cardSide = side;
    }
    if (flipLabel) {
      flipLabel.textContent = showingAnswer ? "Show question" : "Show answer";
    }
    if (els.flip) {
      els.flip.setAttribute("aria-label", showingAnswer ? "Show the question side" : "Show the answer side");
    }
    if (els.studyToolsLabel) {
      els.studyToolsLabel.hidden = !showingAnswer;
    }
  }

  function showEmpty(message) {
    els.sectionLabel.textContent = "No deck";
    els.chapterLabel.textContent = config.testName || "Practice Test";
    resetCardFace(els.front).appendChild(emptyMessage(message));
    resetCardFace(els.back).appendChild(emptyMessage(message));
    els.card.classList.remove("is-flipped");
    els.count.textContent = "";
    renderControls();
    scheduleCardContentFit();
  }

  function scheduleCardContentFit() {
    if (cardFitFrame) {
      window.cancelAnimationFrame(cardFitFrame);
    }

    cardFitFrame = window.requestAnimationFrame(function () {
      cardFitFrame = 0;
      fitCardContents();
    });
  }

  function fitCardContents() {
    // Pretext owns wrapping and text-height measurement. Faces scroll after a
    // readable font floor rather than shrinking one side independently.
    els.front.style.setProperty("--card-content-scale", "1");
    els.back.style.setProperty("--card-content-scale", "1");
    syncAnswerPromptTypography();
    layoutPretextText(els.app || els.card);
  }

  function syncAnswerPromptTypography() {
    var frontQuestion = els.front && els.front.querySelector(".card-question");
    var answerPrompt = els.back && els.back.querySelector(".card-question--prompt");

    if (!frontQuestion || !answerPrompt) {
      return;
    }

    var source = window.getComputedStyle(frontQuestion);
    ["fontSize", "fontWeight", "letterSpacing", "lineHeight", "textTransform", "textAlign"].forEach(function (property) {
      answerPrompt.style[property] = source[property];
    });
  }

  function layoutPretextText(root) {
    var pretext = window.FlashCardsPretext;

    if (!pretext || !root) {
      return;
    }

    Array.from(root.querySelectorAll("[data-pretext-text]")).forEach(function (element) {
      var source = element.dataset.pretextText || "";
      var style = window.getComputedStyle(element);
      var maxWidth = Math.max(1, (element.clientWidth || (element.parentElement ? element.parentElement.clientWidth : 0)) - horizontalPadding(style));
      var font = pretextFont(style);
      var lineHeight = parseLineHeight(style);
      var cacheKey = font + "\u0000" + source;
      var prepared = element._pretextCacheKey === cacheKey ? element._pretextPrepared : null;
      var layout;

      if (!prepared) {
        prepared = pretext.prepareWithSegments(source, font, { wordBreak: "normal" });
        element._pretextCacheKey = cacheKey;
        element._pretextPrepared = prepared;
      }

      layout = pretext.layoutWithLines(prepared, maxWidth, lineHeight);
      element.replaceChildren();
      layout.lines.forEach(function (line) {
        var lineElement = document.createElement("span");
        lineElement.className = "pretext-line";
        lineElement.textContent = line.text || "\u00a0";
        lineElement.style.setProperty("--pretext-line-width", line.width.toFixed(2) + "px");
        element.appendChild(lineElement);
      });
      element.dataset.pretextLineCount = String(layout.lineCount || 1);
      element.dataset.pretextHeight = String(Math.max(lineHeight, layout.height).toFixed(2));
      element.style.setProperty("--pretext-height", Math.max(lineHeight, layout.height).toFixed(2) + "px");
    });
  }

  function pretextFont(style) {
    return [style.fontStyle, style.fontWeight, style.fontSize, style.fontFamily].filter(Boolean).join(" ");
  }

  function parseLineHeight(style) {
    var value = parseFloat(style.lineHeight);
    return Number.isFinite(value) ? value : parseFloat(style.fontSize) * 1.35;
  }

  function horizontalPadding(style) {
    return (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
  }

  function cardFaceContent(face) {
    var content = face.querySelector(":scope > .card-face-content");

    if (!content) {
      content = document.createElement("div");
      content.className = "card-face-content";
      face.appendChild(content);
    }

    return content;
  }

  function cardFaceMeta(face) {
    var meta = face.querySelector(":scope > .card-face-meta");

    if (!meta) {
      meta = document.createElement("div");
      meta.className = "card-face-meta";
      meta.setAttribute("aria-hidden", "true");
      face.insertBefore(meta, cardFaceContent(face));
    }

    return meta;
  }

  function resetCardFace(face) {
    var content = cardFaceContent(face);

    cardFaceMeta(face).querySelectorAll(".card-type-badge").forEach(function (badge) {
      badge.remove();
    });
    content.replaceChildren();
    return content;
  }

  function pretextText(text, className) {
    var element = document.createElement("span");
    element.className = (className || "") + " pretext-text";
    element.dataset.pretextText = String(text || "");
    element.textContent = String(text || "");
    return element;
  }

  function setPretextText(element, text) {
    if (!element) return;
    element.replaceChildren(pretextText(text));
  }

  function emptyMessage(message) {
    return pretextText(message, "empty-message");
  }

  function renderText(element, text, className) {
    element.appendChild(pretextText(text, "card-question" + (className ? " " + className : "")));
  }

  function renderCardTypeBadge(face, label) {
    var badge = pretextText(label, "card-face-chip card-type-badge");

    cardFaceMeta(face).appendChild(badge);
    return badge;
  }

  function sectionHeading() {
    var chapter = currentChapter();
    var section = chapter && chapter.sections.find(function (item) {
      return item.name === state.sectionName;
    });

    if (section && section.label && chapter.deckMeta && chapter.deckMeta.id === section.name) {
      return section.label;
    }

    if (section && section.label) {
      return "Section " + section.name + ": " + section.label;
    }

    return "Section " + state.sectionName;
  }

  function renderQuestion(element, card) {
    var options = card && Array.isArray(card.O) ? card.O : [];
    var quiz = options.length ? getQuizEntry(currentSectionKey(), state.cardIndex) : null;
    var selected = quiz ? quiz.selected : [];
    var content = resetCardFace(element);

    element.classList.toggle("has-options", options.length > 0);
    renderText(content, card ? card.Q : "");

    if (!options.length) {
      return;
    }

    renderCardTypeBadge(element, questionTypeLabel(card && card.questionType));

    var list = document.createElement("ul");
    list.className = "option-list";

    options.forEach(function (option) {
      var item = document.createElement("li");
      var button = document.createElement("button");
      var isSelected = selected.indexOf(option) >= 0;
      var isCorrect = quiz && quiz.graded && isCorrectAnswer(card, option);
      var isWrongSelection = quiz && quiz.graded && isSelected && !isCorrect;
      var isMissed = quiz && quiz.graded && !isSelected && isCorrect;

      button.type = "button";
      button.className = "option-button";
      button.appendChild(pretextText(option));
      button.setAttribute("aria-pressed", isSelected ? "true" : "false");
      button.disabled = Boolean(quiz && quiz.graded);
      button.addEventListener("click", function () {
        toggleOption(option);
      });

      item.classList.toggle("is-selected", isSelected);
      item.classList.toggle("is-correct", Boolean(isCorrect));
      item.classList.toggle("is-incorrect", Boolean(isWrongSelection));
      item.classList.toggle("is-missed", Boolean(isMissed));
      item.appendChild(button);
      list.appendChild(item);
    });

    content.appendChild(list);
    content.appendChild(renderQuizControls(card, quiz));
  }

  function renderAnswerOptions(face, content, card, options) {
    var list = document.createElement("ul");

    face.classList.add("has-options");
    face.classList.remove("has-plain-back");
    list.className = "option-list option-list--answer";
    list.setAttribute("aria-label", "Answer options");

    options.forEach(function (option) {
      var item = document.createElement("li");
      var button = document.createElement("button");
      var correct = isCorrectAnswer(card, option);

      button.type = "button";
      button.className = "option-button";
      button.appendChild(pretextText(option));
      button.disabled = true;
      button.setAttribute("aria-disabled", "true");

      item.classList.toggle("is-correct", correct);
      item.classList.toggle("is-muted", !correct);
      item.appendChild(button);
      list.appendChild(item);
    });

    content.appendChild(list);
  }

  function renderAnswers(element, answers, card) {
    var list = document.createElement("ul");
    var normalizedAnswers = answers || [];
    var options = card && Array.isArray(card.O) ? card.O : [];
    var content = resetCardFace(element);

    element.classList.remove("has-options");
    renderText(content, card ? card.Q : "", "card-question--prompt");

    if (options.length) {
      renderAnswerOptions(element, content, card, options);
      return;
    }

    if (card && card.plainBack && normalizedAnswers.length <= 1) {
      renderText(content, normalizedAnswers[0] || "", "card-answer-text");
      element.classList.add("has-plain-back");
      return;
    }

    element.classList.remove("has-plain-back");
    list.className = "answer-list";

    normalizedAnswers.forEach(function (answer) {
      var item = document.createElement("li");
      item.appendChild(pretextText(answer));
      list.appendChild(item);
    });

    content.appendChild(list);
  }

  function selectSection(chapterIndex, sectionName) {
    stopPlayback();
    setMobileDeckOpen(false);
    state.chapterIndex = chapterIndex;
    state.sectionName = sectionName;
    state.lastTocFocusKey = chapterIndex + ":" + sectionName;
    state.cardIndex = 0;
    state.flipped = false;
    state.preferStudyPrimaryFocus = true;
    state.rovingIndexes.study = studyPrimaryIndex();
    focusControllerPanel("study", { deferFocus: true, silent: true });
    renderAll();
  }

  async function previousCard() {
    var target = previousTarget();

    if (!target || state.transitioning) {
      return;
    }

    await navigateToTarget(target, "previous");
  }

  async function nextCard() {
    var target = nextTarget();

    if (!target || state.transitioning) {
      return;
    }

    await navigateToTarget(target, "next");
  }

  async function navigateToTarget(target, direction) {
    state.transitioning = true;
    renderControls();
    stopPlayback();
    playSoundEffect(direction);

    await runCardTransition("slide-out-" + direction);

    state.chapterIndex = target.chapterIndex;
    state.sectionName = target.sectionName;
    state.cardIndex = target.cardIndex;
    state.flipped = false;
    clampCardIndex();
    renderAll();

    await runCardTransition("slide-in-" + direction);

    state.transitioning = false;
    renderControls();
  }

  function runCardTransition(className) {
    return new Promise(function (resolve) {
      var done = false;
      var timeout = window.setTimeout(finish, 520);

      function finish() {
        if (done) {
          return;
        }

        done = true;
        window.clearTimeout(timeout);
        els.card.removeEventListener("animationend", onAnimationEnd);
        els.card.classList.remove(className);
        resolve();
      }

      function onAnimationEnd(event) {
        if (event.target === els.card) {
          finish();
        }
      }

      els.card.addEventListener("animationend", onAnimationEnd);
      els.card.classList.add(className);
    });
  }

  function flipCard() {
    if (state.transitioning || !currentCards().length) {
      return;
    }

    stopPlayback();
    playSoundEffect(state.flipped ? "flipBack" : "flipForward");
    state.flipped = !state.flipped;
    els.card.classList.toggle("is-flipped", state.flipped);
    syncStudyState();
  }

  function initializeSpeechControls() {
    var saved = {};

    try {
      saved = JSON.parse(localStorage.getItem("flash-cards:speech-preferences") || "{}");
    } catch (error) {}

    if (els.speechRate && saved.rate) els.speechRate.value = String(saved.rate);
    if (els.speechVoice && saved.voice) els.speechVoice.dataset.savedVoice = saved.voice;
    populateSpeechVoices();

    if ("speechSynthesis" in window) {
      window.speechSynthesis.onvoiceschanged = populateSpeechVoices;
    }

    if (els.audioPlayer) {
      els.audioPlayer.addEventListener("play", function () { setSpeechState(true, "Playing recorded audio"); });
      els.audioPlayer.addEventListener("ended", function () { setSpeechState(false, "Finished reading"); });
      els.audioPlayer.addEventListener("error", function () { setSpeechState(false, "Audio could not be played"); });
    }
  }

  function populateSpeechVoices() {
    if (!els.speechVoice || !("speechSynthesis" in window)) {
      return;
    }

    var selected = els.speechVoice.value || els.speechVoice.dataset.savedVoice || "";
    var voices = window.speechSynthesis.getVoices().slice().sort(function (a, b) {
      return a.name.localeCompare(b.name);
    });

    els.speechVoice.replaceChildren();
    var defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "System default";
    els.speechVoice.appendChild(defaultOption);
    voices.forEach(function (voice) {
      var option = document.createElement("option");
      option.value = voice.name;
      option.textContent = voice.name + " — " + voice.lang;
      els.speechVoice.appendChild(option);
    });
    els.speechVoice.value = Array.from(els.speechVoice.options).some(function (option) { return option.value === selected; }) ? selected : "";
  }

  function persistSpeechPreferences() {
    try {
      localStorage.setItem("flash-cards:speech-preferences", JSON.stringify({
        rate: els.speechRate ? els.speechRate.value : "1",
        voice: els.speechVoice ? els.speechVoice.value : ""
      }));
    } catch (error) {}
  }

  function speakQuestion() {
    var card = currentCards()[state.cardIndex];
    if (card) speakSpeech({ text: card.Q, audio: card.frontAudio, label: "question" });
  }

  function speakAnswer() {
    var card = currentCards()[state.cardIndex];
    if (card) speakSpeech({ text: normalizeAnswerList(card.A).join(". "), audio: card.backAudio, label: "answer" });
  }

  function speakFullCard() {
    var card = currentCards()[state.cardIndex];
    if (!card) return;

    fallbackSpeak("Question. " + card.Q + ". Answer. " + normalizeAnswerList(card.A).join(". "), "full card");
  }

  function speakSpeech(speech) {
    if (!speech || !speech.text) return;

    stopPlayback(true);
    if (speech.audio && els.audioPlayer) {
      els.audioPlayer.src = mediaURL(speech.audio);
      els.audioPlayer.play().catch(function () {
        fallbackSpeak(speech.text, speech.label);
      });
      return;
    }

    fallbackSpeak(speech.text, speech.label);
  }

  function fallbackSpeak(text, label) {
    if (!("speechSynthesis" in window)) {
      setSpeechState(false, "Speech is not supported in this browser");
      return;
    }

    window.speechSynthesis.cancel();
    var utterance = new SpeechSynthesisUtterance(text);
    var voiceName = els.speechVoice ? els.speechVoice.value : "";
    var rate = els.speechRate ? Number(els.speechRate.value) : 1;
    var voice = window.speechSynthesis.getVoices().find(function (item) { return item.name === voiceName; });

    utterance.rate = Number.isFinite(rate) ? rate : 1;
    utterance.pitch = 1;
    if (voice) utterance.voice = voice;
    utterance.onstart = function () { setSpeechState(true, "Reading " + (label || "card")); };
    utterance.onend = function () { setSpeechState(false, "Finished reading"); };
    utterance.onerror = function () { setSpeechState(false, "Speech could not be played"); };
    window.speechSynthesis.speak(utterance);
  }

  function setSpeechState(active, status) {
    speechState.active = Boolean(active);
    if (els.speechStatus) els.speechStatus.textContent = status;
    if (els.stopSpeaking) els.stopSpeaking.disabled = !speechState.active;
  }

  function stopPlayback(silent) {
    if (els.audioPlayer) {
      els.audioPlayer.pause();
      els.audioPlayer.removeAttribute("src");
      els.audioPlayer.load();
    }

    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    if (speechState.active || !silent) {
      setSpeechState(false, silent ? "Ready to read" : "Stopped");
    }
  }

  function playSoundEffect(effectName) {
    var source = SOUND_EFFECTS[effectName];

    if (!source || !els.sfxPlayer) {
      return;
    }

    els.sfxPlayer.pause();
    if (els.sfxPlayer.getAttribute("src") !== mediaURL(source)) {
      els.sfxPlayer.src = mediaURL(source);
    }
    els.sfxPlayer.currentTime = 0;
    els.sfxPlayer.play().catch(function () {});
  }

  function mediaURL(path) {
    if (/^(https?:|data:|blob:)/i.test(path)) {
      return path;
    }

    return assetURL(path);
  }

  function markSelfGrade(correct) {
    if (!currentCards().length) {
      return;
    }

    var key = currentSectionKey();
    var data = ensureProgressSection(key);
    var id = String(state.cardIndex);
    var entry = data.selfGrade[id] || { attempts: 0 };

    entry.correct = Boolean(correct);
    entry.attempts = Number(entry.attempts || 0) + 1;
    data.selfGrade[id] = entry;

    stopPlayback();
    playSoundEffect(correct ? "correct" : "wrong");
    saveProgress();

    if (nextTarget()) {
      nextCard();
      return;
    }

    renderAll();
  }

  function toggleOption(option) {
    var cards = currentCards();
    var card = cards[state.cardIndex];

    if (!card || !Array.isArray(card.O) || !card.O.length) {
      return;
    }

    var quiz = ensureQuizEntry(currentSectionKey(), state.cardIndex);
    var index = quiz.selected.indexOf(option);

    if (quiz.graded) {
      return;
    }

    if (index >= 0) {
      quiz.selected.splice(index, 1);
    } else if (isSingleChoiceQuestion(card)) {
      quiz.selected = [option];
    } else {
      quiz.selected.push(option);
    }

    saveProgress();
    renderAll();
  }

  function gradeCurrentCard() {
    var cards = currentCards();
    var card = cards[state.cardIndex];

    if (!card || !Array.isArray(card.O) || !card.O.length) {
      return;
    }

    var quiz = ensureQuizEntry(currentSectionKey(), state.cardIndex);
    quiz.selected = quiz.selected.filter(function (option) {
      return card.O.indexOf(option) >= 0;
    });
    if (isSingleChoiceQuestion(card) && quiz.selected.length > 1) {
      quiz.selected = [quiz.selected[quiz.selected.length - 1]];
    }
    quiz.graded = true;
    quiz.correct = selectionsMatchAnswers(quiz.selected, card.A);
    quiz.attempts = Number(quiz.attempts || 0) + 1;

    playSoundEffect(quiz.correct ? "correct" : "wrong");
    saveProgress();
    renderAll();
  }

  function resetCurrentGrade() {
    var data = ensureProgressSection(currentSectionKey());
    var quiz = ensureQuizEntry(currentSectionKey(), state.cardIndex);

    quiz.graded = false;
    quiz.correct = false;
    delete data.selfGrade[String(state.cardIndex)];

    saveProgress();
    renderAll();
  }

  function resetStoredProgress() {
    if (!window.confirm("Reset all saved scores and progress for this deck in this browser?")) {
      return;
    }

    stopPlayback();
    progress = { sections: {} };
    state.flipped = false;
    state.transitioning = false;
    state.skipNextSeenMark = true;
    localStorage.removeItem(progressKey(getCurrentTest()));

    if (els.resetProgressStatus) {
      els.resetProgressStatus.textContent = "Progress reset for this deck.";
    }

    renderAll();
  }

  function toggleBookmark() {
    var key = currentSectionKey();
    var data = ensureProgressSection(key);
    var id = String(state.cardIndex);
    var list = data.bookmarks;
    var index = list.indexOf(id);
    if (index >= 0) list.splice(index, 1); else list.push(id);
    saveProgress();
    renderControls();
  }

  function toggleSuspend() {
    var key = currentSectionKey();
    var data = ensureProgressSection(key);
    var id = String(state.cardIndex);
    var list = data.suspended;
    var index = list.indexOf(id);
    if (index >= 0) list.splice(index, 1); else list.push(id);
    saveProgress();
    renderControls();
  }

  function isBookmarked(key, cardIndex) {
    return ensureProgressSection(key).bookmarks.indexOf(String(cardIndex)) >= 0;
  }

  function isSuspended(key, cardIndex) {
    return ensureProgressSection(key).suspended.indexOf(String(cardIndex)) >= 0;
  }

  function gradeSpacedRepetition(grade) {
    if (!currentCards().length) return;
    var key = currentSectionKey();
    var data = ensureProgressSection(key);
    var id = String(state.cardIndex);
    var previous = data.schedule[id] || { ease: 2.5, interval: 0, repetitions: 0, lapses: 0 };
    data.schedule[id] = sm2(previous, grade);
    session.reviews += 1;
    if (grade === "good" || grade === "easy") session.correct += 1;
    markSelfGrade(grade !== "again");
  }

  function sm2(previous, grade) {
    var quality = { again: 1, hard: 3, good: 4, easy: 5 }[grade] || 4;
    var ease = Number(previous.ease || 2.5);
    var interval = Number(previous.interval || 0);
    var repetitions = Number(previous.repetitions || 0);
    var lapses = Number(previous.lapses || 0);

    ease = Math.max(1.3, ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));

    if (quality < 3) {
      repetitions = 0;
      interval = 0.01;
      lapses += 1;
    } else if (repetitions === 0) {
      interval = grade === "hard" ? 0.5 : 1;
      repetitions = 1;
    } else if (repetitions === 1) {
      interval = grade === "easy" ? 4 : grade === "hard" ? 3 : 6;
      repetitions = 2;
    } else {
      interval = Math.round(interval * ease * (grade === "easy" ? 1.35 : grade === "hard" ? 0.75 : 1));
      repetitions += 1;
    }

    return {
      algorithm: "SM-2",
      grade: grade,
      ease: Number(ease.toFixed(2)),
      interval: interval,
      repetitions: repetitions,
      lapses: lapses,
      reviewedAt: new Date().toISOString(),
      due: new Date(Date.now() + interval * 24 * 60 * 60 * 1000).toISOString()
    };
  }

  function jumpToRandomCard() {
    var refs = allCardRefs().filter(function (ref) { return !isSuspended(ref.key, ref.cardIndex); });
    if (!refs.length) return;
    var ref = refs[Math.floor(Math.random() * refs.length)];
    state.chapterIndex = ref.chapterIndex;
    state.sectionName = ref.sectionName;
    state.cardIndex = ref.cardIndex;
    state.flipped = false;
    renderAll();
  }

  function jumpToNextDueCard() {
    var now = Date.now();
    var refs = allCardRefs().filter(function (ref) {
      if (isSuspended(ref.key, ref.cardIndex)) return false;
      var entry = ensureProgressSection(ref.key).schedule[String(ref.cardIndex)];
      return !entry || !entry.due || Date.parse(entry.due) <= now;
    });
    if (!refs.length) {
      if (els.sessionSummary) els.sessionSummary.textContent = "No due cards right now. Nice work.";
      return;
    }
    var ref = refs[0];
    state.chapterIndex = ref.chapterIndex;
    state.sectionName = ref.sectionName;
    state.cardIndex = ref.cardIndex;
    state.flipped = false;
    renderAll();
  }

  function allCardRefs() {
    var refs = [];
    chapters.forEach(function (chapter) {
      chapter.sections.forEach(function (section) {
        getCards(chapter, section.name).forEach(function (_card, cardIndex) {
          refs.push({ chapterIndex: chapter.index, sectionName: section.name, cardIndex: cardIndex, key: chapter.index + ":" + section.name });
        });
      });
    });
    return refs;
  }

  function renderSessionSummary() {
    if (!els.sessionSummary) return;
    var minutes = Math.floor((Date.now() - session.startedAt) / 60000);
    var accuracy = session.reviews ? Math.round((session.correct / session.reviews) * 100) : 0;
    els.sessionSummary.textContent = "Session " + minutes + "m · " + session.reviews + " reviews" + (session.reviews ? " · " + accuracy + "%" : "");
  }

  function previousTarget() {
    var cards = currentCards();
    var sections = sectionsWithCards();
    var sectionIndex = currentFlatSectionIndex(sections);

    if (cards.length && state.cardIndex > 0) {
      return {
        chapterIndex: state.chapterIndex,
        sectionName: state.sectionName,
        cardIndex: state.cardIndex - 1
      };
    }

    if (sectionIndex > 0) {
      var previous = sections[sectionIndex - 1];
      return {
        chapterIndex: previous.chapter.index,
        sectionName: previous.section.name,
        cardIndex: getCards(previous.chapter, previous.section.name).length - 1
      };
    }

    return null;
  }

  function nextTarget() {
    var cards = currentCards();
    var sections = sectionsWithCards();
    var sectionIndex = currentFlatSectionIndex(sections);

    if (cards.length && state.cardIndex < cards.length - 1) {
      return {
        chapterIndex: state.chapterIndex,
        sectionName: state.sectionName,
        cardIndex: state.cardIndex + 1
      };
    }

    if (sectionIndex >= 0 && sectionIndex < sections.length - 1) {
      var next = sections[sectionIndex + 1];
      return {
        chapterIndex: next.chapter.index,
        sectionName: next.section.name,
        cardIndex: 0
      };
    }

    return null;
  }

  function currentFlatSectionIndex(sections) {
    return sections.findIndex(function (item) {
      return item.chapter.index === state.chapterIndex && item.section.name === state.sectionName;
    });
  }

  function sectionsWithCards() {
    var sections = [];

    chapters.forEach(function (chapter) {
      chapter.sections.forEach(function (section) {
        if (getCards(chapter, section.name).length) {
          sections.push({ chapter: chapter, section: section });
        }
      });
    });

    return sections;
  }

  function firstSectionWithCards(chapterFilter) {
    var source = chapterFilter ? [chapterFilter] : chapters;

    for (var i = 0; i < source.length; i++) {
      var chapter = source[i];

      for (var j = 0; j < chapter.sections.length; j++) {
        var section = chapter.sections[j];

        if (getCards(chapter, section.name).length) {
          return { chapter: chapter, section: section };
        }
      }
    }

    return null;
  }

  function firstSection() {
    var chapter = chapters[0];

    if (!chapter || !chapter.sections.length) {
      return null;
    }

    return { chapter: chapter, section: chapter.sections[0] };
  }

  function findSection(sectionName) {
    if (!sectionName) {
      return null;
    }

    for (var i = 0; i < chapters.length; i++) {
      var chapter = chapters[i];
      var section = chapter.sections.find(function (item) {
        return item.name === sectionName;
      });

      if (section) {
        return { chapter: chapter, section: section };
      }
    }

    return null;
  }

  function bindTestNavSound() {
    document.querySelectorAll(".test-nav a").forEach(function (link) {
      link.addEventListener("click", function (event) {
        if (event.defaultPrevented || shouldLetBrowserHandleRouteClick(event, link)) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        playSoundEffect("cursor");

        window.setTimeout(function () {
          if (link.href === window.location.href) {
            return;
          }

          window.location.href = link.href;
        }, 120);
      });
    });
  }

  function shouldLetBrowserHandleRouteClick(event, link) {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      link.target ||
      link.hasAttribute("download")
    ) {
      return true;
    }

    return false;
  }

  function currentChapter() {
    return chapters[state.chapterIndex];
  }

  function currentCards() {
    var chapter = currentChapter();
    return chapter ? getCards(chapter, state.sectionName) : [];
  }

  function getCards(chapter, sectionName) {
    return chapter.deck[sectionName] || [];
  }

  function clampCardIndex() {
    var cards = currentCards();

    if (!cards.length) {
      state.cardIndex = 0;
      return;
    }

    state.cardIndex = Math.max(0, Math.min(state.cardIndex, cards.length - 1));
  }

  function currentSectionKey() {
    return state.chapterIndex + ":" + state.sectionName;
  }

  function ensureProgressSection(key) {
    if (!progress.sections[key]) {
      progress.sections[key] = { seen: [] };
    }

    progress.sections[key].seen = uniqueStrings(progress.sections[key].seen);
    progress.sections[key].quiz = progress.sections[key].quiz || {};
    progress.sections[key].selfGrade = progress.sections[key].selfGrade || {};
    progress.sections[key].schedule = progress.sections[key].schedule || {};
    progress.sections[key].bookmarks = uniqueStrings(progress.sections[key].bookmarks || []);
    progress.sections[key].suspended = uniqueStrings(progress.sections[key].suspended || []);
    return progress.sections[key];
  }

  function ensureQuizEntry(key, cardIndex) {
    var data = ensureProgressSection(key);
    var id = String(cardIndex);

    if (!data.quiz[id]) {
      data.quiz[id] = { selected: [], graded: false, correct: false, attempts: 0 };
    }

    data.quiz[id].selected = uniqueStrings(data.quiz[id].selected);
    data.quiz[id].graded = Boolean(data.quiz[id].graded);
    data.quiz[id].correct = Boolean(data.quiz[id].correct);
    data.quiz[id].attempts = Number(data.quiz[id].attempts || 0);
    return data.quiz[id];
  }

  function getQuizEntry(key, cardIndex) {
    var data = ensureProgressSection(key);
    var id = String(cardIndex);
    var entry = data.quiz[id];

    if (!entry) {
      return { selected: [], graded: false, correct: false, attempts: 0 };
    }

    entry.selected = uniqueStrings(entry.selected);
    entry.graded = Boolean(entry.graded);
    entry.correct = Boolean(entry.correct);
    entry.attempts = Number(entry.attempts || 0);
    return entry;
  }

  function getSelfGrade(key, cardIndex) {
    var data = ensureProgressSection(key);
    var entry = data.selfGrade[String(cardIndex)];

    if (!entry) {
      return null;
    }

    entry.correct = Boolean(entry.correct);
    entry.attempts = Number(entry.attempts || 0);
    return entry;
  }

  function markSeen() {
    if (!currentCards().length) {
      return;
    }

    var data = ensureProgressSection(currentSectionKey());
    var id = String(state.cardIndex);

    if (data.seen.indexOf(id) === -1) {
      data.seen.push(id);
      saveProgress();
    }
  }

  function getSectionProgress(chapter, sectionName) {
    var total = getCards(chapter, sectionName).length;
    var data = ensureProgressSection(chapter.index + ":" + sectionName);
    var seen = data.seen.filter(function (id) {
      return Number(id) < total;
    }).length;

    return {
      total: total,
      seen: seen,
      percent: total ? Math.round((seen / total) * 100) : 0
    };
  }

  function getChapterProgress(chapter) {
    return chapter.sections.reduce(function (sum, section) {
      var item = getSectionProgress(chapter, section.name);
      sum.total += item.total;
      sum.seen += item.seen;
      sum.percent = sum.total ? Math.round((sum.seen / sum.total) * 100) : 0;
      return sum;
    }, { total: 0, seen: 0, percent: 0 });
  }

  function getOverallProgress() {
    return chapters.reduce(function (sum, chapter) {
      var item = getChapterProgress(chapter);
      sum.total += item.total;
      sum.seen += item.seen;
      sum.percent = sum.total ? Math.round((sum.seen / sum.total) * 100) : 0;
      return sum;
    }, { total: 0, seen: 0, percent: 0 });
  }

  function getSectionQuizProgress(chapter, sectionName) {
    var cards = getCards(chapter, sectionName);
    var data = ensureProgressSection(chapter.index + ":" + sectionName);
    var total = cards.length;
    var graded = 0;
    var correct = 0;

    cards.forEach(function (card, index) {
      var id = String(index);
      var selfGrade = data.selfGrade[id];

      if (selfGrade) {
        graded += 1;
        correct += selfGrade.correct ? 1 : 0;
        return;
      }

      var entry = data.quiz[id];
      if (entry && entry.graded) {
        graded += 1;
        correct += entry.correct ? 1 : 0;
      }
    });

    return {
      total: total,
      graded: graded,
      correct: correct,
      percent: graded ? Math.round((correct / graded) * 100) : 0
    };
  }

  function getOverallQuizProgress() {
    return chapters.reduce(function (sum, chapter) {
      chapter.sections.forEach(function (section) {
        var item = getSectionQuizProgress(chapter, section.name);
        sum.total += item.total;
        sum.graded += item.graded;
        sum.correct += item.correct;
      });

      sum.percent = sum.graded ? Math.round((sum.correct / sum.graded) * 100) : 0;
      return sum;
    }, { total: 0, graded: 0, correct: 0, percent: 0 });
  }

  function renderQuizControls(card, quiz) {
    var controls = document.createElement("div");
    var message = document.createElement("p");
    var button = document.createElement("button");
    var selfGrade = getSelfGrade(currentSectionKey(), state.cardIndex);
    var result = selfGrade || (quiz && quiz.graded ? quiz : null);

    controls.className = "quiz-controls";

    if (result) {
      message.className = "quiz-result " + (result.correct ? "is-correct" : "is-incorrect");
      message.appendChild(pretextText(result.correct ? "Correct" : "Incorrect"));
      controls.appendChild(message);

      if (!result.correct) {
        button.type = "button";
        button.appendChild(pretextText("Try Again"));
        button.addEventListener("click", resetCurrentGrade);
        controls.appendChild(button);
      }
      return controls;
    }

    message.className = "quiz-hint";
    message.appendChild(pretextText(selectedCountText(quiz ? quiz.selected.length : 0, card.A)));
    controls.appendChild(message);

    button.type = "button";
    button.className = "primary";
    button.appendChild(pretextText("Check Answer"));
    button.addEventListener("click", gradeCurrentCard);
    controls.appendChild(button);
    return controls;
  }

  function isCorrectAnswer(card, option) {
    return normalizeAnswers(card.A).indexOf(normalizeAnswer(option)) >= 0;
  }

  function selectionsMatchAnswers(selected, answers) {
    var selectedAnswers = normalizeAnswers(selected).sort();
    var correctAnswers = normalizeAnswers(answers).sort();

    if (selectedAnswers.length !== correctAnswers.length) {
      return false;
    }

    return selectedAnswers.every(function (answer, index) {
      return answer === correctAnswers[index];
    });
  }

  function normalizeAnswers(answers) {
    return uniqueStrings(answers || []).map(normalizeAnswer);
  }

  function normalizeAnswer(answer) {
    return String(answer).replace(/\s+/g, " ").trim().toLowerCase();
  }

  function selectedCountText(count, answers) {
    var total = Array.isArray(answers) ? answers.length : 0;

    if (!total) {
      return count + " selected";
    }

    return count + " selected | " + total + " correct " + (total === 1 ? "choice" : "choices");
  }

  function quizSummaryText(quiz) {
    if (!quiz.graded) {
      return "not started";
    }

    return quiz.correct + "/" + quiz.graded + " correct (" + quiz.percent + "%)";
  }

  function focusControllerPanel(panel, options) {
    var opts = options || {};

    if (panel !== "toc" && panel !== "study") {
      return;
    }

    state.activeControllerPanel = panel;
    renderControllerPanelState();

    if (!opts.deferFocus) {
      ensureFocusedElement();
    }

    if (!opts.silent) {
      playSoundEffect("cursor");
    }
  }

  function exposeControllerDebugApi() {
    window.FlashCardsControllerNav = {
      focusPanel: function (panel) { focusControllerPanel(panel, { silent: true }); },
      move: function (direction) { moveFocus(direction); },
      activate: function () { activateFocusedElement(); },
      closeModal: function () { return closeControllerModal(); },
      context: function () { return currentControllerContext(); },
      activePanel: function () { return state.activeControllerPanel; },
      rovingIndexes: function () { return Object.assign({}, state.rovingIndexes); }
    };
  }

  function renderControllerPanelState() {
    var panel = state.activeControllerPanel;
    var app = els.app || document.querySelector(".app-shell");
    var tocPanel = document.querySelector(".toc-panel[data-controller-panel='toc']");
    var studyPanel = document.querySelector(".study-panel[data-controller-panel='study']");

    if (app) {
      els.app = app;
      app.dataset.controllerPanel = panel;
    }

    if (tocPanel) {
      els.tocPanel = tocPanel;
      tocPanel.classList.toggle("is-controller-active", panel === "toc");
      tocPanel.setAttribute("aria-current", panel === "toc" ? "true" : "false");
    }

    if (studyPanel) {
      els.studyPanel = studyPanel;
      studyPanel.classList.toggle("is-controller-active", panel === "study");
      studyPanel.setAttribute("aria-current", panel === "study" ? "true" : "false");
    }

    Array.prototype.forEach.call(document.querySelectorAll("[data-panel-focus-badge]"), function (badge) {
      var isActive = badge.dataset.panelFocusBadge === panel;
      badge.classList.toggle("is-active", isActive);
      badge.textContent = isActive
        ? (panel === "toc" ? "LB Deck Focus Active" : "RB Study Focus Active")
        : (badge.dataset.panelFocusBadge === "toc" ? "LB Deck" : "RB Study");
    });

    if (els.controllerCommandBar) {
      els.controllerCommandBar.innerHTML = panel === "toc"
        ? "<span><kbd>LB</kbd> Deck active</span><span><kbd>RB</kbd> Study</span><span><kbd>↑↓</kbd> Move section</span><span><kbd>A</kbd> Select</span><span><kbd>B</kbd> Study</span>"
        : "<span><kbd>LB</kbd> Deck</span><span><kbd>RB</kbd> Study active</span><span><kbd>LT</kbd>/<kbd>RT</kbd> Prev/Next</span><span><kbd>X</kbd> Flip</span><span><kbd>Y</kbd> Speak</span><span><kbd>A</kbd> Right</span><span><kbd>B</kbd> Wrong</span>";
    }
  }

  function isTextInput(element) {
    return element instanceof HTMLElement && /input|textarea|select/i.test(element.tagName);
  }

  function isControllerAction(element) {
    return element instanceof HTMLElement && element.classList.contains("controller-action");
  }

  function isVisible(element) {
    return Boolean(
      element instanceof HTMLElement &&
      !element.hidden &&
      !element.disabled &&
      element.getClientRects().length &&
      window.getComputedStyle(element).visibility !== "hidden"
    );
  }

  function getPanelElement(panel) {
    if (panel === "modal") {
      return currentControllerModal();
    }

    return panel === "toc" ? els.tocPanel : els.studyPanel;
  }

  function currentControllerContext() {
    return currentControllerModal() ? "modal" : state.activeControllerPanel;
  }

  function currentControllerModal() {
    var selectors = [
      "#welcome-modal:not([hidden])",
      "[data-theme-dialog]:not([hidden])",
      "[data-global-search-dialog]:not([hidden])",
      "[data-deck-editor-dialog]:not([hidden])"
    ];

    for (var i = 0; i < selectors.length; i += 1) {
      var modal = document.querySelector(selectors[i]);
      if (modal && isVisible(modal)) {
        return modal;
      }
    }

    return null;
  }

  function getNavigableElements(panel) {
    var targetPanel = panel || currentControllerContext();
    var root = getPanelElement(targetPanel) || document;
    var selector = targetPanel === "toc"
      ? ".section-button:not(:disabled)"
      : "button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])";

    return Array.prototype.slice.call(root.querySelectorAll(selector)).filter(isVisible);
  }

  function elementNeedsScrollIntoView(element) {
    var rect = element.getBoundingClientRect();
    var padding = 20;

    return (
      rect.top < padding ||
      rect.left < padding ||
      rect.bottom > window.innerHeight - padding ||
      rect.right > window.innerWidth - padding
    );
  }

  function focusElement(element, context) {
    if (!isVisible(element)) {
      return false;
    }

    document.querySelectorAll(".is-controller-focused").forEach(function (item) {
      item.classList.remove("is-controller-focused");
    });
    element.classList.add("is-controller-focused");
    element.focus({ preventScroll: true });

    if (element.classList.contains("section-button") && element.dataset.sectionKey) {
      state.lastTocFocusKey = element.dataset.sectionKey;
    }

    updateRovingIndex(context || currentControllerContext(), element);

    if (elementNeedsScrollIntoView(element)) {
      element.scrollIntoView({ behavior: "auto", block: "nearest", inline: "nearest" });
    }

    return true;
  }

  function defaultFocusElement(panel) {
    var targetPanel = panel || currentControllerContext();

    if (targetPanel === "toc") {
      return findTocFocusElement() || getNavigableElements("toc")[0];
    }

    if (targetPanel === "modal") {
      return getNavigableElements("modal")[state.rovingIndexes.modal] || getNavigableElements("modal")[0];
    }

    if (state.preferStudyPrimaryFocus && isVisible(els.flip)) {
      state.preferStudyPrimaryFocus = false;
      state.rovingIndexes.study = studyPrimaryIndex();
      return els.flip;
    }

    return getNavigableElements("study")[state.rovingIndexes.study] || (isVisible(els.flip) ? els.flip : getNavigableElements("study")[0]);
  }

  function studyPrimaryIndex() {
    var studyElements = getNavigableElements("study");
    var index = studyElements.indexOf(els.flip);
    return index >= 0 ? index : 0;
  }

  function findTocFocusElement() {
    var key = state.lastTocFocusKey || currentSectionKey();
    return key ? els.toc.querySelector(".section-button[data-section-key='" + cssEscape(key) + "']") : null;
  }

  function ensureFocusedElement() {
    var context = currentControllerContext();
    var navigableElements = getNavigableElements(context);
    var active = document.activeElement;

    if (!navigableElements.length) {
      return;
    }

    if (!(active instanceof HTMLElement) || navigableElements.indexOf(active) === -1) {
      focusElement(defaultFocusElement(context), context);
    } else {
      updateRovingIndex(context, active);
    }
  }

  function getCenterPoint(element) {
    var rect = element.getBoundingClientRect();

    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  }

  function isCandidateInDirection(dx, dy, direction) {
    if (direction === "up") return dy < -6;
    if (direction === "down") return dy > 6;
    if (direction === "left") return dx < -6;
    if (direction === "right") return dx > 6;
    return false;
  }

  function directionScore(dx, dy, direction) {
    if (direction === "up" || direction === "down") {
      return Math.abs(dy) * 1000 + Math.abs(dx);
    }

    if (direction === "left" || direction === "right") {
      return Math.abs(dx) * 1000 + Math.abs(dy);
    }

    return Number.MAX_SAFE_INTEGER;
  }

  function updateRovingIndex(context, element) {
    var key = context || currentControllerContext();
    var elements = getNavigableElements(key);
    var index = elements.indexOf(element);

    if (index >= 0 && Object.prototype.hasOwnProperty.call(state.rovingIndexes, key)) {
      state.rovingIndexes[key] = index;
    }
  }

  function clampRovingIndex(context, length) {
    var value = state.rovingIndexes[context] || 0;

    if (!length) {
      state.rovingIndexes[context] = 0;
      return 0;
    }

    value = Math.max(0, Math.min(value, length - 1));
    state.rovingIndexes[context] = value;
    return value;
  }

  function moveFocus(direction) {
    var context = currentControllerContext();
    var navigableElements = getNavigableElements(context);
    var active = document.activeElement instanceof HTMLElement &&
      navigableElements.indexOf(document.activeElement) >= 0
      ? document.activeElement
      : null;

    if (!navigableElements.length) {
      return;
    }

    if (!active) {
      focusElement(defaultFocusElement(context), context);
      return;
    }

    var currentIndex = navigableElements.indexOf(active);
    var delta = direction === "up" || direction === "left" ? -1 : 1;
    var nextIndex = currentIndex === -1
      ? clampRovingIndex(context, navigableElements.length)
      : (currentIndex + delta + navigableElements.length) % navigableElements.length;

    state.rovingIndexes[context] = nextIndex;
    focusElement(navigableElements[nextIndex], context);
    playSoundEffect("cursor");
  }

  function activateFocusedElement() {
    var context = currentControllerContext();
    var active = document.activeElement;

    if (!(active instanceof HTMLElement) || getNavigableElements(context).indexOf(active) === -1) {
      return;
    }

    active.click();
  }

  function closeControllerModal() {
    var modal = currentControllerModal();
    var closeTarget;

    if (!modal) {
      return false;
    }

    closeTarget = modal.querySelector("[data-welcome-close], [data-theme-dialog-close], [data-global-search-close], [data-deck-editor-close]");

    if (closeTarget instanceof HTMLElement) {
      closeTarget.click();
      return true;
    }

    modal.hidden = true;
    return true;
  }

  function getFriendlyControllerName(gamepadId) {
    var normalizedId = String(gamepadId || "").toLowerCase();

    if (normalizedId.indexOf("xbox") >= 0) return "Xbox controller";
    if (
      normalizedId.indexOf("dualsense") >= 0 ||
      normalizedId.indexOf("dualshock") >= 0 ||
      normalizedId.indexOf("playstation") >= 0 ||
      normalizedId.indexOf("ps5") >= 0 ||
      normalizedId.indexOf("ps4") >= 0
    ) {
      return "PlayStation controller";
    }
    if (
      normalizedId.indexOf("switch") >= 0 ||
      normalizedId.indexOf("nintendo") >= 0 ||
      normalizedId.indexOf("pro controller") >= 0
    ) {
      return "Nintendo controller";
    }

    return "Gamepad detected";
  }

  function setControllerStatus(status) {
    if (!els.controllerStatus) {
      return;
    }

    var connected = status && status.connected;
    var id = status && status.id ? status.id : "";

    els.controllerStatus.dataset.controllerState = connected ? "connected" : "disconnected";
    els.controllerStatus.title = connected && id ? id : "";
    els.controllerStatusLabel.textContent = connected ? "Controller ready" : "No controller";
    els.controllerStatusDetail.textContent = connected
      ? getFriendlyControllerName(id) + " · LB deck / RB study"
      : "Keyboard controls are available";
  }

  function syncConnectedGamepadStatus(gamepad) {
    if (!navigator.getGamepads) {
      setControllerStatus({ connected: false });
      return;
    }

    var gamepads = Array.prototype.slice.call(navigator.getGamepads());
    var connectedGamepad = gamepad || gamepads.find(Boolean) || null;

    if (!connectedGamepad) {
      setControllerStatus({ connected: false });
      return;
    }

    setControllerStatus({ connected: true, id: connectedGamepad.id });
  }

  function cooldownReady(key, cooldownMs) {
    var now = Date.now();
    var last = state.gamepadCooldowns[key] || 0;

    if (now - last < cooldownMs) {
      return false;
    }

    state.gamepadCooldowns[key] = now;
    return true;
  }

  function isPressedWithCooldown(gamepad, buttonIndex, cooldownMs) {
    if (!gamepad.buttons[buttonIndex] || !gamepad.buttons[buttonIndex].pressed) {
      return false;
    }

    return cooldownReady(gamepad.index + ":" + buttonIndex, cooldownMs || 220);
  }

  function axisTriggered(gamepad, axisIndex, direction, threshold, cooldownMs) {
    var axisValue = gamepad.axes[axisIndex] || 0;
    var matches = direction === "negative" ? axisValue < -(threshold || 0.65) : axisValue > (threshold || 0.65);

    if (!matches) {
      return false;
    }

    return cooldownReady(gamepad.index + ":axis:" + axisIndex + ":" + direction, cooldownMs || 220);
  }

  function pollGamepads() {
    var gamepads = navigator.getGamepads ? navigator.getGamepads() : [];

    for (var index = 0; index < gamepads.length; index += 1) {
      var gamepad = gamepads[index];

      if (!gamepad) {
        continue;
      }

      if (currentControllerContext() === "modal") {
        if (isPressedWithCooldown(gamepad, 12) || axisTriggered(gamepad, 1, "negative")) moveFocus("up");
        if (isPressedWithCooldown(gamepad, 13) || axisTriggered(gamepad, 1, "positive")) moveFocus("down");
        if (isPressedWithCooldown(gamepad, 14) || axisTriggered(gamepad, 0, "negative")) moveFocus("left");
        if (isPressedWithCooldown(gamepad, 15) || axisTriggered(gamepad, 0, "positive")) moveFocus("right");
        if (isPressedWithCooldown(gamepad, 0)) activateFocusedElement();
        if (isPressedWithCooldown(gamepad, 1)) closeControllerModal();
        continue;
      }

      if (isPressedWithCooldown(gamepad, 4)) focusControllerPanel("toc");
      if (isPressedWithCooldown(gamepad, 5)) focusControllerPanel("study");

      if (isPressedWithCooldown(gamepad, 12) || axisTriggered(gamepad, 1, "negative")) moveFocus("up");
      if (isPressedWithCooldown(gamepad, 13) || axisTriggered(gamepad, 1, "positive")) moveFocus("down");
      if (isPressedWithCooldown(gamepad, 14) || axisTriggered(gamepad, 0, "negative")) moveFocus("left");
      if (isPressedWithCooldown(gamepad, 15) || axisTriggered(gamepad, 0, "positive")) moveFocus("right");

      if (state.activeControllerPanel === "toc") {
        if (isPressedWithCooldown(gamepad, 0)) activateFocusedElement();
        if (isPressedWithCooldown(gamepad, 1)) focusControllerPanel("study");
        continue;
      }

      if (isPressedWithCooldown(gamepad, 6)) previousCard();
      if (isPressedWithCooldown(gamepad, 7)) nextCard();
      if (isPressedWithCooldown(gamepad, 2)) flipCard();
      if (isPressedWithCooldown(gamepad, 3)) speakFullCard();
      if (isPressedWithCooldown(gamepad, 0)) markSelfGrade(true);
      if (isPressedWithCooldown(gamepad, 1)) markSelfGrade(false);

      if (isPressedWithCooldown(gamepad, 10)) {
        activateFocusedElement();
      }
    }

    window.requestAnimationFrame(pollGamepads);
  }

  function loadProgress(test) {
    var raw = localStorage.getItem(progressKey(test));

    if (!raw) {
      return { sections: {} };
    }

    try {
      return JSON.parse(raw);
    } catch (error) {
      return { sections: {} };
    }
  }

  function saveProgress() {
    localStorage.setItem(progressKey(getCurrentTest()), JSON.stringify(progress));
  }

  function progressKey(test) {
    return "flash-cards:" + (config.testSlug || slugify(test.name)) + ":progress:v1";
  }

  function updateLocation() {
    if (!state.sectionName || !currentCards().length) {
      return;
    }

    var hash = new URLSearchParams({
      section: state.sectionName,
      card: String(state.cardIndex + 1)
    });

    window.history.replaceState(null, "", "#" + hash.toString());
  }

  function uniqueStrings(values) {
    return Array.from(new Set((values || []).map(String)));
  }

  function slugify(value) {
    return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(String(value));
    }

    return String(value).replace(/['"\\]/g, "\\$&");
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
})();
