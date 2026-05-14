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
    gamepadCooldowns: {}
  };
  var cardFitFrame = 0;

  var els = {
    app: document.querySelector(".app-shell"),
    toc: document.getElementById("toc"),
    overallLabel: document.getElementById("overall-label"),
    overallBar: document.getElementById("overall-bar"),
    sectionLabel: document.getElementById("section-label"),
    chapterLabel: document.getElementById("chapter-label"),
    card: document.getElementById("card"),
    front: document.getElementById("card-front"),
    back: document.getElementById("card-back"),
    prev: document.getElementById("prev-card"),
    flip: document.getElementById("flip-card"),
    speak: document.getElementById("speak-card"),
    right: document.getElementById("right-card"),
    wrong: document.getElementById("wrong-card"),
    next: document.getElementById("next-card"),
    count: document.getElementById("card-count"),
    audioPlayer: document.getElementById("audio-player"),
    sfxPlayer: document.getElementById("sfx-player"),
    controllerStatus: document.getElementById("controller-status"),
    controllerStatusLabel: document.getElementById("controller-status-label"),
    controllerStatusDetail: document.getElementById("controller-status-detail"),
    resetProgressButton: document.querySelector("[data-reset-progress]"),
    resetProgressStatus: document.querySelector("[data-reset-progress-status]")
  };

  boot();

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
    var response = await fetch(assetURL(path));

    if (!response.ok) {
      throw new Error("Unable to load " + path + ": " + response.status);
    }

    return response.json();
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
    var loaded = [];

    for (var i = 0; i < test.chapter.length; i++) {
      var chapter = test.chapter[i];
      var deck = {};

      if (chapter.file) {
        deck = await fetchJson("assets/" + deckPath(test, chapter));
      }

      loaded.push({
        index: i,
        name: chapter.name,
        color: chapter.color || "#6E298D",
        file: chapter.file,
        sections: chapter.section || [],
        deck: normalizeDeck(deck),
        deckMeta: getDeckMeta(deck)
      });
    }

    return loaded;
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
    return {
      Q: card && card.Q ? String(card.Q) : "",
      A: normalizeAnswerList(card && card.A),
      O: card && Array.isArray(card.O) ? card.O.map(String) : undefined,
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

    els.prev.addEventListener("click", previousCard);
    els.next.addEventListener("click", nextCard);
    els.flip.addEventListener("click", flipCard);
    els.speak.addEventListener("click", speakVisibleCard);
    els.right.addEventListener("click", function () {
      markSelfGrade(true);
    });
    els.wrong.addEventListener("click", function () {
      markSelfGrade(false);
    });
    if (els.resetProgressButton && els.app && els.app.hasAttribute("data-enable-progress-reset")) {
      els.resetProgressButton.addEventListener("click", resetStoredProgress);
    }
    els.card.addEventListener("click", function (event) {
      if (event.target instanceof Element && event.target.closest("button, a")) {
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
        speakVisibleCard();
      } else if (key === "a") {
        markSelfGrade(true);
      } else if (key === "b") {
        markSelfGrade(false);
      }
    });

    window.addEventListener("resize", scheduleCardContentFit);

    window.addEventListener("gamepadconnected", function (event) {
      syncConnectedGamepadStatus(event.gamepad);
      ensureFocusedElement();
    });
    window.addEventListener("gamepaddisconnected", function () {
      syncConnectedGamepadStatus();
    });

    syncConnectedGamepadStatus();
    pollGamepads();
  }

  function renderAll() {
    var chapter = currentChapter();

    if (chapter) {
      els.app.style.setProperty("--accent", chapter.color);
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

    if (!totals.total) {
      els.overallLabel.textContent = "No cards in this test yet";
    } else if (quiz.total) {
      els.overallLabel.textContent =
        totals.seen + " of " + totals.total + " cards studied | Score " + quizSummaryText(quiz);
    } else {
      els.overallLabel.textContent = totals.seen + " of " + totals.total + " cards studied";
    }

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

    els.sectionLabel.textContent = sectionHeading();
    els.chapterLabel.textContent = chapter.name;
    els.card.classList.toggle("is-flipped", state.flipped);

    renderQuestion(els.front, card);
    renderAnswers(els.back, card.A, card);

    els.count.textContent = "Card " + (state.cardIndex + 1) + " of " + cards.length;
  }

  function renderControls() {
    var cards = currentCards();
    var hasCard = cards.length > 0;
    var selfGrade = hasCard ? getSelfGrade(currentSectionKey(), state.cardIndex) : null;

    els.prev.disabled = state.transitioning || !previousTarget();
    els.next.disabled = state.transitioning || !nextTarget();
    els.flip.disabled = state.transitioning || !hasCard;
    els.speak.disabled = state.transitioning || !hasCard;
    els.right.disabled = state.transitioning || !hasCard;
    els.wrong.disabled = state.transitioning || !hasCard;
    els.right.classList.toggle("is-selected", Boolean(selfGrade && selfGrade.correct));
    els.wrong.classList.toggle("is-selected", Boolean(selfGrade && !selfGrade.correct));
  }

  function showEmpty(message) {
    els.sectionLabel.textContent = "No deck";
    els.chapterLabel.textContent = config.testName || "Practice Test";
    els.front.innerHTML = "";
    els.back.innerHTML = "";
    els.front.appendChild(emptyMessage(message));
    els.back.appendChild(emptyMessage(message));
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
    fitCardFace(els.front);
    fitCardFace(els.back);
  }

  function fitCardFace(face) {
    if (!face) {
      return;
    }

    var minScale = 0.42;
    var scale = 1;

    face.style.setProperty("--card-content-scale", String(scale));

    for (var i = 0; i < 4; i++) {
      var availableHeight = face.clientHeight;
      var contentHeight = face.scrollHeight;

      if (!availableHeight || !contentHeight || contentHeight <= availableHeight + 1) {
        break;
      }

      scale = Math.max(minScale, scale * ((availableHeight - 2) / contentHeight));
      face.style.setProperty("--card-content-scale", scale.toFixed(3));

      if (scale === minScale) {
        break;
      }
    }
  }

  function emptyMessage(message) {
    var div = document.createElement("div");
    div.className = "empty-message";
    div.textContent = message;
    return div;
  }

  function renderText(element, text) {
    var question = document.createElement("div");

    element.innerHTML = "";
    question.className = "card-question";
    question.textContent = text || "";
    element.appendChild(question);
  }

  function renderCardTypeBadge(label) {
    var badge = document.createElement("span");

    badge.className = "card-type-badge";
    badge.textContent = label;
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

    renderText(element, card ? card.Q : "");
    element.classList.toggle("has-options", options.length > 0);

    if (!options.length) {
      return;
    }

    element.insertBefore(renderCardTypeBadge("Multiple choice"), element.firstChild);

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
      button.textContent = option;
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

    element.appendChild(list);
    element.appendChild(renderQuizControls(card, quiz));
  }

  function renderAnswers(element, answers, card) {
    var list = document.createElement("ul");
    var normalizedAnswers = answers || [];

    element.innerHTML = "";
    element.classList.remove("has-options");

    if (card && card.plainBack && normalizedAnswers.length <= 1) {
      renderText(element, normalizedAnswers[0] || "");
      element.classList.add("has-plain-back");
      return;
    }

    element.classList.remove("has-plain-back");
    list.className = "answer-list";

    normalizedAnswers.forEach(function (answer) {
      var item = document.createElement("li");
      item.textContent = answer;
      list.appendChild(item);
    });

    element.appendChild(list);
  }

  function selectSection(chapterIndex, sectionName) {
    stopPlayback();
    state.chapterIndex = chapterIndex;
    state.sectionName = sectionName;
    state.cardIndex = 0;
    state.flipped = false;
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
  }

  function speakVisibleCard() {
    var speech = currentVisibleSpeech();

    if (!speech.text) {
      return;
    }

    stopPlayback();

    if (speech.audio && els.audioPlayer) {
      els.audioPlayer.src = mediaURL(speech.audio);
      els.audioPlayer.play().catch(function () {
        fallbackSpeak(speech.text);
      });
      return;
    }

    fallbackSpeak(speech.text);
  }

  function currentVisibleSpeech() {
    var card = currentCards()[state.cardIndex];

    if (!card) {
      return { text: "", audio: "" };
    }

    if (!state.flipped) {
      return { text: card.Q, audio: card.frontAudio };
    }

    return {
      text: normalizeAnswerList(card.A).join(". "),
      audio: card.backAudio
    };
  }

  function fallbackSpeak(text) {
    if (!("speechSynthesis" in window)) {
      return;
    }

    window.speechSynthesis.cancel();

    var utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  }

  function stopPlayback() {
    if (els.audioPlayer) {
      els.audioPlayer.pause();
      els.audioPlayer.removeAttribute("src");
      els.audioPlayer.load();
    }

    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
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
      message.textContent = result.correct ? "Correct" : "Incorrect";
      controls.appendChild(message);

      if (!result.correct) {
        button.type = "button";
        button.textContent = "Try Again";
        button.addEventListener("click", resetCurrentGrade);
        controls.appendChild(button);
      }
      return controls;
    }

    message.className = "quiz-hint";
    message.textContent = selectedCountText(quiz ? quiz.selected.length : 0, card.A);
    controls.appendChild(message);

    button.type = "button";
    button.className = "primary";
    button.textContent = "Check Answer";
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

  function getNavigableElements() {
    return Array.prototype.slice.call(
      document.querySelectorAll("button:not(:disabled), a[href], [tabindex]:not([tabindex='-1'])")
    ).filter(isVisible);
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

  function focusElement(element) {
    if (!isVisible(element)) {
      return false;
    }

    element.focus({ preventScroll: true });

    if (elementNeedsScrollIntoView(element)) {
      element.scrollIntoView({ behavior: "auto", block: "nearest", inline: "nearest" });
    }

    return true;
  }

  function defaultFocusElement() {
    return isVisible(els.flip) ? els.flip : getNavigableElements()[0];
  }

  function ensureFocusedElement() {
    var navigableElements = getNavigableElements();
    var active = document.activeElement;

    if (!navigableElements.length) {
      return;
    }

    if (!(active instanceof HTMLElement) || navigableElements.indexOf(active) === -1) {
      focusElement(defaultFocusElement());
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

  function moveFocus(direction) {
    var navigableElements = getNavigableElements();
    var active = document.activeElement instanceof HTMLElement &&
      navigableElements.indexOf(document.activeElement) >= 0
      ? document.activeElement
      : null;

    if (!navigableElements.length) {
      return;
    }

    if (!active) {
      focusElement(defaultFocusElement());
      return;
    }

    var origin = getCenterPoint(active);
    var candidates = navigableElements
      .filter(function (element) {
        return element !== active;
      })
      .map(function (element) {
        var center = getCenterPoint(element);
        var dx = center.x - origin.x;
        var dy = center.y - origin.y;

        return {
          element: element,
          dx: dx,
          dy: dy,
          score: directionScore(dx, dy, direction)
        };
      })
      .filter(function (candidate) {
        return isCandidateInDirection(candidate.dx, candidate.dy, direction);
      })
      .sort(function (left, right) {
        return left.score - right.score;
      });

    if (candidates[0]) {
      focusElement(candidates[0].element);
      playSoundEffect("cursor");
      return;
    }

    var currentIndex = navigableElements.indexOf(active);
    var delta = direction === "up" || direction === "left" ? -1 : 1;
    var nextIndex = currentIndex === -1
      ? 0
      : (currentIndex + delta + navigableElements.length) % navigableElements.length;

    focusElement(navigableElements[nextIndex]);
    playSoundEffect("cursor");
  }

  function activateFocusedElement() {
    var active = document.activeElement;

    if (!(active instanceof HTMLElement) || getNavigableElements().indexOf(active) === -1) {
      return;
    }

    active.click();
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
      ? getFriendlyControllerName(id)
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

      if (isPressedWithCooldown(gamepad, 12) || axisTriggered(gamepad, 1, "negative")) moveFocus("up");
      if (isPressedWithCooldown(gamepad, 13) || axisTriggered(gamepad, 1, "positive")) moveFocus("down");
      if (isPressedWithCooldown(gamepad, 14) || axisTriggered(gamepad, 0, "negative")) moveFocus("left");
      if (isPressedWithCooldown(gamepad, 15) || axisTriggered(gamepad, 0, "positive")) moveFocus("right");

      if (isPressedWithCooldown(gamepad, 6)) previousCard();
      if (isPressedWithCooldown(gamepad, 7)) nextCard();
      if (isPressedWithCooldown(gamepad, 2)) flipCard();
      if (isPressedWithCooldown(gamepad, 3)) speakVisibleCard();
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

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
})();
