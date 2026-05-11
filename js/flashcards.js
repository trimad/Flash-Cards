(function () {
  var config = window.FlashCardsConfig || {};
  var baseURL = normalizeBase(config.baseURL || "/");
  var menu = [];
  var chapters = [];
  var progress = { sections: {} };
  var state = {
    chapterIndex: 0,
    sectionName: "",
    cardIndex: 0,
    flipped: false,
    answerFirst: false
  };

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
    known: document.getElementById("known-card"),
    next: document.getElementById("next-card"),
    count: document.getElementById("card-count"),
    questionFirst: document.getElementById("question-first"),
    answerFirst: document.getElementById("answer-first")
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
        deck: deck
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
    els.prev.addEventListener("click", previousCard);
    els.next.addEventListener("click", nextCard);
    els.flip.addEventListener("click", flipCard);
    els.known.addEventListener("click", toggleKnown);
    els.questionFirst.addEventListener("click", function () {
      setMode(false);
    });
    els.answerFirst.addEventListener("click", function () {
      setMode(true);
    });

    document.addEventListener("keydown", function (event) {
      if (event.target && /a|button|input|textarea|select/i.test(event.target.tagName)) {
        return;
      }

      if (event.key === "ArrowLeft") {
        previousCard();
      } else if (event.key === "ArrowRight") {
        nextCard();
      } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        flipCard();
      } else if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        flipCard();
      } else if (event.key.toLowerCase() === "k") {
        toggleKnown();
      }
    });
  }

  function renderAll() {
    var chapter = currentChapter();

    if (chapter) {
      els.app.style.setProperty("--accent", chapter.color);
    }

    markSeen();
    renderToc();
    renderProgress();
    renderCard();
    renderControls();
    updateLocation();
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
        "<small>" + chapterProgress.seen + "/" + chapterProgress.total + "</small>" +
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
        totals.seen + " of " + totals.total + " cards studied | Quiz " + quizSummaryText(quiz);
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

    if (state.answerFirst) {
      renderAnswers(els.front, card.A);
      renderQuestion(els.back, card);
    } else {
      renderQuestion(els.front, card);
      renderAnswers(els.back, card.A);
    }

    els.count.textContent = "Card " + (state.cardIndex + 1) + " of " + cards.length;
  }

  function renderControls() {
    var cards = currentCards();
    var hasCard = cards.length > 0;
    var known = hasCard && hasKnown(currentSectionKey(), state.cardIndex);

    els.prev.disabled = !previousTarget();
    els.next.disabled = !nextTarget();
    els.flip.disabled = !hasCard;
    els.known.disabled = !hasCard;
    els.known.classList.toggle("is-known", known);
    els.known.textContent = known ? "Known" : "Mark Known";
    els.questionFirst.classList.toggle("is-active", !state.answerFirst);
    els.answerFirst.classList.toggle("is-active", state.answerFirst);
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

  function sectionHeading() {
    var chapter = currentChapter();
    var section = chapter && chapter.sections.find(function (item) {
      return item.name === state.sectionName;
    });

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

  function renderAnswers(element, answers) {
    var list = document.createElement("ul");

    element.innerHTML = "";
    element.classList.remove("has-options");
    list.className = "answer-list";

    (answers || []).forEach(function (answer) {
      var item = document.createElement("li");
      item.textContent = answer;
      list.appendChild(item);
    });

    element.appendChild(list);
  }

  function selectSection(chapterIndex, sectionName) {
    state.chapterIndex = chapterIndex;
    state.sectionName = sectionName;
    state.cardIndex = 0;
    state.flipped = false;
    renderAll();
  }

  function previousCard() {
    var target = previousTarget();

    if (!target) {
      return;
    }

    state.chapterIndex = target.chapterIndex;
    state.sectionName = target.sectionName;
    state.cardIndex = target.cardIndex;
    state.flipped = false;
    clampCardIndex();
    renderAll();
  }

  function nextCard() {
    var target = nextTarget();

    if (!target) {
      return;
    }

    state.chapterIndex = target.chapterIndex;
    state.sectionName = target.sectionName;
    state.cardIndex = target.cardIndex;
    state.flipped = false;
    clampCardIndex();
    renderAll();
  }

  function flipCard() {
    if (!currentCards().length) {
      return;
    }

    state.flipped = !state.flipped;
    renderAll();
  }

  function toggleKnown() {
    if (!currentCards().length) {
      return;
    }

    var key = currentSectionKey();
    var data = ensureProgressSection(key);
    var id = String(state.cardIndex);
    var index = data.known.indexOf(id);

    if (index >= 0) {
      data.known.splice(index, 1);
    } else {
      data.known.push(id);
    }

    saveProgress();
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

    saveProgress();
    renderAll();
  }

  function resetCurrentGrade() {
    var quiz = ensureQuizEntry(currentSectionKey(), state.cardIndex);

    quiz.graded = false;
    quiz.correct = false;

    saveProgress();
    renderAll();
  }

  function setMode(answerFirst) {
    state.answerFirst = answerFirst;
    state.flipped = false;
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
      progress.sections[key] = { seen: [], known: [] };
    }

    progress.sections[key].seen = uniqueStrings(progress.sections[key].seen);
    progress.sections[key].known = uniqueStrings(progress.sections[key].known);
    progress.sections[key].quiz = progress.sections[key].quiz || {};
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

  function hasKnown(key, cardIndex) {
    var data = ensureProgressSection(key);
    return data.known.indexOf(String(cardIndex)) >= 0;
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
    var total = 0;
    var graded = 0;
    var correct = 0;

    cards.forEach(function (card, index) {
      if (!card || !Array.isArray(card.O) || !card.O.length) {
        return;
      }

      total += 1;

      var entry = data.quiz[String(index)];
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

    controls.className = "quiz-controls";

    if (quiz && quiz.graded) {
      message.className = "quiz-result " + (quiz.correct ? "is-correct" : "is-incorrect");
      message.textContent = quiz.correct ? "Correct" : "Incorrect";
      controls.appendChild(message);

      button.type = "button";
      button.textContent = "Try Again";
      button.addEventListener("click", resetCurrentGrade);
      controls.appendChild(button);
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
