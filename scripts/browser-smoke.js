#!/usr/bin/env node
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { httpJson, waitForDevTools } = require('./browser-smoke-transport');
const { getWebSocketConstructor } = require('./cdp-websocket');

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
    await smokeNoPhantomControllerFocus(client, `${origin}${pagesPrefix}/tests/network-plus/`);
    await smokeControllerPanels(client, `${origin}${pagesPrefix}/tests/network-plus/`);
    await smokeControllerTocStickyHeaderScroll(client, `${origin}${pagesPrefix}/tests/network-plus/`);
    await smokeControllerMobileFocus(client, `${origin}${pagesPrefix}/tests/network-plus/`);
    await smokeControllerInputMap(client, `${origin}${pagesPrefix}/tests/network-plus/`);
    await smokeControllerTtsSelects(client, `${origin}${pagesPrefix}/tests/network-plus/`);
    await smokeSecuritySourceSection(client, `${origin}${pagesPrefix}/tests/security-plus/?smoke=source-section#section=Practice%20Test%201`);
    await smokeNativeMultipleChoiceInputs(client, `${origin}${pagesPrefix}/tests/security-plus/?smoke=native-checkboxes#section=Practice%20Test%201&card=1`);
    await smokeMouseOptionGrading(client, `${origin}${pagesPrefix}/tests/security-plus/?smoke=mouse-option-grading#section=Practice%20Test%201&card=1`);
    await smokeLegacyOptionSelfGradeIsolation(client, `${origin}${pagesPrefix}/tests/security-plus/?smoke=legacy-option-grade#section=Practice%20Test%201&card=1`);
    await smokeControllerAnswerMarking(client, `${origin}${pagesPrefix}/tests/security-plus/?smoke=controller-answer-marking#section=Practice%20Test%201&card=1`);
    await smokeControllerFocusedButtonActivation(client, `${origin}${pagesPrefix}/tests/security-plus/?smoke=controller-try-again#section=Practice%20Test%201&card=1`);
    await smokeControllerCorrectOnlyGrading(client, `${origin}${pagesPrefix}/tests/security-plus/?smoke=controller-correct-only#section=Practice%20Test%201&card=1`);
    await smokeControllerAxisLatch(client, `${origin}${pagesPrefix}/tests/network-plus/`);
    await smokeCompletedSectionScore(client, `${origin}${pagesPrefix}/tests/network-plus/`);
    await smokeResetProgress(client, `${origin}${pagesPrefix}/tests/network-plus/`);
    await smokeCardAnimations(client, `${origin}${pagesPrefix}/tests/network-plus/`);
    await smokePretextFlipAndTts(client, `${origin}${pagesPrefix}/tests/network-plus/`);
    await smokeStudyStateCues(client, `${origin}${pagesPrefix}/tests/network-plus/`);
    await smokeReadableTypography(client, `${origin}${pagesPrefix}/tests/tech-plus-fc0-u71/`);
    await smokeAnswerSideOptions(client, `${origin}${pagesPrefix}/tests/security-plus/?smoke=multiple#section=Practice%20Test%201&card=1`);
    await smokeScaledFourKAnswerFit(client, `${origin}${pagesPrefix}/tests/security-plus/#section=Practice%20Test%201&card=1`);
    await smokeStudyChromeDensity(client, `${origin}${pagesPrefix}/tests/security-plus/?smoke=study-density#section=Practice%20Test%201&card=1`);
    await smokeFourKQuizResultLabel(client, `${origin}${pagesPrefix}/tests/security-plus/?smoke=single#section=Practice%20Test%201&card=7`);
    await smokeSingleChoiceTypeBadge(client, `${origin}${pagesPrefix}/tests/security-plus/?smoke=single#section=Practice%20Test%201&card=7`);
    await smokeTrueFalseTypeBadge(client, `${origin}${pagesPrefix}/tests/security-plus/?smoke=true-false#section=Practice%20Test%201&card=14`);
    await smokeCardMetadataClearance(client, `${origin}${pagesPrefix}/tests/security-plus/?smoke=single#section=Practice%20Test%201&card=7`);
    await captureMobileAnswerOptions(client, `${origin}${pagesPrefix}/tests/tech-plus-fc0-u71/`);
    await captureDesktopQa(client, `${origin}${pagesPrefix}/tests/network-plus/`);
    await captureLaptopQa(client, `${origin}${pagesPrefix}/tests/network-plus/`);
    await smokeStudyPanelScrollAccessibility(client, `${origin}${pagesPrefix}/tests/network-plus/`);
    await smokeMobilePwa(client, `${origin}${pagesPrefix}/tests/network-plus/`);

    await client.close();
    console.log('Browser smoke checks passed for native checkbox/radio quiz controls, mouse and Xbox-style controller answer flows, theme selector, global search, deck editor, controller panels, reset progress, card animations, touch gestures, and iPhone PWA layout.');
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

async function smokeNoPhantomControllerFocus(client, url) {
  await navigate(client, url);
  await waitFor(client, `document.readyState === 'complete' && document.querySelector('[data-controller-state="disconnected"]') && document.querySelector('#next-card:not(:disabled)')`, 'deck without a connected controller to load');

  const initialCount = await evaluate(client, `document.querySelector('#card-count').textContent`);
  const initialFocused = await evaluate(client, `document.querySelectorAll('.is-controller-focused').length`);
  await evaluate(client, `document.querySelector('#next-card').click()`);
  await waitFor(client, `document.querySelector('#card-count').textContent !== ${JSON.stringify(initialCount)}`, 'mouse Next navigation to finish without a controller');
  await delay(320);
  const afterNextFocused = await evaluate(client, `document.querySelectorAll('.is-controller-focused').length`);
  await evaluate(client, `document.querySelector('#prev-card').click()`);
  await waitFor(client, `document.querySelector('#card-count').textContent === ${JSON.stringify(initialCount)}`, 'mouse Previous navigation to finish without a controller');
  await delay(320);
  const afterPreviousFocused = await evaluate(client, `document.querySelectorAll('.is-controller-focused').length`);

  assert.deepEqual(
    { initialFocused, afterNextFocused, afterPreviousFocused },
    { initialFocused: 0, afterNextFocused: 0, afterPreviousFocused: 0 },
    'cards navigated without a detected or active controller must not receive controller-only focus styling'
  );
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
  assert.equal(state.afterTocSelection.activeElementId, 'flip-card', `Study panel focus should restore to the primary Flip control: ${JSON.stringify(state.afterTocSelection)}`);
  assert.equal(state.modalContext, 'modal', 'open dialogs should take controller context priority over Study');
  assert.notEqual(state.focusedAfterModalMove, state.focusedBeforeModalMove, 'modal roving focus should move within the dialog');
  assert.equal(state.themeDialogHidden, true, 'controller B/close should close the active modal');
  assert.equal(state.afterFront, state.beforeModalFront, 'modal controller input should not leak into card navigation');
  assert.ok(state.roving.toc >= 0 && state.roving.study >= 0 && state.roving.modal >= 0, 'controller roving indexes should be tracked per context');
}

async function smokeControllerTocStickyHeaderScroll(client, url) {
  await navigate(client, url);
  await waitFor(
    client,
    `document.readyState === 'complete' && document.querySelectorAll('.toc-panel .section-button:not(:disabled)').length > 2`,
    'Network+ TOC to load for sticky-header controller scrolling checks'
  );

  const state = await evaluate(client, `(() => {
    const nav = window.FlashCardsControllerNav;
    const panel = document.querySelector('.toc-panel');
    const header = panel.querySelector('.toc-header');
    const targets = Array.from(panel.querySelectorAll('.section-button:not(:disabled)'));
    const first = targets[0];

    nav.focusPanel('toc');
    first.focus({ preventScroll: true });
    nav.move('up');
    nav.move('down');

    const headerBounds = header.getBoundingClientRect();
    const firstBounds = first.getBoundingClientRect();
    const firstState = {
      active: document.activeElement === first,
      scrollTop: panel.scrollTop,
      top: firstBounds.top
    };
    const targetIndex = Math.min(4, targets.length - 1);
    for (let index = 0; index < targetIndex; index += 1) nav.move('down');
    const targetBounds = targets[targetIndex].getBoundingClientRect();
    const panelBounds = panel.getBoundingClientRect();
    return {
      first: firstState,
      headerBottom: headerBounds.bottom,
      targetTop: targetBounds.top,
      targetBottom: targetBounds.bottom,
      panelBottom: panelBounds.bottom
    };
  })()`);

  assert.equal(state.first.active, true, `controller wrap-around should return focus to the first TOC section: ${JSON.stringify(state)}`);
  assert.ok(state.first.scrollTop <= 1, `returning to the first TOC section must reach the true scroll origin: ${JSON.stringify(state)}`);
  assert.ok(state.first.top >= state.headerBottom, `the first TOC section must not remain hidden behind the sticky header: ${JSON.stringify(state)}`);
  assert.ok(state.targetTop >= state.headerBottom + 12, `controller navigation must keep later TOC sections below the sticky header: ${JSON.stringify(state)}`);
  assert.ok(state.targetBottom <= state.panelBottom - 19, `controller navigation must keep later TOC sections inside the TOC viewport: ${JSON.stringify(state)}`);
}

async function smokeControllerMobileFocus(client, url) {
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
    screenWidth: 390,
    screenHeight: 844
  });

  try {
    await navigate(client, url);
    await waitFor(client, `document.readyState === 'complete' && document.querySelector('.section-button:not(:disabled)') && document.querySelector('#card-front') && !document.querySelector('#card-front').textContent.includes('Loading')`, 'Network+ deck to load for mobile controller checks');
    const state = await evaluate(client, `(() => {
      const nav = window.FlashCardsControllerNav;
      nav.focusPanel('toc');
      return {
        activePanel: document.querySelector('.app-shell').dataset.controllerPanel,
        deckOpen: document.querySelector('.app-shell').classList.contains('is-mobile-deck-open'),
        focusedSection: document.activeElement.classList.contains('section-button'),
        context: nav.context()
      };
    })()`);

    assert.equal(state.activePanel, 'toc', `LB should switch the active controller panel on mobile: ${JSON.stringify(state)}`);
    assert.equal(state.deckOpen, true, `LB should open the mobile deck sheet so its controller target is actually visible: ${JSON.stringify(state)}`);
    assert.equal(state.focusedSection, true, `LB should focus a visible section button on mobile: ${JSON.stringify(state)}`);
    assert.equal(state.context, 'toc', `mobile deck focus should report the TOC controller context: ${JSON.stringify(state)}`);
  } finally {
    await client.send('Emulation.clearDeviceMetricsOverride');
  }
}

async function smokeControllerInputMap(client, url) {
  await navigate(client, url);
  await waitFor(client, `document.readyState === 'complete' && document.querySelector('#card-front') && !document.querySelector('#card-front').textContent.includes('Loading')`, 'Network+ deck to load for controller input mapping checks');

  const state = await evaluate(client, `(() => {
    const nav = window.FlashCardsControllerNav;
    const app = document.querySelector('.app-shell');
    const before = document.querySelector('#card-count').textContent;
    nav.input('start');
    const modalOpened = !document.querySelector('[data-theme-dialog]').hidden;
    nav.input('b');
    const modalClosed = document.querySelector('[data-theme-dialog]').hidden;
    nav.input('lb');
    const tocFocused = app.dataset.controllerPanel === 'toc';
    nav.input('b');
    const studyRestored = app.dataset.controllerPanel === 'study';
    nav.input('x');
    const flipped = app.dataset.cardSide === 'back';
    nav.input('x');
    nav.input('rb');
    const result = {
      before,
      modalOpened,
      modalClosed,
      tocFocused,
      studyRestored,
      flipped,
      activePanel: app.dataset.controllerPanel,
      focusedId: document.activeElement.id
    };
    return result;
  })()`);

  assert.equal(state.modalOpened, true, `Start should open the settings modal: ${JSON.stringify(state)}`);
  assert.equal(state.modalClosed, true, `B should close a modal before reaching study actions: ${JSON.stringify(state)}`);
  assert.equal(state.tocFocused, true, `LB should focus the deck panel: ${JSON.stringify(state)}`);
  assert.equal(state.studyRestored, true, `B should return from the deck panel to Study: ${JSON.stringify(state)}`);
  assert.equal(state.flipped, true, `X should flip the current card: ${JSON.stringify(state)}`);
  assert.equal(state.activePanel, 'study', `RB should return the active panel to Study: ${JSON.stringify(state)}`);
}

async function smokeControllerTtsSelects(client, url) {
  await navigate(client, url);
  await waitFor(client, `document.readyState === 'complete' && document.querySelector('#speech-rate') && document.querySelector('#speech-voice')`, 'TTS controls to load for controller selection checks');

  const state = await evaluate(client, `(() => {
    const nav = window.FlashCardsControllerNav;
    const rate = document.querySelector('#speech-rate');
    const voice = document.querySelector('#speech-voice');
    const question = document.querySelector('#speak-question');
    const answer = document.querySelector('#speak-answer');
    const cardBefore = document.querySelector('#card-count').textContent;
    let questionClicks = 0;
    let answerClicks = 0;

    question.addEventListener('click', () => { questionClicks += 1; });
    answer.addEventListener('click', () => { answerClicks += 1; });
    rate.value = '1';
    voice.value = '';
    nav.focusPanel('study');

    rate.focus({ preventScroll: true });
    nav.input('a');
    const rateExpanded = rate.classList.contains('is-controller-select-open') && rate.size > 1;
    const rateExpandedHeight = rate.getBoundingClientRect().height;
    const rateInsideTools = rate.getBoundingClientRect().bottom <= document.querySelector('.tts-tools').getBoundingClientRect().bottom + 1;
    const rateBeforeMove = rate.value;
    nav.input('down');
    const ratePending = rate.value;
    nav.input('a');
    const rateCollapsed = !rate.classList.contains('is-controller-select-open') && rate.size <= 1;
    const storedRate = JSON.parse(localStorage.getItem('flash-cards:speech-preferences') || '{}').rate;

    voice.focus({ preventScroll: true });
    nav.input('a');
    const voiceExpanded = voice.classList.contains('is-controller-select-open') && voice.size > 1;
    nav.input('down');
    const voicePending = voice.value;
    nav.input('a');
    const voiceCollapsed = !voice.classList.contains('is-controller-select-open') && voice.size <= 1;
    const storedVoice = JSON.parse(localStorage.getItem('flash-cards:speech-preferences') || '{}').voice;

    question.focus({ preventScroll: true });
    nav.input('a');
    answer.focus({ preventScroll: true });
    nav.input('a');

    return {
      rateExpanded,
      rateExpandedHeight,
      rateInsideTools,
      rateBeforeMove,
      ratePending,
      rateCollapsed,
      storedRate,
      voiceExpanded,
      voicePending,
      voiceCollapsed,
      storedVoice,
      questionClicks,
      answerClicks,
      cardUnchanged: document.querySelector('#card-count').textContent === cardBefore
    };
  })()`);

  assert.equal(state.rateExpanded, true, `A should expand the focused speech-speed selector: ${JSON.stringify(state)}`);
  assert.ok(state.rateExpandedHeight > 36, `the expanded speech-speed selector should visibly expose multiple options: ${JSON.stringify(state)}`);
  assert.equal(state.rateInsideTools, true, `the expanded speech-speed selector must remain inside the TTS panel: ${JSON.stringify(state)}`);
  assert.notEqual(state.ratePending, state.rateBeforeMove, `D-pad Down should move the pending speech-speed selection: ${JSON.stringify(state)}`);
  assert.equal(state.rateCollapsed, true, `A should commit and collapse the speech-speed selector: ${JSON.stringify(state)}`);
  assert.equal(state.storedRate, state.ratePending, `committed controller speech-speed changes should persist: ${JSON.stringify(state)}`);
  assert.equal(state.voiceExpanded, true, `A should expand the focused speech-voice selector: ${JSON.stringify(state)}`);
  assert.notEqual(state.voicePending, '', `D-pad Down should move the pending speech-voice selection: ${JSON.stringify(state)}`);
  assert.equal(state.voiceCollapsed, true, `A should commit and collapse the speech-voice selector: ${JSON.stringify(state)}`);
  assert.equal(state.storedVoice, state.voicePending, `committed controller speech-voice changes should persist: ${JSON.stringify(state)}`);
  assert.equal(state.questionClicks, 1, `A should activate the focused Question TTS control: ${JSON.stringify(state)}`);
  assert.equal(state.answerClicks, 1, `A should activate the focused Answer TTS control: ${JSON.stringify(state)}`);
  assert.equal(state.cardUnchanged, true, `TTS controller actions must not self-grade or navigate the current card: ${JSON.stringify(state)}`);
}

async function smokeNativeMultipleChoiceInputs(client, url) {
  await navigate(client, url);
  await waitFor(client, `document.readyState === 'complete' && document.querySelector('#card-front .card-type-badge')?.textContent.trim() === 'Multiple choice'`, 'multiple-choice card to load for native checkbox checks');

  const state = await evaluate(client, `(() => {
    const inputs = Array.from(document.querySelectorAll('#card-front .option-input'));
    const labels = Array.from(document.querySelectorAll('#card-front .option-label'));
    const first = inputs[0];
    labels[0]?.click();
    const checkedAfterLabelClick = first?.checked;
    labels[0]?.click();

    return {
      count: inputs.length,
      types: inputs.map((input) => input.type),
      uniqueIds: new Set(inputs.map((input) => input.id)).size,
      labelsConnected: labels.every((label, index) => label.htmlFor === inputs[index]?.id),
      checkedAfterLabelClick,
      uncheckedAfterSecondLabelClick: first ? !first.checked : false
    };
  })()`);

  assert.ok(state.count > 1, `the multiple-choice fixture must expose several options: ${JSON.stringify(state)}`);
  assert.deepEqual(new Set(state.types), new Set(['checkbox']), `multiple-choice answers must use native checkboxes: ${JSON.stringify(state)}`);
  assert.equal(state.uniqueIds, state.count, `every answer checkbox needs a unique id: ${JSON.stringify(state)}`);
  assert.equal(state.labelsConnected, true, `every answer checkbox must be connected to its full-row label: ${JSON.stringify(state)}`);
  assert.equal(state.checkedAfterLabelClick, true, `clicking an answer label should check its checkbox: ${JSON.stringify(state)}`);
  assert.equal(state.uncheckedAfterSecondLabelClick, true, `clicking the same answer label again should uncheck its checkbox: ${JSON.stringify(state)}`);
}

async function smokeMouseOptionGrading(client, url) {
  await navigate(client, url);
  await waitFor(client, `document.readyState === 'complete' && document.querySelectorAll('#card-front .option-input:not(:disabled)').length >= 2`, 'multiple-choice card to load for mouse grading checks');

  const state = await evaluate(client, `(async () => {
    const inputs = () => Array.from(document.querySelectorAll('#card-front .option-input'));
    const correctIndexes = Array.from(document.querySelectorAll('#card-back .option-list--answer li')).flatMap((item, index) => item.classList.contains('is-correct') ? [index] : []);
    const initialSubmit = document.querySelector('#card-front [data-quiz-submit]');
    const initialHint = document.querySelector('#card-front .quiz-hint')?.textContent.trim() || '';
    const initialDisabled = initialSubmit?.disabled;

    inputs()[correctIndexes[0]].click();
    const selectedAfterFirstClick = document.querySelectorAll('#card-front li.is-selected').length;
    inputs()[correctIndexes[0]].click();
    const selectedAfterSecondClick = document.querySelectorAll('#card-front li.is-selected').length;

    correctIndexes.forEach((index) => inputs()[index].click());
    const submit = document.querySelector('#card-front [data-quiz-submit]');
    const enabledAfterSelection = submit && !submit.disabled;
    const selectionStatus = document.querySelector('#card-front .quiz-hint')?.textContent.trim() || '';
    submit.click();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const result = {
      questionType: document.querySelector('#card-front .card-type-badge')?.textContent.trim(),
      correctAnswerCount: correctIndexes.length,
      initialHint,
      hadSubmit: Boolean(initialSubmit),
      initialDisabled,
      selectedAfterFirstClick,
      selectedAfterSecondClick,
      enabledAfterSelection,
      selectionStatus,
      remainedOnQuestion: document.querySelector('.app-shell').dataset.cardSide === 'front',
      result: document.querySelector('#card-front .quiz-result')?.textContent.trim() || '',
      allOptionsLocked: inputs().every((input) => input.disabled),
      hasNextAction: Array.from(document.querySelectorAll('#card-front .quiz-controls button')).some((button) => /next card/i.test(button.textContent)),
      toolbarTitleWidth: Math.round(document.querySelector('.deck-toolbar h2').getBoundingClientRect().width),
      toolbarWidth: Math.round(document.querySelector('.deck-toolbar').getBoundingClientRect().width)
    };
    localStorage.removeItem('flash-cards:security-plus:progress:v1');
    return result;
  })()`);

  assert.equal(state.questionType, 'Multiple choice', `the mouse regression fixture must be a multiple-choice card: ${JSON.stringify(state)}`);
  assert.ok(state.correctAnswerCount > 1, `the mouse regression fixture must require multiple answers: ${JSON.stringify(state)}`);
  assert.match(state.initialHint, /select all.*check/i, `mouse guidance should plainly explain multi-selection and grading: ${JSON.stringify(state)}`);
  assert.equal(state.hadSubmit, true, `option cards should provide an explicit Check answer button for mouse users: ${JSON.stringify(state)}`);
  assert.equal(state.initialDisabled, true, `Check answer should stay disabled until an answer is selected: ${JSON.stringify(state)}`);
  assert.equal(state.selectedAfterFirstClick, 1, `clicking an option should select it: ${JSON.stringify(state)}`);
  assert.equal(state.selectedAfterSecondClick, 0, `clicking a selected multiple-choice option should deselect it: ${JSON.stringify(state)}`);
  assert.equal(state.enabledAfterSelection, true, `Check answer should enable after selection: ${JSON.stringify(state)}`);
  assert.match(state.selectionStatus, new RegExp(`${state.correctAnswerCount} selected`, 'i'), `the interface should confirm how many answers are selected: ${JSON.stringify(state)}`);
  assert.equal(state.remainedOnQuestion, true, `checking an answer should show inline grading feedback before flipping: ${JSON.stringify(state)}`);
  assert.match(state.result, /correct/i, `an exact mouse selection should be graded inline: ${JSON.stringify(state)}`);
  assert.equal(state.allOptionsLocked, true, `graded options should lock until Try Again or navigation: ${JSON.stringify(state)}`);
  assert.equal(state.hasNextAction, true, `a correct result should offer a clear Next card action: ${JSON.stringify(state)}`);
  assert.ok(state.toolbarTitleWidth >= state.toolbarWidth * 0.45, `mouse selection must not collapse the deck heading into a narrow column: ${JSON.stringify(state)}`);
}

async function smokeControllerAnswerMarking(client, url) {
  await navigate(client, url);
  await waitFor(client, `document.readyState === 'complete' && document.querySelectorAll('#card-front .option-input:not(:disabled)').length >= 2`, 'option card to load for controller answer-selection checks');

  const state = await evaluate(client, `(() => {
    const nav = window.FlashCardsControllerNav;
    const inputs = Array.from(document.querySelectorAll('#card-front .option-input'));
    inputs[0].focus({ preventScroll: true });
    nav.input('a');
    const afterFirstSelection = {
      checked: inputs[0].checked,
      focused: document.activeElement === inputs[0],
      side: document.querySelector('.app-shell').dataset.cardSide
    };

    nav.input('down');
    const focusedAfterMove = document.activeElement;
    nav.input('a');
    const afterSecondSelection = {
      movedToNextOption: focusedAfterMove === inputs[1],
      checked: inputs[1].checked,
      selectedCount: inputs.filter((input) => input.checked).length
    };

    nav.input('b');
    const afterBackOnQuestion = {
      side: document.querySelector('.app-shell').dataset.cardSide,
      selectedCount: inputs.filter((input) => input.checked).length
    };

    nav.input('x');
    const afterFlip = {
      side: document.querySelector('.app-shell').dataset.cardSide,
      graded: Array.from(document.querySelectorAll('#card-front .option-input')).every((input) => input.disabled),
      focusedFlip: document.activeElement === document.querySelector('#flip-card'),
      frontInert: document.querySelector('#card-front').inert,
      frontAriaHidden: document.querySelector('#card-front').getAttribute('aria-hidden'),
      backInert: document.querySelector('#card-back').inert,
      backAriaHidden: document.querySelector('#card-back').getAttribute('aria-hidden')
    };

    const selectedBeforeHiddenNavigation = inputs.filter((input) => input.checked).length;
    let hiddenFocusReached = false;
    for (const direction of ['up', 'down', 'left', 'right', 'up', 'up', 'down', 'down', 'left', 'right']) {
      nav.input(direction);
      if (document.querySelector('#card-front').contains(document.activeElement)) {
        hiddenFocusReached = true;
        nav.input('a');
        break;
      }
    }
    const hiddenFaceInteraction = {
      hiddenFocusReached,
      selectionChanged: inputs.filter((input) => input.checked).length !== selectedBeforeHiddenNavigation
    };
    nav.input('b');

    const result = {
      afterFirstSelection,
      afterSecondSelection,
      afterBackOnQuestion,
      afterFlip,
      hiddenFaceInteraction,
      returnedToQuestion: document.querySelector('.app-shell').dataset.cardSide === 'front',
      restoredOptionFocus: document.activeElement === inputs[1],
      frontInteractiveAfterReturn: !document.querySelector('#card-front').inert && document.querySelector('#card-front').getAttribute('aria-hidden') === 'false',
      backHiddenAfterReturn: document.querySelector('#card-back').inert && document.querySelector('#card-back').getAttribute('aria-hidden') === 'true'
    };
    localStorage.removeItem('flash-cards:security-plus:progress:v1');
    return result;
  })()`);

  assert.deepEqual(state.afterFirstSelection, { checked: true, focused: true, side: 'front' }, `Xbox A should toggle the focused checkbox without moving or flipping the card: ${JSON.stringify(state)}`);
  assert.deepEqual(state.afterSecondSelection, { movedToNextOption: true, checked: true, selectedCount: 2 }, `the D-pad should move between answer inputs and A should toggle the next checkbox: ${JSON.stringify(state)}`);
  assert.deepEqual(state.afterBackOnQuestion, { side: 'front', selectedCount: 2 }, `Xbox B should not mutate answers while already on the question side: ${JSON.stringify(state)}`);
  assert.deepEqual(state.afterFlip, { side: 'back', graded: false, focusedFlip: true, frontInert: true, frontAriaHidden: 'true', backInert: false, backAriaHidden: 'false' }, `Xbox X should reveal only the answer face without submitting and move focus to a visible control: ${JSON.stringify(state)}`);
  assert.deepEqual(state.hiddenFaceInteraction, { hiddenFocusReached: false, selectionChanged: false }, `controller navigation must not reach or mutate the hidden question face: ${JSON.stringify(state)}`);
  assert.equal(state.returnedToQuestion, true, `Xbox B should return from the answer side to the question: ${JSON.stringify(state)}`);
  assert.equal(state.restoredOptionFocus, true, `returning to the question should restore the last focused answer: ${JSON.stringify(state)}`);
  assert.equal(state.frontInteractiveAfterReturn, true, `the question face should become interactive again after returning: ${JSON.stringify(state)}`);
  assert.equal(state.backHiddenAfterReturn, true, `the answer face should become inert after returning to the question: ${JSON.stringify(state)}`);
}

async function smokeLegacyOptionSelfGradeIsolation(client, url) {
  for (const legacyCorrect of [true, false]) {
    await navigate(client, url);
    await waitFor(client, `document.readyState === 'complete' && document.querySelector('.section-button.is-active')`, 'option card section to load before seeding legacy progress');
    await evaluate(client, `(() => {
      const sectionKey = document.querySelector('.section-button.is-active').dataset.sectionKey;
      const total = Number((document.querySelector('#card-count').textContent.match(/of\\s+(\\d+)/i) || [])[1]);
      localStorage.setItem(${JSON.stringify('flash-cards:security-plus:progress:v1')}, JSON.stringify({
        sections: {
          [sectionKey]: {
            seen: Array.from({ length: total }, (_, index) => String(index)),
            selfGrade: { '0': { correct: ${legacyCorrect}, attempts: 1 } },
            quiz: {}
          }
        }
      }));
      location.reload();
    })()`);
    await waitFor(client, `document.readyState === 'complete' && document.querySelectorAll('#card-front .option-input').length > 1`, 'option card to reload with legacy self-grade progress');

    const state = await evaluate(client, `(() => ({
      hasCheckAnswer: Boolean(document.querySelector('#card-front [data-quiz-submit]')),
      hasLegacyResult: Boolean(document.querySelector('#card-front .quiz-result')),
      inputsEnabled: Array.from(document.querySelectorAll('#card-front .option-input')).every((input) => !input.disabled),
      sectionScore: document.querySelector('.section-button.is-active .section-score')?.textContent.trim()
    }))()`);

    assert.deepEqual(state, { hasCheckAnswer: true, hasLegacyResult: false, inputsEnabled: true, sectionScore: 'Score 0%' }, `legacy self-grade ${legacyCorrect ? 'correct' : 'incorrect'} state must not own or score an option card: ${JSON.stringify(state)}`);
  }

  await evaluate(client, `localStorage.removeItem(${JSON.stringify('flash-cards:security-plus:progress:v1')})`);
}

async function smokeControllerFocusedButtonActivation(client, url) {
  await navigate(client, url);
  await waitFor(client, `document.readyState === 'complete' && document.querySelectorAll('#card-front .option-input:not(:disabled)').length >= 2`, 'quiz card to load for generic controller button activation checks');

  const state = await evaluate(client, `(() => {
    const nav = window.FlashCardsControllerNav;
    const incorrectIndex = Array.from(document.querySelectorAll('#card-back .option-list--answer li')).findIndex((item) => !item.classList.contains('is-correct'));
    const option = document.querySelectorAll('#card-front .option-input')[incorrectIndex];

    option.focus({ preventScroll: true });
    nav.input('a');
    const submit = document.querySelector('#card-front [data-quiz-submit]');
    submit.focus({ preventScroll: true });
    nav.input('a');
    const tryAgain = Array.from(document.querySelectorAll('#card-front .quiz-controls button')).find((button) => /try again/i.test(button.textContent));
    const before = document.querySelector('#card-count').textContent;
    tryAgain.focus({ preventScroll: true });
    nav.input('a');

    const result = {
      hasIncorrectOption: incorrectIndex >= 0,
      hadTryAgain: Boolean(tryAgain),
      reset: !Array.from(document.querySelectorAll('#card-front .quiz-controls button')).some((button) => /try again/i.test(button.textContent)),
      clearedSelections: document.querySelectorAll('#card-front .option-input:checked').length === 0,
      cardUnchanged: document.querySelector('#card-count').textContent === before
    };
    localStorage.removeItem('flash-cards:security-plus:progress:v1');
    return result;
  })()`);

  assert.equal(state.hasIncorrectOption, true, `the fixture must provide an incorrect answer for Try Again coverage: ${JSON.stringify(state)}`);
  assert.equal(state.hadTryAgain, true, `a graded incorrect answer should expose Try Again: ${JSON.stringify(state)}`);
  assert.equal(state.reset, true, `A should activate the focused Try Again button: ${JSON.stringify(state)}`);
  assert.equal(state.clearedSelections, true, `Try Again should clear the previous attempt so the learner can start fresh: ${JSON.stringify(state)}`);
  assert.equal(state.cardUnchanged, true, `A activation should operate the focused button without navigating away: ${JSON.stringify(state)}`);
}

async function smokeControllerCorrectOnlyGrading(client, url) {
  await navigate(client, url);
  await waitFor(client, `document.readyState === 'complete' && document.querySelectorAll('#card-front .option-input:not(:disabled)').length >= 2`, 'option card to load for correct-only grading checks');

  const state = await evaluate(client, `(() => {
    const nav = window.FlashCardsControllerNav;
    const correctIndexes = Array.from(document.querySelectorAll('#card-back .option-list--answer li')).flatMap((item, index) => item.classList.contains('is-correct') ? [index] : []);

    correctIndexes.forEach((index) => {
      const input = document.querySelectorAll('#card-front .option-input')[index];
      input.focus();
      nav.input('a');
    });

    const submit = document.querySelector('#card-front [data-quiz-submit]');
    submit.focus();
    nav.input('a');
    const result = document.querySelector('#card-front .quiz-result');
    const state = {
      correctIndexes,
      gradedCorrect: result?.classList.contains('is-correct')
    };
    localStorage.removeItem('flash-cards:security-plus:progress:v1');
    return state;
  })()`);

  assert.ok(state.correctIndexes.length > 0, `the fixture must contain at least one correct option: ${JSON.stringify(state)}`);
  assert.equal(state.gradedCorrect, true, `selecting every correct option with A and activating Check answer should earn full credit: ${JSON.stringify(state)}`);
}

async function smokeControllerAxisLatch(client, url) {
  await navigate(client, url);
  await waitFor(client, `document.readyState === 'complete' && document.querySelector('#card-front') && !document.querySelector('#card-front').textContent.includes('Loading')`, 'Network+ deck to load for controller-repeat checks');

  const state = await evaluate(client, `new Promise((resolve) => {
    const nav = window.FlashCardsControllerNav;
    const dpadFirst = nav.navigationInput('dpad:down', true);
    const stickFirst = nav.navigationInput('axis:1:positive', true);

    setTimeout(() => {
      const beforeInitialDelay = {
        dpad: nav.navigationInput('dpad:down', true),
        stick: nav.navigationInput('axis:1:positive', true)
      };

      setTimeout(() => {
        const afterInitialDelay = {
          dpad: nav.navigationInput('dpad:down', true),
          stick: nav.navigationInput('axis:1:positive', true)
        };

        setTimeout(() => {
          const afterRepeatInterval = {
            dpad: nav.navigationInput('dpad:down', true),
            stick: nav.navigationInput('axis:1:positive', true)
          };
          const released = {
            dpad: nav.navigationInput('dpad:down', false),
            stick: nav.navigationInput('axis:1:positive', false)
          };
          const pressedAgain = {
            dpad: nav.navigationInput('dpad:down', true),
            stick: nav.navigationInput('axis:1:positive', true)
          };
          resolve({ dpadFirst, stickFirst, beforeInitialDelay, afterInitialDelay, afterRepeatInterval, released, pressedAgain });
        }, 110);
      }, 80);
    }, 90);
  })`);

  assert.equal(state.dpadFirst, true, `D-pad focus navigation should happen immediately: ${JSON.stringify(state)}`);
  assert.equal(state.stickFirst, true, `thumbstick focus navigation should happen immediately: ${JSON.stringify(state)}`);
  assert.deepEqual(state.beforeInitialDelay, { dpad: false, stick: false }, `held controller input must wait briefly before repeating: ${JSON.stringify(state)}`);
  assert.deepEqual(state.afterInitialDelay, { dpad: true, stick: true }, `both D-pad and thumbstick should repeat after the initial hold delay: ${JSON.stringify(state)}`);
  assert.deepEqual(state.afterRepeatInterval, { dpad: true, stick: true }, `held controller navigation should repeat at the fast cadence: ${JSON.stringify(state)}`);
  assert.deepEqual(state.released, { dpad: false, stick: false }, `releasing a D-pad or thumbstick should clear its repeat state without moving focus: ${JSON.stringify(state)}`);
  assert.deepEqual(state.pressedAgain, { dpad: true, stick: true }, `controller navigation should be immediately responsive after release: ${JSON.stringify(state)}`);
}

async function smokeCardMetadataClearance(client, url) {
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 320,
    height: 568,
    deviceScaleFactor: 1,
    mobile: true,
    screenWidth: 320,
    screenHeight: 568
  });

  try {
    await navigate(client, url);
    await waitFor(client, `document.readyState === 'complete' && document.querySelector('#card-front .card-type-badge') && !document.querySelector('#card-front').textContent.includes('Loading')`, 'single-choice card metadata to load in a narrow mobile viewport');
    const state = await evaluate(client, `(() => {
      const face = document.querySelector('#card-front');
      const content = face.querySelector(':scope > .card-face-content');
      const meta = face.querySelector(':scope > .card-face-meta');
      const question = face.querySelector('.card-question');
      const metaBounds = meta.getBoundingClientRect();
      const questionBounds = question.getBoundingClientRect();
      return {
        metaBottom: metaBounds.bottom,
        questionTop: questionBounds.top,
        clearance: questionBounds.top - metaBounds.bottom,
        contentPaddingTop: parseFloat(getComputedStyle(content).paddingTop),
        metaHeight: metaBounds.height,
        scale: parseFloat(getComputedStyle(face).getPropertyValue('--card-content-scale'))
      };
    })()`);

    assert.ok(state.clearance >= 6, `question text must clear every metadata badge instead of overlapping it: ${JSON.stringify(state)}`);
    assert.ok(state.contentPaddingTop >= state.metaHeight + 18, `question content needs a reserved metadata zone even after dynamic fitting: ${JSON.stringify(state)}`);
  } finally {
    await client.send('Emulation.clearDeviceMetricsOverride');
  }
}

async function smokeCompletedSectionScore(client, url) {
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 1366,
    height: 768,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: 1366,
    screenHeight: 768
  });
  await navigate(client, url);
  await waitFor(
    client,
    `document.readyState === 'complete' && document.querySelector('.section-button.is-active') && document.querySelector('#card-count')`,
    'Network+ section progress to load for completed-score checks'
  );

  const fixture = await evaluate(client, `(() => {
    const section = document.querySelector('.section-button.is-active');
    const count = document.querySelector('#card-count').textContent;
    const total = Number((count.match(/of\\s+(\\d+)/i) || [])[1]);
    const correct = Math.round(total * 0.8);
    const seen = Array.from({ length: total }, (_, index) => String(index));
    const selfGrade = Object.fromEntries(seen.map((id, index) => [id, { correct: index < correct, attempts: 1 }]));
    localStorage.setItem(${JSON.stringify(progressStorageKey)}, JSON.stringify({
      sections: {
        [section.dataset.sectionKey]: { seen, selfGrade, quiz: {} }
      }
    }));
    return { key: section.dataset.sectionKey, total, correct, expectedPercent: Math.round((correct / total) * 100) };
  })()`);

  await navigate(client, url);
  const selector = `.section-button[data-section-key="${fixture.key}"]`;
  await waitFor(client, `document.querySelector(${JSON.stringify(selector)})?.classList.contains('is-complete')`, 'completed section to render in the TOC');

  const state = await evaluate(client, `(() => {
    const section = document.querySelector(${JSON.stringify(selector)});
    return {
      complete: section.classList.contains('is-complete'),
      progress: section.querySelector('small')?.textContent.replace(/\\s+/g, ' ').trim(),
      score: section.querySelector('.section-score')?.textContent.replace(/\\s+/g, ' ').trim(),
      scoreColor: section.querySelector('.section-score') ? getComputedStyle(section.querySelector('.section-score')).color : null,
      codeMetrics: (() => {
        const code = section.querySelector('strong');
        return {
          height: code.getBoundingClientRect().height,
          scrollHeight: code.scrollHeight,
          lineHeight: parseFloat(getComputedStyle(code).lineHeight),
          width: code.getBoundingClientRect().width,
          scrollWidth: code.scrollWidth,
          whiteSpace: getComputedStyle(code).whiteSpace
        };
      })()
    };
  })()`);

  assert.equal(state.complete, true, `fixture section should render as completed: ${JSON.stringify(state)}`);
  assert.equal(state.progress, `${fixture.total}/${fixture.total} studied Score ${fixture.expectedPercent}%`, `completed section should preserve studied progress and append its percentage score: ${JSON.stringify(state)}`);
  assert.equal(state.score, `Score ${fixture.expectedPercent}%`, `completed section should expose a dedicated percentage score: ${JSON.stringify(state)}`);
  assert.ok(state.scoreColor, `completed section score should receive visible theme styling: ${JSON.stringify(state)}`);
  assert.equal(state.codeMetrics.whiteSpace, 'nowrap', `completed section code should not wrap beside its title: ${JSON.stringify(state)}`);
  assert.ok(state.codeMetrics.width >= state.codeMetrics.scrollWidth - 1, `completed section code should have enough horizontal room for one line: ${JSON.stringify(state)}`);

  const screenshot = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const screenshotPath = path.join(os.tmpdir(), 'flash-cards-completed-section-score-qa.png');
  fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));
  console.log(`Completed section score visual QA screenshot: ${screenshotPath}`);

  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
    screenWidth: 390,
    screenHeight: 844
  });
  await navigate(client, url);
  await waitFor(client, `document.querySelector(${JSON.stringify(selector)})?.querySelector('.section-score')`, 'completed section score to render in the mobile deck sheet');
  await evaluate(client, `new Promise((resolve) => {
    document.querySelector('[data-mobile-deck-toggle]').click();
    setTimeout(resolve, 380);
  })`);

  const mobileState = await evaluate(client, `(() => {
    const section = document.querySelector(${JSON.stringify(selector)});
    const score = section.querySelector('.section-score');
    const sectionBounds = section.getBoundingClientRect();
    const scoreBounds = score.getBoundingClientRect();
    return {
      deckOpen: document.querySelector('.app-shell').classList.contains('is-mobile-deck-open'),
      sectionHeight: sectionBounds.height,
      scoreVisible: scoreBounds.left >= sectionBounds.left && scoreBounds.right <= sectionBounds.right && scoreBounds.top >= sectionBounds.top && scoreBounds.bottom <= sectionBounds.bottom,
      scoreText: score.textContent.trim()
    };
  })()`);

  assert.equal(mobileState.deckOpen, true, `mobile deck sheet should open for completed-section score QA: ${JSON.stringify(mobileState)}`);
  assert.ok(mobileState.sectionHeight >= 64, `completed mobile section should remain touch friendly: ${JSON.stringify(mobileState)}`);
  assert.equal(mobileState.scoreVisible, true, `completed section score should fit inside its mobile TOC row: ${JSON.stringify(mobileState)}`);
  assert.equal(mobileState.scoreText, `Score ${fixture.expectedPercent}%`, `mobile TOC should show the same completed percentage score: ${JSON.stringify(mobileState)}`);

  const mobileScreenshot = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const mobileScreenshotPath = path.join(os.tmpdir(), 'flash-cards-completed-section-score-iphone-qa.png');
  fs.writeFileSync(mobileScreenshotPath, Buffer.from(mobileScreenshot.data, 'base64'));
  console.log(`Completed section mobile score visual QA screenshot: ${mobileScreenshotPath}`);

  await evaluate(client, `localStorage.removeItem(${JSON.stringify(progressStorageKey)})`);
  await client.send('Emulation.clearDeviceMetricsOverride');
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
      contentOverflowStyles: [front, back].map((face) => getComputedStyle(face.querySelector(':scope > .card-face-content')).overflowY),
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
  assert.deepEqual(state.initial.contentOverflowStyles, ['hidden', 'hidden'], 'flashcard content must fit within its faces instead of using internal scrolling');
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
      cardCountChips: Array.from(document.querySelectorAll('[data-card-count]')).map((count) => ({
        isChip: count.classList.contains('card-face-chip'),
        inFaceMeta: Boolean(count.closest('.card-face-meta'))
      })),
      gradePromptCount: document.querySelectorAll('[data-study-tools-label]').length,
      studyToolsCount: document.querySelectorAll('.study-tools').length
    };
    flip.click();
    const back = {
      side: app.dataset.cardSide,
      flipLabel: flip.querySelector('span:last-child')?.textContent.trim(),
      flipAria: flip.getAttribute('aria-label'),
      gradePromptCount: document.querySelectorAll('[data-study-tools-label]').length
    };
    return { front, back };
  })()`);

  assert.equal(state.front.side, 'front', 'study shell should identify the question side');
  assert.equal(state.front.flipLabel, 'Show answer', 'front-side primary action should say Show answer');
  assert.equal(state.front.interactionHints, 0, 'redundant card interaction hints should not render');
  assert.equal(state.front.frontLabel, 'Question', 'front face should carry a clear Question label');
  assert.equal(state.front.backLabel, 'Answer', 'back face should carry a clear Answer label');
  assert.deepEqual(state.front.cardCountChips, [{ isChip: true, inFaceMeta: true }, { isChip: true, inFaceMeta: true }], 'card position should render as a card-face chip in both card faces');
  assert.equal(state.front.gradePromptCount, 0, 'recall-rating prompt should not render');
  assert.equal(state.front.studyToolsCount, 0, 'the study tools section should not render');
  assert.equal(state.back.side, 'back', 'study shell should identify the answer side after flipping');
  assert.equal(state.back.flipLabel, 'Show question', 'back-side primary action should say Show question');

  assert.equal(state.back.gradePromptCount, 0, 'recall-rating prompt should stay removed after revealing the answer');
}

async function smokeReadableTypography(client, url) {
  await navigate(client, url);
  await waitFor(client, `document.readyState === 'complete' && document.querySelector('.quiz-hint')`, 'quiz typography fixture to load');

  const typography = await evaluate(client, `(() => {
    const body = getComputedStyle(document.body);
    const hint = getComputedStyle(document.querySelector('.quiz-hint'));
    const question = getComputedStyle(document.querySelector('.card-question'));
    const hasCheckAnswer = Array.from(document.querySelectorAll('.quiz-controls button')).some((button) => /check answer/i.test(button.textContent));
    return {
      bodyFamily: body.fontFamily,
      hintFamily: hint.fontFamily,
      hintSize: parseFloat(hint.fontSize),
      hintLineHeight: parseFloat(hint.lineHeight),
      hintLetterSpacing: parseFloat(hint.letterSpacing) || 0,
      questionLetterSpacing: parseFloat(question.letterSpacing) || 0,
      hasCheckAnswer
    };
  })()`);

  assert.match(typography.bodyFamily, /system-ui/i, `body should use the native readable system font stack: ${JSON.stringify(typography)}`);
  assert.equal(typography.hintFamily, typography.bodyFamily, 'quiz hint should use the same readable family as body text');
  assert.ok(typography.hintSize >= 14, `quiz hint should never shrink below 14px: ${JSON.stringify(typography)}`);
  assert.ok(typography.hintLineHeight / typography.hintSize >= 1.3, `quiz hint should have comfortable line spacing: ${JSON.stringify(typography)}`);
  assert.ok(typography.hintLetterSpacing >= 0, `quiz hint letters should not be compressed: ${JSON.stringify(typography)}`);
  assert.ok(typography.questionLetterSpacing >= -0.5, `question text should avoid aggressive tracking: ${JSON.stringify(typography)}`);
  assert.equal(typography.hasCheckAnswer, true, `option cards should provide a plainly labeled Check answer control: ${JSON.stringify(typography)}`);
}

async function smokeAnswerSideOptions(client, url) {
  await navigate(client, url);
  await waitFor(
    client,
    `document.readyState === 'complete' && document.querySelectorAll('#card-front .option-list .option-input').length > 1`,
    'multiple-choice card options to load'
  );

  const state = await evaluate(client, `(() => {
    const frontFace = document.querySelector('#card-front');
    const frontMeta = frontFace.querySelector(':scope > .card-face-meta');
    const frontLabel = frontMeta.querySelector('.card-side-label');
    const frontBadge = frontMeta.querySelector('.card-type-badge');
    const front = Array.from(document.querySelectorAll('#card-front .option-copy')).map((copy) => copy.textContent.trim());
    const backItems = Array.from(document.querySelectorAll('#card-back .option-list li'));
    return {
      front,
      back: backItems.map((item) => item.textContent.trim()),
      correct: backItems.filter((item) => item.classList.contains('is-correct')).length,
      muted: backItems.filter((item) => item.classList.contains('is-muted')).length,
      interactiveBackOptions: backItems.filter((item) => item.querySelector('button, input')).length,
      answerBadges: document.querySelectorAll('#card-back .card-type-badge').length,
      frontLabel: frontLabel?.textContent.trim(),
      frontBadge: frontBadge?.textContent.trim(),
      badgeUsesSharedMeta: frontBadge?.parentElement === frontMeta,
      badgeToRightOfLabel: Boolean(frontLabel && frontBadge && frontBadge.getBoundingClientRect().left >= frontLabel.getBoundingClientRect().right),
      frontScale: parseFloat(getComputedStyle(document.querySelector('#card-front')).getPropertyValue('--card-content-scale')),
      backScale: parseFloat(getComputedStyle(document.querySelector('#card-back')).getPropertyValue('--card-content-scale')),
      frontFontSize: parseFloat(getComputedStyle(document.querySelector('#card-front .option-copy')).fontSize),
      backFontSize: parseFloat(getComputedStyle(document.querySelector('#card-back .option-answer')).fontSize),
      frontHeights: Array.from(document.querySelectorAll('#card-front .option-list li')).map((item) => Math.round(item.getBoundingClientRect().height * 10) / 10),
      backHeights: backItems.map((item) => Math.round(item.getBoundingClientRect().height * 10) / 10)
    };
  })()`);

  assert.deepEqual(state.back, state.front, 'answer side should repeat the same options in the same order');
  assert.ok(state.correct > 0, 'answer side should identify at least one correct option');
  assert.ok(state.muted > 0, 'answer side should mute incorrect options');
  assert.equal(state.interactiveBackOptions, 0, 'answer-side options should be presentational, not disabled fake controls');
  assert.equal(state.answerBadges, 0, 'answer-side options should not render a redundant card-type badge');
  assert.equal(state.frontLabel, 'Question', 'the question-side label should render as a reusable card chip');
  assert.equal(state.frontBadge, 'Multiple choice', 'multiple-choice cards should render a type badge');
  assert.equal(state.badgeUsesSharedMeta, true, 'the type badge should share the card metadata container with the side label');
  assert.equal(state.badgeToRightOfLabel, true, 'the type badge should sit directly to the right of the Question label');
  assert.equal(state.backScale, state.frontScale, `front and back option faces should share one content scale: ${JSON.stringify(state)}`);
  assert.ok(Math.abs(state.backFontSize - state.frontFontSize) <= 0.1, `front and back option text should be the same size: ${JSON.stringify(state)}`);
  assert.deepEqual(state.backHeights, state.frontHeights, `front and back option rows should have matching heights: ${JSON.stringify(state)}`);
}

async function smokeScaledFourKAnswerFit(client, url) {
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 1536,
    height: 864,
    deviceScaleFactor: 2.5,
    mobile: false,
    screenWidth: 3840,
    screenHeight: 2160
  });

  try {
    await navigate(client, url);
    await waitFor(client, `document.readyState === 'complete' && document.querySelectorAll('#card-back .option-list--answer li').length > 2`, 'Security+ answer options to load on a scaled 4K display');
    await evaluate(client, `document.querySelector('#flip-card').click()`);
    await waitFor(client, `document.querySelector('#card').classList.contains('is-flipped')`, 'Security+ card to flip to its answer side on a scaled 4K display');
    await evaluate(client, `new Promise((resolve) => setTimeout(resolve, 760))`);

    const state = await evaluate(client, `(() => {
      const content = document.querySelector('#card-back > .card-face-content');
      const contentBounds = content.getBoundingClientRect();
      const options = Array.from(content.querySelectorAll('.option-list--answer li'));
      const quizHint = document.querySelector('#card-front .quiz-hint');
      return {
        displayDensity: document.documentElement.dataset.displayDensity,
        scale: parseFloat(getComputedStyle(document.querySelector('#card-back')).getPropertyValue('--card-content-scale')),
        questionFontSize: parseFloat(getComputedStyle(document.querySelector('#card-front .card-question')).fontSize),
        answerQuestionFontSize: parseFloat(getComputedStyle(document.querySelector('#card-back .card-question')).fontSize),
        optionFontSize: parseFloat(getComputedStyle(document.querySelector('#card-back .option-answer')).fontSize),
        quizHintSingleLine: !quizHint || quizHint.scrollHeight <= quizHint.clientHeight + 1,
        scrollHeight: content.scrollHeight,
        clientHeight: content.clientHeight,
        overflowY: getComputedStyle(content).overflowY,
        optionCount: options.length,
        allOptionsVisible: options.every((option) => {
          const bounds = option.getBoundingClientRect();
          return bounds.top >= contentBounds.top && bounds.bottom <= contentBounds.bottom;
        })
      };
    })()`);

    assert.ok(state.scrollHeight <= state.clientHeight + 1, `answer content must fit its flashcard without internal scrolling on a scaled 4K display: ${JSON.stringify(state)}`);
    assert.equal(state.displayDensity, 'large', `the physical 4K display profile should use the large-display card layout: ${JSON.stringify(state)}`);
    assert.ok(state.scale >= 0.55, `4K card content should remain readable instead of shrinking to tiny text: ${JSON.stringify(state)}`);
    assert.ok(state.questionFontSize >= 22, `4K question text should use the available card space: ${JSON.stringify(state)}`);
    assert.ok(state.optionFontSize >= 9, `4K answer text should use the available card space: ${JSON.stringify(state)}`);
    assert.equal(state.quizHintSingleLine, true, `the quiz status line must not split its final word on a 4K display: ${JSON.stringify(state)}`);
    assert.equal(state.overflowY, 'hidden', `flashcard answer content must not be internally scrollable: ${JSON.stringify(state)}`);
    assert.equal(state.allOptionsVisible, true, `every answer option must be visible inside the flashcard at once: ${JSON.stringify(state)}`);

    const screenshot = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const screenshotPath = path.join(os.tmpdir(), 'flash-cards-security-scaled-4k-qa.png');
    fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));
    console.log(`Scaled 4K Security+ answer-card QA screenshot: ${screenshotPath}`);
  } finally {
    await evaluate(client, `localStorage.removeItem('flash-cards:security-plus:progress:v1')`);
    await client.send('Emulation.clearDeviceMetricsOverride');
  }
}

async function smokeStudyChromeDensity(client, url) {
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 1536,
    height: 864,
    deviceScaleFactor: 2.5,
    mobile: false,
    screenWidth: 3840,
    screenHeight: 2160
  });

  try {
    await evaluate(client, `localStorage.removeItem('flash-cards:security-plus:progress:v1')`);
    await navigate(client, url);
    await waitFor(client, `document.readyState === 'complete' && document.querySelector('.quiz-hint, .quiz-result')`, 'Security+ option-card status to load on a scaled 4K display');
    await evaluate(client, `(() => { const flip = document.querySelector('#flip-card'); if (document.querySelector('#card').classList.contains('is-flipped')) flip.click(); })()`);
    await waitFor(client, `!document.querySelector('#card').classList.contains('is-flipped')`, 'Security+ card to return to its question side for visual QA');
    await evaluate(client, `new Promise((resolve) => setTimeout(resolve, 760))`);
    const state = await evaluate(client, `(() => {
      const quizStatus = document.querySelector('.quiz-hint, .quiz-result');
      return {
        studyFocusBadge: Boolean(document.querySelector('[data-panel-focus-badge="study"]')),
        quizStatusText: quizStatus.textContent.trim(),
        quizStatusSingleLine: quizStatus.scrollHeight <= quizStatus.clientHeight + 1,
        checkAnswerPresent: Array.from(document.querySelectorAll('.quiz-controls button')).some((button) => /check answer/i.test(button.textContent))
      };
    })()`);

    assert.equal(state.studyFocusBadge, false, `the study controller-focus badge wastes flashcard space: ${JSON.stringify(state)}`);
    assert.equal(state.quizStatusSingleLine, true, `the option-card status must remain one readable line on 4K displays: ${JSON.stringify(state)}`);
    assert.equal(state.checkAnswerPresent, true, `option cards should retain the explicit Check answer action on high-density displays: ${JSON.stringify(state)}`);

    const screenshot = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const screenshotPath = path.join(os.tmpdir(), 'flash-cards-security-quiz-scaled-4k-qa.png');
    fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));
    console.log(`Scaled 4K Security+ quiz-card QA screenshot: ${screenshotPath}`);
  } finally {
    await client.send('Emulation.clearDeviceMetricsOverride');
  }
}

async function smokeFourKQuizResultLabel(client, url) {
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 1536,
    height: 864,
    deviceScaleFactor: 2.5,
    mobile: false,
    screenWidth: 3840,
    screenHeight: 2160
  });

  try {
    await navigate(client, url);
    await waitFor(client, `document.readyState === 'complete' && document.querySelector('.quiz-hint')`, 'single-choice option-marking guidance to load for 4K result-label checks');
    await evaluate(client, `(() => {
      const options = Array.from(document.querySelectorAll('#card-front .option-input'));
      options[0].click();
      document.querySelector('#card-front [data-quiz-submit]').click();
    })()`);
    await waitFor(client, `document.querySelector('.quiz-result')`, 'quiz result label to render on a scaled 4K display');

    const state = await evaluate(client, `(() => {
      const result = document.querySelector('.quiz-result');
      const text = result.querySelector('[data-pretext-text]');
      const bounds = result.getBoundingClientRect();
      return {
        text: result.textContent.trim(),
        whiteSpace: getComputedStyle(result).whiteSpace,
        lineCount: Number(text?.dataset.pretextLineCount || 1),
        singleLine: result.scrollHeight <= result.clientHeight + 1,
        width: Math.round(bounds.width),
        height: Math.round(bounds.height)
      };
    })()`);

    assert.equal(state.whiteSpace, 'nowrap', `Correct/Incorrect result labels must reserve one line: ${JSON.stringify(state)}`);
    assert.equal(state.lineCount, 1, `Correct/Incorrect result labels must not be split into multiple pretext lines: ${JSON.stringify(state)}`);
    assert.equal(state.singleLine, true, `Correct/Incorrect result labels must remain one line on a 4K display: ${JSON.stringify(state)}`);
  } finally {
    await evaluate(client, `localStorage.removeItem('flash-cards:security-plus:progress:v1')`);
    await client.send('Emulation.clearDeviceMetricsOverride');
  }
}

async function smokeSecuritySourceSection(client, url) {
  await navigate(client, url);
  await waitFor(
    client,
    `document.readyState === 'complete' && document.querySelector('#section-label')?.textContent.trim().startsWith('Section Practice Test 1:') && document.querySelector('#card-front .card-question')?.textContent.includes('technical security controls')`,
    'the first scraped Security+ practice-test section to render',
  );

  const state = await evaluate(client, `(() => {
    const section = Array.from(document.querySelectorAll('.section-button')).find((button) => button.textContent.trim().startsWith('Practice Test 1'));
    return {
      sectionLabel: document.querySelector('#section-label')?.textContent.trim(),
      question: document.querySelector('#card-front .card-question')?.textContent.trim(),
      sectionDisabled: section?.disabled,
    };
  })()`);

  assert.equal(state.sectionLabel.startsWith('Section Practice Test 1:'), true, `the first scraped Security+ section must be selected: ${JSON.stringify(state)}`);
  assert.equal(state.question.includes('technical security controls'), true, `the first scraped Security+ question must render: ${JSON.stringify(state)}`);
  assert.equal(state.sectionDisabled, false, `a scraped Security+ practice test must be selectable: ${JSON.stringify(state)}`);
}

async function smokeSingleChoiceTypeBadge(client, url) {
  await navigate(client, url);
  await waitFor(
    client,
    `document.readyState === 'complete' && document.querySelector('#card-front .card-type-badge')?.textContent.trim() === 'Single choice'`,
    'single-choice card type badge to render'
  );

  const state = await evaluate(client, `(() => {
    const inputs = Array.from(document.querySelectorAll('#card-front .option-input'));
    inputs[0].click();
    inputs[1].click();
    return {
      badge: document.querySelector('#card-front .card-type-badge')?.textContent.trim(),
      types: inputs.map((input) => input.type),
      names: inputs.map((input) => input.name),
      selected: inputs.filter((input) => input.checked).map((input) => input.value)
    };
  })()`);

  assert.equal(state.badge, 'Single choice', `one-answer cards should use the single-choice schema label: ${JSON.stringify(state)}`);
  assert.deepEqual(new Set(state.types), new Set(['radio']), `single-choice cards must use native radio buttons: ${JSON.stringify(state)}`);
  assert.equal(new Set(state.names).size, 1, `single-choice radio buttons must share one group name: ${JSON.stringify(state)}`);
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
    const nav = window.FlashCardsControllerNav;
    const inputs = Array.from(document.querySelectorAll('#card-front .option-input'));
    inputs[0].focus({ preventScroll: true });
    nav.input('a');
    nav.input('down');
    nav.input('a');
    return {
      badge: document.querySelector('#card-front .card-type-badge')?.textContent.trim(),
      options: inputs.map((input) => input.value),
      types: inputs.map((input) => input.type),
      names: inputs.map((input) => input.name),
      selected: inputs.filter((input) => input.checked).map((input) => input.value),
      focusedValue: document.activeElement?.value,
      sharedMeta: document.querySelector('#card-front .card-type-badge')?.parentElement === document.querySelector('#card-front .card-face-meta')
    };
  })()`);

  assert.equal(state.badge, 'True or False', `True/False options should not be mislabeled as multiple choice: ${JSON.stringify(state)}`);
  assert.deepEqual(state.options, ['True', 'False'], 'the true-or-false fixture should present the canonical two choices');
  assert.deepEqual(new Set(state.types), new Set(['radio']), `True/False answers must use native radio buttons: ${JSON.stringify(state)}`);
  assert.equal(new Set(state.names).size, 1, `True/False radio buttons must form one exclusive group: ${JSON.stringify(state)}`);
  assert.deepEqual(state.selected, ['False'], `Xbox A should select False and replace the previous True selection: ${JSON.stringify(state)}`);
  assert.equal(state.focusedValue, 'False', `controller focus should remain on the selected False radio button: ${JSON.stringify(state)}`);
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
    const fit = await evaluate(client, `(() => {
      const content = document.querySelector('#card-back > .card-face-content');
      const bounds = content.getBoundingClientRect();
      const options = Array.from(content.querySelectorAll('.option-list--answer li'));
      return {
        scrollHeight: content.scrollHeight,
        clientHeight: content.clientHeight,
        overflowY: getComputedStyle(content).overflowY,
        allOptionsVisible: options.every((option) => {
          const optionBounds = option.getBoundingClientRect();
          return optionBounds.top >= bounds.top && optionBounds.bottom <= bounds.bottom;
        })
      };
    })()`);
    assert.ok(fit.scrollHeight <= fit.clientHeight + 1, `mobile answer content must fit its flashcard without internal scrolling: ${JSON.stringify(fit)}`);
    assert.equal(fit.overflowY, 'hidden', `mobile flashcard answer content must not be internally scrollable: ${JSON.stringify(fit)}`);
    assert.equal(fit.allOptionsVisible, true, `every mobile answer option must be visible inside the flashcard at once: ${JSON.stringify(fit)}`);
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

async function captureLaptopQa(client, url) {
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 1366,
    height: 768,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: 1366,
    screenHeight: 768
  });
  try {
    await navigate(client, url);
    await waitFor(client, `document.readyState === 'complete' && document.querySelector('#card-front') && !document.querySelector('#card-front').textContent.includes('Loading')`, '1366x768 laptop study layout to load');
    const screenshot = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const screenshotPath = path.join(os.tmpdir(), 'flash-cards-1366x768-qa.png');
    fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));
    const layout = await evaluate(client, `(() => {
      const panel = document.querySelector('.study-panel');
      const card = document.querySelector('#card');
      return {
        cardHeight: Math.round(card.getBoundingClientRect().height),
        panelCanScroll: panel.scrollHeight > panel.clientHeight,
        panelOverflowY: getComputedStyle(panel).overflowY
      };
    })()`);
    assert.ok(layout.cardHeight >= 360, `1366x768 should preserve a roomy 360px study card instead of compressing it: ${JSON.stringify(layout)}`);
    assert.equal(layout.panelOverflowY, 'auto', `1366x768 overflow must remain accessible through the study panel scrollbar: ${JSON.stringify(layout)}`);
    console.log(`1366x768 laptop visual QA screenshot: ${screenshotPath}`);
  } finally {
    await client.send('Emulation.clearDeviceMetricsOverride');
  }
}

async function smokeStudyPanelScrollAccessibility(client, url) {
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 700,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: 1440,
    screenHeight: 700
  });

  try {
    await navigate(client, url);
    await waitFor(client, `document.readyState === 'complete' && document.querySelector('#card-front') && !document.querySelector('#card-front').textContent.includes('Loading')`, 'short desktop study layout to load');

    const state = await evaluate(client, `(() => {
      const panel = document.querySelector('.study-panel');
      const finalElement = document.querySelector('.tts-tools');
      const initialScrollTop = panel.scrollTop;
      panel.scrollTop = panel.scrollHeight;
      const panelBounds = panel.getBoundingClientRect();
      const finalBounds = finalElement.getBoundingClientRect();
      return {
        overflowY: getComputedStyle(panel).overflowY,
        canScroll: panel.scrollHeight > panel.clientHeight,
        initialScrollTop,
        finalScrollTop: panel.scrollTop,
        finalElementVisible: finalBounds.top >= panelBounds.top && finalBounds.bottom <= panelBounds.bottom
      };
    })()`);

    assert.equal(state.overflowY, 'auto', `study panel must expose vertical overflow through its own scrollbar: ${JSON.stringify(state)}`);
    assert.equal(state.canScroll, true, `short study layouts should preserve all controls in a scrollable panel: ${JSON.stringify(state)}`);
    assert.ok(state.finalScrollTop > state.initialScrollTop, `study panel should scroll to its final element: ${JSON.stringify(state)}`);
    assert.equal(state.finalElementVisible, true, `the final study-panel element must be visible after scrolling: ${JSON.stringify(state)}`);

    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 700,
      deviceScaleFactor: 2,
      mobile: true,
      screenWidth: 390,
      screenHeight: 700
    });
    await navigate(client, url);
    await waitFor(client, `document.readyState === 'complete' && document.querySelector('#card-front') && !document.querySelector('#card-front').textContent.includes('Loading')`, 'short mobile study layout to load');

    const mobileState = await evaluate(client, `(() => {
      const panel = document.querySelector('.study-panel');
      const finalElement = document.querySelector('.tts-tools');
      panel.scrollTop = panel.scrollHeight;
      const panelBounds = panel.getBoundingClientRect();
      const finalBounds = finalElement.getBoundingClientRect();
      return {
        overflowY: getComputedStyle(panel).overflowY,
        canScroll: panel.scrollHeight > panel.clientHeight,
        scrollTop: panel.scrollTop,
        finalElementVisible: finalBounds.top >= panelBounds.top && finalBounds.bottom <= panelBounds.bottom
      };
    })()`);

    assert.equal(mobileState.overflowY, 'auto', `mobile study panel must expose vertical overflow through its own scrollbar: ${JSON.stringify(mobileState)}`);
    assert.equal(mobileState.canScroll, true, `short mobile study layouts should preserve all controls in a scrollable panel: ${JSON.stringify(mobileState)}`);
    assert.ok(mobileState.scrollTop > 0, `mobile study panel should scroll to its final element: ${JSON.stringify(mobileState)}`);
    assert.equal(mobileState.finalElementVisible, true, `the final mobile study-panel element must be visible after scrolling: ${JSON.stringify(mobileState)}`);
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
        studyTools: document.querySelectorAll('.study-tools').length,
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
    assert.equal(mobile.studyTools, 0, 'the removed study tools section must not render on mobile');
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
  try {
    await waitForDevTools({
      port,
      abortError: () => chrome.exitCode !== null
        ? new Error(`Chrome exited early with code ${chrome.exitCode}: ${chrome.stderrText()}`)
        : null
    });
  } catch (error) {
    if (chrome.exitCode !== null) {
      throw error;
    }
    throw new Error(`${error.message}\nChrome stderr: ${chrome.stderrText()}`);
  }
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
class CdpClient {
  constructor(webSocketUrl) {
    this.nextId = 1;
    this.pending = new Map();
    const WebSocketConstructor = getWebSocketConstructor();
    this.socket = new WebSocketConstructor(webSocketUrl);
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
