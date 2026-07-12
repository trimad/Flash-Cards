#!/usr/bin/env node
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const docsDir = path.join(root, 'docs');
const pagesPrefix = '/Flash-Cards';
const themeStorageKey = 'flashcards.evangelionTheme';
const progressStorageKey = 'flash-cards:network-plus:progress:v1';

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});

async function main() {
  assert.ok(fs.existsSync(path.join(docsDir, 'index.html')), 'docs/index.html should exist; run hugo --minify before browser smoke tests');

  const server = await startStaticServer(docsDir);
  const origin = `http://127.0.0.1:${server.address().port}`;
  const chrome = await startChrome();

  try {
    const client = await openPageClient(chrome.debugPort);
    await client.send('Page.enable');
    await client.send('Runtime.enable');

    await smokeThemeSelector(client, `${origin}${pagesPrefix}/`);
    await smokeGlobalSearch(client, `${origin}${pagesPrefix}/`);
    await smokeDeckEditor(client, `${origin}${pagesPrefix}/`);
    await smokeControllerPanels(client, `${origin}${pagesPrefix}/tests/network-plus/`);
    await smokeResetProgress(client, `${origin}${pagesPrefix}/tests/network-plus/`);
    await smokeCardAnimations(client, `${origin}${pagesPrefix}/tests/network-plus/`);
    await smokePretextFlipAndTts(client, `${origin}${pagesPrefix}/tests/network-plus/`);
    await smokeStudyStateCues(client, `${origin}${pagesPrefix}/tests/network-plus/`);
    await smokeReadableTypography(client, `${origin}${pagesPrefix}/tests/tech-plus-fc0-u71/`);
    await smokeAnswerSideOptions(client, `${origin}${pagesPrefix}/tests/security-plus/?smoke=multiple#section=1.1&card=1`);
    await smokeSingleChoiceTypeBadge(client, `${origin}${pagesPrefix}/tests/security-plus/?smoke=single#section=1.1&card=5`);
    await smokeTrueFalseTypeBadge(client, `${origin}${pagesPrefix}/tests/security-plus/?smoke=true-false#section=1.1&card=7`);
    await captureMobileAnswerOptions(client, `${origin}${pagesPrefix}/tests/tech-plus-fc0-u71/`);
    await captureDesktopQa(client, `${origin}${pagesPrefix}/tests/network-plus/`);
    await smokeMobilePwa(client, `${origin}${pagesPrefix}/tests/network-plus/`);

    await client.close();
    console.log('Browser smoke checks passed for theme selector, global search, deck editor, controller panels, reset progress, card animations, touch gestures, and iPhone PWA layout.');
  } finally {
    await closeServer(server);
    await stopChrome(chrome);
  }
}

async function smokeThemeSelector(client, url) {
  await navigate(client, url);
  await waitFor(client, 'document.readyState === "complete"', 'home page to finish loading');

  const initial = await evaluate(client, `(() => {
    const opener = document.querySelector('[data-theme-settings-button]');
    const dialog = document.querySelector('[data-theme-dialog]');
    const backdrop = document.querySelector('[data-theme-dialog-backdrop]');
    return {
      theme: document.documentElement.dataset.theme,
      openerExpanded: opener?.getAttribute('aria-expanded'),
      dialogHidden: dialog?.hidden,
      dialogDisplay: dialog ? getComputedStyle(dialog).display : null,
      backdropHidden: backdrop?.hidden,
      choices: Array.from(document.querySelectorAll('[data-theme-choice]')).map((button) => ({
        theme: button.dataset.themeChoice,
        pressed: button.getAttribute('aria-pressed')
      }))
    };
  })()`);

  assert.equal(initial.theme, 'nerv', 'home page should start with the NERV theme');
  assert.equal(initial.openerExpanded, 'false', 'settings button should start collapsed');
  assert.equal(initial.dialogHidden, true, 'theme dialog should start hidden');
  assert.equal(initial.dialogDisplay, 'none', 'hidden theme dialog should compute to display:none');
  assert.equal(initial.backdropHidden, true, 'theme backdrop should start hidden');
  assert.deepEqual(
    initial.choices.map((choice) => choice.theme).sort(),
    ['amoled', 'asuka', 'dark', 'light', 'nerv', 'rei', 'shinji'],
    'theme choices should include Evangelion and productivity palettes'
  );

  const afterSelection = await evaluate(client, `(() => {
    document.querySelector('[data-theme-settings-button]').click();
    const openState = {
      openerExpanded: document.querySelector('[data-theme-settings-button]').getAttribute('aria-expanded'),
      dialogHidden: document.querySelector('[data-theme-dialog]').hidden,
      dialogDisplay: getComputedStyle(document.querySelector('[data-theme-dialog]')).display
    };
    document.querySelector('[data-theme-choice="asuka"]').click();
    document.querySelector('[data-theme-dialog-close]').click();
    return {
      openState,
      theme: document.documentElement.dataset.theme,
      storedTheme: localStorage.getItem(${JSON.stringify(themeStorageKey)}),
      asukaPressed: document.querySelector('[data-theme-choice="asuka"]').getAttribute('aria-pressed'),
      nervPressed: document.querySelector('[data-theme-choice="nerv"]').getAttribute('aria-pressed'),
      openerExpanded: document.querySelector('[data-theme-settings-button]').getAttribute('aria-expanded'),
      dialogHidden: document.querySelector('[data-theme-dialog]').hidden
    };
  })()`);

  assert.equal(afterSelection.openState.openerExpanded, 'true', 'settings button should expand when the dialog opens');
  assert.equal(afterSelection.openState.dialogHidden, false, 'theme dialog should be visible after opening');
  assert.notEqual(afterSelection.openState.dialogDisplay, 'none', 'open theme dialog should be displayed');
  assert.equal(afterSelection.theme, 'asuka', 'clicking Asuka should apply the Asuka theme');
  assert.equal(afterSelection.storedTheme, 'asuka', 'selected theme should persist to localStorage');
  assert.equal(afterSelection.asukaPressed, 'true', 'selected theme button should be pressed');
  assert.equal(afterSelection.nervPressed, 'false', 'previous theme button should no longer be pressed');
  assert.equal(afterSelection.openerExpanded, 'false', 'settings button should collapse when the dialog closes');
  assert.equal(afterSelection.dialogHidden, true, 'theme dialog should close via the close button');

  await navigate(client, url);
  await waitFor(client, `document.documentElement && document.documentElement.dataset.theme === 'asuka'`, 'stored Asuka theme to apply after reload');
}

async function smokeGlobalSearch(client, url) {
  await navigate(client, url);
  await waitFor(client, 'document.readyState === "complete"', 'home page to finish loading for search');
  const state = await evaluate(client, `new Promise((resolve) => {
    document.querySelector('[data-global-search-open]').click();
    const input = document.querySelector('[data-global-search-input]');
    input.value = 'subnet';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const started = Date.now();
    const timer = setInterval(() => {
      const results = Array.from(document.querySelectorAll('.search-result'));
      if (results.length || Date.now() - started > 6000) {
        clearInterval(timer);
        resolve({
          hidden: document.querySelector('[data-global-search-dialog]').hidden,
          count: results.length,
          first: results[0] ? results[0].textContent : '',
          status: document.querySelector('[data-global-search-status]').textContent
        });
      }
    }, 100);
  })`);
  assert.equal(state.hidden, false, 'global search dialog should open');
  assert.ok(state.count > 0, `global search should return results for subnet: ${state.status}`);
  assert.match(state.first, /subnet/i, 'global search results should include highlighted matching content');
}

async function smokeDeckEditor(client, url) {
  await navigate(client, url);
  await waitFor(client, 'document.readyState === "complete"', 'home page to finish loading for editor');
  const state = await evaluate(client, `(() => {
    document.querySelector('[data-deck-editor-open]').click();
    document.querySelector('[data-editor-name]').value = 'Smoke Deck';
    document.querySelector('[data-editor-id]').value = 'smoke-deck';
    document.querySelector('[data-editor-source]').value = 'Q: Front\\nA: Back';
    document.querySelector('[data-editor-preview]').click();
    return {
      hidden: document.querySelector('[data-deck-editor-dialog]').hidden,
      output: document.querySelector('[data-editor-output]').textContent
    };
  })()`);
  assert.equal(state.hidden, false, 'deck editor dialog should open');
  assert.match(state.output, /smoke-deck/, 'deck editor should preview exported deck JSON');
  assert.match(state.output, /Front/, 'deck editor should parse markdown-style cards');
}

async function smokeControllerPanels(client, url) {
  await navigate(client, url);
  await waitFor(
    client,
    `document.readyState === 'complete' && document.querySelector('.section-button:not(:disabled)') && document.querySelector('#card-front') && !document.querySelector('#card-front').textContent.includes('Loading')`,
    'Network+ deck cards and TOC to load for controller panel checks'
  );

  const state = await evaluate(client, `new Promise((resolve) => {
    const nav = window.FlashCardsControllerNav;
    const beforeFront = document.querySelector('#card-front').textContent;
    nav.focusPanel('toc');
    const tocStart = document.activeElement.textContent;
    nav.move('down');
    const tocAfterDown = document.activeElement.textContent;
    const tocClass = document.activeElement.classList.contains('is-controller-focused');
    nav.activate();
    requestAnimationFrame(() => {
      const afterTocSelection = {
        activePanel: document.querySelector('.app-shell').dataset.controllerPanel,
        tocActive: document.querySelector('[data-controller-panel="toc"]').classList.contains('is-controller-active'),
        studyActive: document.querySelector('.study-panel[data-controller-panel="study"]').classList.contains('is-controller-active'),
        studyClass: document.querySelector('.study-panel[data-controller-panel="study"]').className,
        genericStudyClass: document.querySelector('[data-controller-panel="study"]').className,
        panelCount: document.querySelectorAll('[data-controller-panel="study"]').length,
        commandBar: document.querySelector('#controller-command-bar').textContent,
        activeElementId: document.activeElement.id,
        activeElementText: document.activeElement.textContent
      };
      document.querySelector('[data-theme-settings-button]').click();
      requestAnimationFrame(() => {
        const beforeModalFront = document.querySelector('#card-front').textContent;
        const modalContext = nav.context();
        const focusedBeforeModalMove = document.activeElement.textContent;
        nav.move('right');
        const focusedAfterModalMove = document.activeElement.textContent;
        nav.closeModal();
        requestAnimationFrame(() => resolve({
          beforeFront,
          beforeModalFront,
          tocStart,
          tocAfterDown,
          tocClass,
          afterTocSelection,
          modalContext,
          focusedBeforeModalMove,
          focusedAfterModalMove,
          themeDialogHidden: document.querySelector('[data-theme-dialog]').hidden,
          afterFront: document.querySelector('#card-front').textContent,
          roving: nav.rovingIndexes()
        }));
      });
    });
  })`);

  assert.notEqual(state.tocAfterDown, state.tocStart, 'TOC roving focus should move deterministically to the next section');
  assert.equal(state.tocClass, true, 'roving focus should mark the focused TOC section visually');
  assert.equal(state.afterTocSelection.activePanel, 'study', 'selecting a TOC section should return controller focus to Study');
  assert.equal(state.afterTocSelection.tocActive, false, 'TOC panel should not remain controller-active after section selection');
  assert.equal(state.afterTocSelection.studyActive, true, `Study panel should become controller-active after section selection: ${JSON.stringify(state.afterTocSelection)}`);
  assert.match(state.afterTocSelection.commandBar, /RB\s*Study active/i, 'controller command bar should explain active Study focus');
  assert.equal(state.afterTocSelection.activeElementId, 'flip-card', 'Study panel focus should restore to the primary Flip control');
  assert.equal(state.modalContext, 'modal', 'open dialogs should take controller context priority over Study');
  assert.notEqual(state.focusedAfterModalMove, state.focusedBeforeModalMove, 'modal roving focus should move within the dialog');
  assert.equal(state.themeDialogHidden, true, 'controller B/close should close the active modal');
  assert.equal(state.afterFront, state.beforeModalFront, 'modal controller input should not leak into card navigation');
  assert.ok(state.roving.toc >= 0 && state.roving.study >= 0 && state.roving.modal >= 0, 'controller roving indexes should be tracked per context');
}

async function smokeResetProgress(client, url) {
  await navigate(client, url);
  await waitFor(
    client,
    `document.readyState === 'complete' && document.querySelector('#card-front') && !document.querySelector('#card-front').textContent.includes('Loading')`,
    'Network+ deck cards to load'
  );

  const resetState = await evaluate(client, `(() => {
    localStorage.setItem(${JSON.stringify(progressStorageKey)}, JSON.stringify({
      sections: {
        smoke: {
          seen: { 0: true },
          selfGrades: { 0: true },
          quizzes: { 0: { selected: ['fixture'], graded: true, correct: false, attempts: 1 } }
        }
      }
    }));
    window.confirm = () => true;
    document.querySelector('[data-theme-settings-button]').click();
    document.querySelector('[data-reset-progress]').click();
    return {
      storedProgress: localStorage.getItem(${JSON.stringify(progressStorageKey)}),
      status: document.querySelector('[data-reset-progress-status]').textContent,
      cardText: document.querySelector('#card-front').textContent,
      dialogHidden: document.querySelector('[data-theme-dialog]').hidden
    };
  })()`);

  assert.equal(resetState.storedProgress, null, 'reset progress should remove only the current deck progress key');
  assert.match(resetState.status, /Progress reset for this deck\./, 'reset progress should announce completion');
  assert.ok(resetState.cardText.trim().length > 0, 'deck should still render a visible card after reset');
  assert.equal(resetState.dialogHidden, false, 'reset action should be reachable inside the settings dialog');
}

async function smokeCardAnimations(client, url) {
  await client.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
  });

  try {
    await navigate(client, url);
    await waitFor(
      client,
      `document.readyState === 'complete' && document.querySelector('#card-front') && !document.querySelector('#card-front').textContent.includes('Loading')`,
      'Network+ deck cards to load for animation checks'
    );

    const motionState = await evaluate(client, `(() => {
      const card = document.querySelector('#card');
      const inner = card.querySelector('.flash-card-inner');
      const next = document.querySelector('#next-card');
      const toMs = (value) => value.split(',').map((part) => {
        const trimmed = part.trim();
        return trimmed.endsWith('ms') ? parseFloat(trimmed) : parseFloat(trimmed) * 1000;
      });

      card.classList.add('slide-out-next');
      const slideStyle = getComputedStyle(card);
      const slideAnimationName = slideStyle.animationName;
      const slideAnimationMs = Math.max(...toMs(slideStyle.animationDuration));
      card.classList.remove('slide-out-next');

      next.click();

      return {
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
        flipTransitionMs: Math.max(...toMs(getComputedStyle(inner).transitionDuration)),
        slideAnimationName,
        slideAnimationMs,
        slideClassAfterClick: card.classList.contains('slide-out-next')
      };
    })()`);

    assert.equal(motionState.reducedMotion, true, 'smoke test should emulate reduced motion as Windows can report it');
    assert.ok(motionState.flipTransitionMs >= 600, 'card flip should keep its transition duration under reduced-motion media');
    assert.match(motionState.slideAnimationName, /cardSlideOutNext/, 'card swipe should still have a slide animation name');
    assert.ok(motionState.slideAnimationMs >= 180, 'card swipe should keep its animation duration under reduced-motion media');
    assert.equal(motionState.slideClassAfterClick, true, 'next-card click should start a swipe transition even under reduced-motion media');

    await waitFor(
      client,
      `!document.querySelector('#card').className.includes('slide-')`,
      'card animation classes to clear after animation smoke check'
    );
  } finally {
    await client.send('Emulation.setEmulatedMedia', { features: [] });
  }
}

async function smokePretextFlipAndTts(client, url) {
  await navigate(client, url);
  await waitFor(
    client,
    `document.readyState === 'complete' && window.FlashCardsPretext && document.querySelectorAll('#card [data-pretext-text]').length >= 2`,
    'Pretext-backed card text to render'
  );

  const state = await evaluate(client, `(() => {
    const card = document.querySelector('#card');
    const inner = card.querySelector('.flash-card-inner');
    const flip = document.querySelector('#flip-card');
    const speakQuestion = document.querySelector('#speak-question');
    const speakAnswer = document.querySelector('#speak-answer');
    const speakBoth = document.querySelector('#speak-card');
    const stop = document.querySelector('#stop-speaking');
    const front = document.querySelector('#card-front');
    const back = document.querySelector('#card-back');
    const textTypography = (element) => {
      const style = getComputedStyle(element);
      return {
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        letterSpacing: style.letterSpacing,
        lineHeight: style.lineHeight,
        textTransform: style.textTransform
      };
    };
    const initial = {
      pretextVersion: window.FlashCardsPretext.version,
      pretextBlocks: Array.from(card.querySelectorAll('[data-pretext-text]')).map((node) => ({
        lines: Number(node.dataset.pretextLineCount || 0),
        height: Number(node.dataset.pretextHeight || 0)
      })),
      frontContentLayers: front.querySelectorAll(':scope > .card-face-content').length,
      backContentLayers: back.querySelectorAll(':scope > .card-face-content').length,
      contentScrollbarStyles: [front, back].map((face) => getComputedStyle(face.querySelector(':scope > .card-face-content')).scrollbarWidth),
      answerQuestion: Boolean(back.querySelector('.card-question--prompt')),
      questionTypography: {
        front: textTypography(front.querySelector('.card-question')),
        answer: textTypography(back.querySelector('.card-question--prompt'))
      },
      faceStyle: {
        frontBackface: getComputedStyle(front).backfaceVisibility,
        backBackface: getComputedStyle(back).backfaceVisibility,
        frontTransform: getComputedStyle(front).transform,
        backTransform: getComputedStyle(back).transform
      },
      cardStackLayers: [
        getComputedStyle(card, '::before').content,
        getComputedStyle(card, '::after').content
      ],
      ttsButtons: [speakQuestion, speakAnswer, speakBoth, stop].every(Boolean)
    };
    flip.click();
    return new Promise((resolve) => setTimeout(() => {
      resolve({
        initial,
        flipped: card.classList.contains('is-flipped'),
        answerTransform: getComputedStyle(back).transform,
        shellTransform: getComputedStyle(inner).transform
      });
    }, 760));
  })()`);

  assert.equal(state.initial.pretextVersion, '0.0.6', 'card text should be laid out with the bundled Pretext version');
  assert.ok(state.initial.pretextBlocks.length >= 2, 'question and answer text should both be rendered through Pretext');
  assert.ok(state.initial.pretextBlocks.every((block) => block.lines >= 1 && block.height > 0), `Pretext should provide line and height metrics for every card block: ${JSON.stringify(state)}`);
  assert.equal(state.initial.frontContentLayers, 1, 'front face should have one independent scrolling content layer');
  assert.equal(state.initial.backContentLayers, 1, 'back face should have one independent scrolling content layer');
  assert.deepEqual(state.initial.contentScrollbarStyles, ['none', 'none'], 'flashcard content may scroll for long material, but its scrollbars must stay hidden');
  assert.equal(state.initial.answerQuestion, true, 'answer face should repeat the original question for comparison');
  assert.deepEqual(state.initial.questionTypography.answer, state.initial.questionTypography.front, `answer prompt should use exactly the front question typography: ${JSON.stringify(state)}`);
  assert.equal(state.initial.faceStyle.frontBackface, 'hidden', 'front face should hide its reverse during a flip');
  assert.equal(state.initial.faceStyle.backBackface, 'hidden', 'back face should hide its reverse during a flip');
  assert.deepEqual(state.initial.cardStackLayers, ['none', 'none'], 'the card shell should not render decorative duplicate-card layers behind a flip');
  assert.match(state.initial.faceStyle.backTransform, /matrix3d|matrix/, 'back face should own a physical 3D transform');
  assert.equal(state.initial.ttsButtons, true, 'TTS should expose question, answer, full-card, and stop actions');
  assert.match(state.shellTransform, /^matrix3d\(-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1\)$/, `a single card shell should settle at 180 degrees: ${JSON.stringify(state)}`);
  assert.equal(state.flipped, true, 'flip action should still reveal the answer side');
}

async function smokeStudyStateCues(client, url) {
  await navigate(client, url);
  await waitFor(client, `document.readyState === 'complete' && document.querySelector('#card-front') && !document.querySelector('#card-front').textContent.includes('Loading')`, 'study state cue fixture to load');

  const state = await evaluate(client, `(() => {
    const app = document.querySelector('.app-shell');
    const flip = document.querySelector('#flip-card');
    const front = {
      side: app.dataset.cardSide,
      flipLabel: flip.querySelector('span:last-child')?.textContent.trim(),
      flipAria: flip.getAttribute('aria-label'),
      interactionHints: document.querySelectorAll('[data-card-interaction-hint]').length,
      frontLabel: document.querySelector('#card-front')?.dataset.sideLabel,
      backLabel: document.querySelector('#card-back')?.dataset.sideLabel,
      gradePromptHidden: document.querySelector('[data-study-tools-label]')?.hidden
    };
    flip.click();
    const back = {
      side: app.dataset.cardSide,
      flipLabel: flip.querySelector('span:last-child')?.textContent.trim(),
      flipAria: flip.getAttribute('aria-label'),
      gradePromptHidden: document.querySelector('[data-study-tools-label]')?.hidden
    };
    return { front, back };
  })()`);

  assert.equal(state.front.side, 'front', 'study shell should identify the question side');
  assert.equal(state.front.flipLabel, 'Show answer', 'front-side primary action should say Show answer');
  assert.equal(state.front.interactionHints, 0, 'redundant card interaction hints should not render');
  assert.equal(state.front.frontLabel, 'Question', 'front face should carry a clear Question label');
  assert.equal(state.front.backLabel, 'Answer', 'back face should carry a clear Answer label');
  assert.equal(state.front.gradePromptHidden, true, 'recall-rating prompt should stay hidden before revealing the answer');
  assert.equal(state.back.side, 'back', 'study shell should identify the answer side after flipping');
  assert.equal(state.back.flipLabel, 'Show question', 'back-side primary action should say Show question');

  assert.equal(state.back.gradePromptHidden, false, 'recall-rating prompt should appear after revealing the answer');
}

async function smokeReadableTypography(client, url) {
  await navigate(client, url);
  await waitFor(client, `document.readyState === 'complete' && document.querySelector('.quiz-hint')`, 'quiz typography fixture to load');

  const typography = await evaluate(client, `(() => {
    const body = getComputedStyle(document.body);
    const hint = getComputedStyle(document.querySelector('.quiz-hint'));
    const question = getComputedStyle(document.querySelector('.card-question'));
    const checkButton = getComputedStyle(document.querySelector('.quiz-controls button'));
    return {
      bodyFamily: body.fontFamily,
      hintFamily: hint.fontFamily,
      hintSize: parseFloat(hint.fontSize),
      hintLineHeight: parseFloat(hint.lineHeight),
      hintLetterSpacing: parseFloat(hint.letterSpacing) || 0,
      questionLetterSpacing: parseFloat(question.letterSpacing) || 0,
      checkButtonSize: parseFloat(checkButton.fontSize)
    };
  })()`);

  assert.match(typography.bodyFamily, /system-ui/i, `body should use the native readable system font stack: ${JSON.stringify(typography)}`);
  assert.equal(typography.hintFamily, typography.bodyFamily, 'quiz hint should use the same readable family as body text');
  assert.ok(typography.hintSize >= 14, `quiz hint should never shrink below 14px: ${JSON.stringify(typography)}`);
  assert.ok(typography.hintLineHeight / typography.hintSize >= 1.3, `quiz hint should have comfortable line spacing: ${JSON.stringify(typography)}`);
  assert.ok(typography.hintLetterSpacing >= 0, `quiz hint letters should not be compressed: ${JSON.stringify(typography)}`);
  assert.ok(typography.questionLetterSpacing >= -0.5, `question text should avoid aggressive tracking: ${JSON.stringify(typography)}`);
  assert.ok(typography.checkButtonSize >= 14 && typography.checkButtonSize <= 18, `Check Answer should use a readable UI text size instead of inheriting display typography: ${JSON.stringify(typography)}`);
}

async function smokeAnswerSideOptions(client, url) {
  await navigate(client, url);
  await waitFor(
    client,
    `document.readyState === 'complete' && document.querySelectorAll('#card-front .option-list .option-button').length > 1`,
    'multiple-choice card options to load'
  );

  const state = await evaluate(client, `(() => {
    const frontFace = document.querySelector('#card-front');
    const frontMeta = frontFace.querySelector(':scope > .card-face-meta');
    const frontLabel = frontMeta.querySelector('.card-side-label');
    const frontBadge = frontMeta.querySelector('.card-type-badge');
    const front = Array.from(document.querySelectorAll('#card-front .option-button')).map((button) => button.textContent.trim());
    const backItems = Array.from(document.querySelectorAll('#card-back .option-list li'));
    return {
      front,
      back: backItems.map((item) => item.textContent.trim()),
      correct: backItems.filter((item) => item.classList.contains('is-correct')).length,
      muted: backItems.filter((item) => item.classList.contains('is-muted')).length,
      disabled: backItems.filter((item) => item.querySelector('.option-button')?.disabled).length,
      answerBadges: document.querySelectorAll('#card-back .card-type-badge').length,
      frontLabel: frontLabel?.textContent.trim(),
      frontBadge: frontBadge?.textContent.trim(),
      badgeUsesSharedMeta: frontBadge?.parentElement === frontMeta,
      badgeToRightOfLabel: Boolean(frontLabel && frontBadge && frontBadge.getBoundingClientRect().left >= frontLabel.getBoundingClientRect().right),
      frontScale: parseFloat(getComputedStyle(document.querySelector('#card-front')).getPropertyValue('--card-content-scale')),
      backScale: parseFloat(getComputedStyle(document.querySelector('#card-back')).getPropertyValue('--card-content-scale')),
      frontFontSize: parseFloat(getComputedStyle(document.querySelector('#card-front .option-button')).fontSize),
      backFontSize: parseFloat(getComputedStyle(document.querySelector('#card-back .option-button')).fontSize),
      frontHeights: Array.from(document.querySelectorAll('#card-front .option-list li')).map((item) => Math.round(item.getBoundingClientRect().height * 10) / 10),
      backHeights: backItems.map((item) => Math.round(item.getBoundingClientRect().height * 10) / 10)
    };
  })()`);

  assert.deepEqual(state.back, state.front, 'answer side should repeat the same options in the same order');
  assert.ok(state.correct > 0, 'answer side should identify at least one correct option');
  assert.ok(state.muted > 0, 'answer side should mute incorrect options');
  assert.equal(state.disabled, state.back.length, 'answer-side options should be presentational, not re-answerable');
  assert.equal(state.answerBadges, 0, 'answer-side options should not render a redundant card-type badge');
  assert.equal(state.frontLabel, 'Question', 'the question-side label should render as a reusable card chip');
  assert.equal(state.frontBadge, 'Multiple choice', 'multiple-choice cards should render a type badge');
  assert.equal(state.badgeUsesSharedMeta, true, 'the type badge should share the card metadata container with the side label');
  assert.equal(state.badgeToRightOfLabel, true, 'the type badge should sit directly to the right of the Question label');
  assert.equal(state.backScale, state.frontScale, `front and back option faces should share one content scale: ${JSON.stringify(state)}`);
  assert.ok(Math.abs(state.backFontSize - state.frontFontSize) <= 0.1, `front and back option text should be the same size: ${JSON.stringify(state)}`);
  assert.deepEqual(state.backHeights, state.frontHeights, `front and back option buttons should have matching heights: ${JSON.stringify(state)}`);
}

async function smokeSingleChoiceTypeBadge(client, url) {
  await navigate(client, url);
  await waitFor(
    client,
    `document.readyState === 'complete' && document.querySelector('#card-front .card-type-badge')?.textContent.trim() === 'Single choice'`,
    'single-choice card type badge to render'
  );

  const state = await evaluate(client, `(() => {
    const buttons = Array.from(document.querySelectorAll('#card-front .option-button'));
    buttons[0].click();
    Array.from(document.querySelectorAll('#card-front .option-button'))[1].click();
    return {
      badge: document.querySelector('#card-front .card-type-badge')?.textContent.trim(),
      selected: Array.from(document.querySelectorAll('#card-front li.is-selected .option-button')).map((button) => button.textContent.trim())
    };
  })()`);

  assert.equal(state.badge, 'Single choice', `one-answer cards should use the single-choice schema label: ${JSON.stringify(state)}`);
  assert.equal(state.selected.length, 1, `single-choice cards must only retain one selected option: ${JSON.stringify(state)}`);
}

async function smokeTrueFalseTypeBadge(client, url) {
  await navigate(client, url);
  await waitFor(
    client,
    `document.readyState === 'complete' && document.querySelector('#card-front .card-type-badge')?.textContent.trim() === 'True or False'`,
    'true-or-false card type badge to render'
  );

  const state = await evaluate(client, `(() => {
    Array.from(document.querySelectorAll('#card-front .option-button')).find((button) => button.textContent.trim() === 'True').click();
    Array.from(document.querySelectorAll('#card-front .option-button')).find((button) => button.textContent.trim() === 'False').click();
    return {
      badge: document.querySelector('#card-front .card-type-badge')?.textContent.trim(),
      options: Array.from(document.querySelectorAll('#card-front .option-button')).map((button) => button.textContent.trim()),
      selected: Array.from(document.querySelectorAll('#card-front li.is-selected .option-button')).map((button) => button.textContent.trim()),
      sharedMeta: document.querySelector('#card-front .card-type-badge')?.parentElement === document.querySelector('#card-front .card-face-meta')
    };
  })()`);

  assert.equal(state.badge, 'True or False', `True/False options should not be mislabeled as multiple choice: ${JSON.stringify(state)}`);
  assert.deepEqual(state.options, ['True', 'False'], 'the true-or-false fixture should present the canonical two choices');
  assert.deepEqual(state.selected, ['False'], `True/False cards must replace the first choice when a second answer is selected: ${JSON.stringify(state)}`);
  assert.equal(state.sharedMeta, true, 'the True or False chip should share the reusable card metadata row');
}

async function captureMobileAnswerOptions(client, url) {
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
    screenWidth: 390,
    screenHeight: 844
  });
  await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  try {
    await navigate(client, url);
    await waitFor(client, `document.querySelectorAll('#card-back .option-list--answer li').length > 1 && document.querySelector('.quiz-hint')`, 'answer-side options and quiz hint to load in iPhone viewport');
    const quizScreenshot = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const quizScreenshotPath = path.join(os.tmpdir(), 'flash-cards-quiz-hint-iphone-qa.png');
    fs.writeFileSync(quizScreenshotPath, Buffer.from(quizScreenshot.data, 'base64'));
    console.log(`Quiz typography visual QA screenshot: ${quizScreenshotPath}`);
    await evaluate(client, `document.querySelector('#flip-card').click()`);
    await waitFor(client, `document.querySelector('#card').classList.contains('is-flipped')`, 'multiple-choice card to flip to its answer side');
    await evaluate(client, `new Promise((resolve) => setTimeout(resolve, 760))`);
    const screenshot = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const screenshotPath = path.join(os.tmpdir(), 'flash-cards-answer-options-iphone-qa.png');
    fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));
    console.log(`Answer options visual QA screenshot: ${screenshotPath}`);
  } finally {
    await client.send('Emulation.clearDeviceMetricsOverride');
    await client.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  }
}

async function captureDesktopQa(client, url) {
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: 1440,
    screenHeight: 1000
  });
  try {
    await navigate(client, url);
    await waitFor(client, `document.readyState === 'complete' && document.querySelector('#card-front') && !document.querySelector('#card-front').textContent.includes('Loading')`, 'desktop deck visual QA state');
    const screenshot = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const screenshotPath = path.join(os.tmpdir(), 'flash-cards-desktop-qa.png');
    fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));
    console.log(`Desktop visual QA screenshot: ${screenshotPath}`);
  } finally {
    await client.send('Emulation.clearDeviceMetricsOverride');
  }
}

async function smokeMobilePwa(client, url) {
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
    screenWidth: 390,
    screenHeight: 844
  });
  await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

  try {
    await navigate(client, url);
    await waitFor(
      client,
      `document.readyState === 'complete' && document.querySelector('#card-front') && !document.querySelector('#card-front').textContent.includes('Loading')`,
      'Network+ deck to load in iPhone viewport'
    );

    await evaluate(client, `new Promise((resolve) => {
      document.querySelector('[data-mobile-deck-toggle]').click();
      setTimeout(resolve, 380);
    })`);
    const deckScreenshot = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const deckScreenshotPath = path.join(os.tmpdir(), 'flash-cards-deck-sheet-qa.png');
    fs.writeFileSync(deckScreenshotPath, Buffer.from(deckScreenshot.data, 'base64'));
    console.log(`Deck sheet visual QA screenshot: ${deckScreenshotPath}`);

    const mobile = await evaluate(client, `(() => {
      const card = document.querySelector('#card');
      const utility = document.querySelector('.utility-nav');
      const deckToggle = document.querySelector('[data-mobile-deck-toggle]');
      const deckPanel = document.querySelector('#deck-navigator');
      const activeSection = deckPanel.querySelector('.section-button.is-active');
      const deckState = {
        open: document.querySelector('.app-shell').classList.contains('is-mobile-deck-open'),
        expanded: deckToggle.getAttribute('aria-expanded'),
        width: deckPanel.getBoundingClientRect().width,
        height: deckPanel.getBoundingClientRect().height,
        activeSectionHeight: activeSection ? activeSection.getBoundingClientRect().height : 0
      };
      document.querySelector('[data-mobile-deck-close]').click();
      const actions = Array.from(document.querySelectorAll('.card-actions button'));
      const before = document.querySelector('#card-count').textContent;
      card.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 91, pointerType: 'touch', clientX: 320, clientY: 400 }));
      card.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 91, pointerType: 'touch', clientX: 90, clientY: 405 }));
      return {
        viewport: document.querySelector('meta[name="viewport"]')?.content || '',
        viewportWidth: innerWidth,
        appleCapable: document.querySelector('meta[name="apple-mobile-web-app-capable"]')?.content || '',
        appleIcon: document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href') || '',
        manifest: document.querySelector('link[rel="manifest"]')?.getAttribute('href') || '',
        horizontalOverflow: document.documentElement.scrollWidth - innerWidth,
        cardWidth: card.offsetWidth,
        utilityPosition: getComputedStyle(utility).position,
        utilityBottom: Math.round(innerHeight - utility.getBoundingClientRect().bottom),
        utilityHeight: utility.getBoundingClientRect().height,
        cardFontSize: parseFloat(getComputedStyle(document.querySelector('#card-front')).fontSize),
        deckState,
        deckClosed: !document.querySelector('.app-shell').classList.contains('is-mobile-deck-open'),
        shortTargets: actions.filter((button) => button.getBoundingClientRect().height < 44).length,
        shortStudyTargets: Array.from(document.querySelectorAll('.study-tools button')).filter((button) => button.getClientRects().length && button.getBoundingClientRect().height < 44).length,
        swipeStarted: card.classList.contains('slide-out-next'),
        before
      };
    })()`);

    assert.match(mobile.viewport, /viewport-fit=cover/, 'viewport should opt into iPhone safe-area coverage');
    assert.equal(mobile.appleCapable, 'yes', 'iOS standalone mode metadata should be enabled');
    assert.match(mobile.appleIcon, /apple-touch-icon\.png/, 'iOS should receive a dedicated touch icon');
    assert.match(mobile.manifest, /manifest\.webmanifest/, 'PWA manifest should remain linked');
    assert.ok(mobile.horizontalOverflow <= 1, `iPhone layout should not overflow horizontally: ${mobile.horizontalOverflow}px`);
    assert.ok(mobile.cardWidth >= mobile.viewportWidth - 48 && mobile.cardWidth <= mobile.viewportWidth, `study card should fill the iPhone canvas without clipping: ${JSON.stringify(mobile)}`);
    assert.equal(mobile.utilityPosition, 'fixed', 'mobile utility navigation should behave like a native bottom tab bar');
    assert.ok(Math.abs(mobile.utilityBottom) <= 1, `mobile tab bar should dock to the viewport bottom: ${mobile.utilityBottom}px`);
    assert.ok(mobile.utilityHeight >= 44 && mobile.utilityHeight <= 52, `mobile tab bar should be compact but touchable: ${mobile.utilityHeight}px`);
    assert.ok(mobile.cardFontSize >= 32, `mobile card prompt should remain comfortably readable: ${mobile.cardFontSize}px`);
    assert.equal(mobile.deckState.open, true, 'Deck button should open the mobile deck navigator');
    assert.equal(mobile.deckState.expanded, 'true', 'Deck button should announce its expanded state');
    assert.ok(mobile.deckState.width >= 360 && mobile.deckState.height >= 400, `Deck navigator should use a roomy native-style sheet: ${JSON.stringify(mobile.deckState)}`);
    assert.ok(mobile.deckState.activeSectionHeight >= 44, 'Deck navigator sections should remain touch friendly');
    assert.equal(mobile.deckClosed, true, 'Deck navigator scrim should close the sheet');
    assert.equal(mobile.shortTargets, 0, 'primary card actions should preserve 44px touch targets');
    assert.equal(mobile.shortStudyTargets, 0, 'visible mobile study tools should preserve 44px touch targets');
    assert.equal(mobile.swipeStarted, true, 'a left touch swipe should start next-card navigation');

    await waitFor(client, `!document.querySelector('#card').className.includes('slide-')`, 'touch swipe animation to finish');
    const screenshot = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const screenshotPath = path.join(os.tmpdir(), 'flash-cards-iphone-qa.png');
    fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));
    console.log(`iPhone visual QA screenshot: ${screenshotPath}`);
  } finally {
    await client.send('Emulation.clearDeviceMetricsOverride');
    await client.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  }
}

async function navigate(client, url) {
  await client.send('Page.navigate', { url });
}

async function waitFor(client, expression, description, timeoutMs = 8000) {
  const started = Date.now();
  let lastValue;

  while (Date.now() - started < timeoutMs) {
    lastValue = await evaluate(client, `Boolean(${expression})`);
    if (lastValue === true) {
      return;
    }
    await delay(100);
  }

  throw new Error(`Timed out waiting for ${description}; last value: ${JSON.stringify(lastValue)}`);
}

async function evaluate(client, expression) {
  const response = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  });

  if (response.exceptionDetails) {
    const exception = response.exceptionDetails.exception;
    const detail = exception && (exception.description || exception.value);
    throw new Error(`Browser evaluation failed: ${response.exceptionDetails.text}${detail ? `\n${detail}` : ''}`);
  }

  return response.result ? response.result.value : undefined;
}

async function startStaticServer(directory) {
  const server = http.createServer((request, response) => {
    try {
      const requestUrl = new URL(request.url, 'http://127.0.0.1');
      let pathname = decodeURIComponent(requestUrl.pathname);

      if (pathname === pagesPrefix || pathname.startsWith(`${pagesPrefix}/`)) {
        pathname = pathname.slice(pagesPrefix.length) || '/';
      }

      if (pathname.endsWith('/')) {
        pathname += 'index.html';
      }

      const normalizedPath = path.normalize(pathname).replace(/^([/\\])+/, '');
      const filePath = path.join(directory, normalizedPath);
      const relative = path.relative(directory, filePath);

      if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('not found');
        return;
      }

      response.writeHead(200, { 'content-type': contentType(filePath) });
      fs.createReadStream(filePath).pipe(response);
    } catch (error) {
      response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      response.end(String(error && error.stack ? error.stack : error));
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  return server;
}

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.mp3': 'audio/mpeg',
    '.pdf': 'application/pdf',
    '.svg': 'image/svg+xml',
    '.wav': 'audio/wav',
    '.xml': 'application/xml; charset=utf-8'
  }[extension] || 'application/octet-stream';
}

async function startChrome() {
  const executable = findChromeExecutable();
  const debugPort = await freePort();
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flash-cards-browser-smoke-'));
  const chrome = childProcess.spawn(executable, [
    '--headless=new',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-sandbox',
    '--do-not-de-elevate',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profileDir}`,
    'about:blank'
  ], {
    stdio: ['ignore', 'ignore', 'pipe']
  });

  let stderr = '';
  chrome.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  chrome.profileDir = profileDir;
  chrome.debugPort = debugPort;
  chrome.stderrText = () => stderr;

  await waitForChrome(debugPort, chrome);
  return chrome;
}

function findChromeExecutable() {
  const candidates = [
    process.env.CHROME_BIN,
    path.join(process.env.PROGRAMFILES || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env.PROGRAMFILES || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ].filter(Boolean);

  const executable = candidates.find((candidate) => fs.existsSync(candidate));
  assert.ok(executable, 'google-chrome or chromium is required for browser smoke tests');
  return executable;
}

async function waitForChrome(port, chrome) {
  const started = Date.now();

  while (Date.now() - started < 8000) {
    if (chrome.exitCode !== null) {
      throw new Error(`Chrome exited early with code ${chrome.exitCode}: ${chrome.stderrText()}`);
    }

    try {
      await httpJson(port, '/json/version');
      return;
    } catch (error) {
      await delay(100);
    }
  }

  throw new Error(`Timed out waiting for Chrome DevTools: ${chrome.stderrText()}`);
}

async function openPageClient(port) {
  const targets = await httpJson(port, '/json');
  let target = targets.find((item) => item.type === 'page' && item.webSocketDebuggerUrl);

  if (!target) {
    target = await httpJson(port, `/json/new?${encodeURIComponent('about:blank')}`, 'PUT');
  }

  assert.ok(target.webSocketDebuggerUrl, 'Chrome should expose a page WebSocket debugger URL');
  return new CdpClient(target.webSocketDebuggerUrl);
}

function httpJson(port, requestPath, method = 'GET') {
  return new Promise((resolve, reject) => {
    const request = http.request({ hostname: '127.0.0.1', port, path: requestPath, method }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`DevTools HTTP ${response.statusCode}: ${body}`));
          return;
        }

        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });

    request.on('error', reject);
    request.end();
  });
}

class CdpClient {
  constructor(webSocketUrl) {
    this.nextId = 1;
    this.pending = new Map();
    this.socket = new WebSocket(webSocketUrl);
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => this.handleMessage(event));
    this.socket.addEventListener('close', () => {
      for (const { reject } of this.pending.values()) {
        reject(new Error('Chrome DevTools WebSocket closed'));
      }
      this.pending.clear();
    });
  }

  async send(method, params = {}) {
    await this.ready;
    const id = this.nextId++;
    const message = JSON.stringify({ id, method, params });

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(message);
    });
  }

  handleMessage(event) {
    const message = JSON.parse(event.data);
    if (!message.id || !this.pending.has(message.id)) {
      return;
    }

    const pending = this.pending.get(message.id);
    this.pending.delete(message.id);

    if (message.error) {
      pending.reject(new Error(`${message.error.message}: ${message.error.data || ''}`));
    } else {
      pending.resolve(message.result || {});
    }
  }

  async close() {
    await this.ready;
    this.socket.close();
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

async function stopChrome(chrome) {
  const waitForExit = () => new Promise((resolve) => chrome.once('exit', resolve));

  if (chrome.exitCode === null) {
    chrome.kill('SIGTERM');
    const exitedAfterTerm = await Promise.race([
      waitForExit().then(() => true),
      delay(2000).then(() => false)
    ]);

    if (!exitedAfterTerm && chrome.exitCode === null) {
      chrome.kill('SIGKILL');
      await Promise.race([
        waitForExit(),
        delay(2000)
      ]);
    }
  }

  if (chrome.profileDir) {
    // Chromium can keep profile files open for a short moment after the main
    // process exits. Retry ENOTEMPTY/EBUSY cleanup instead of failing a passed
    // smoke test during teardown.
    for (let attempt = 1; attempt <= 20; attempt += 1) {
      try {
        fs.rmSync(chrome.profileDir, {
          recursive: true,
          force: true,
          maxRetries: 5,
          retryDelay: 100
        });
        break;
      } catch (error) {
        if (attempt === 20 || !['ENOTEMPTY', 'EBUSY', 'EPERM'].includes(error.code)) {
          throw error;
        }
        await delay(250);
      }
    }
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
