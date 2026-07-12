(function () {
  var dialog = document.querySelector('[data-deck-editor-dialog]');
  if (!dialog) return;

  var openers = document.querySelectorAll('[data-deck-editor-open]');
  var closeButton = document.querySelector('[data-deck-editor-close]');
  var nameInput = document.querySelector('[data-editor-name]');
  var idInput = document.querySelector('[data-editor-id]');
  var sourceInput = document.querySelector('[data-editor-source]');
  var output = document.querySelector('[data-editor-output]');
  var previewButton = document.querySelector('[data-editor-preview]');
  var exportButton = document.querySelector('[data-editor-export]');
  var undoButton = document.querySelector('[data-editor-undo]');
  var redoButton = document.querySelector('[data-editor-redo]');
  var previousFocus = null;
  var undoStack = [];
  var redoStack = [];
  var storageKey = 'flashcards.deckEditorDraft.v1';

  openers.forEach(function (button) { button.addEventListener('click', openEditor); });
  closeButton && closeButton.addEventListener('click', closeEditor);
  previewButton && previewButton.addEventListener('click', previewDeck);
  exportButton && exportButton.addEventListener('click', exportDeck);
  undoButton && undoButton.addEventListener('click', undo);
  redoButton && redoButton.addEventListener('click', redo);
  [nameInput, idInput, sourceInput].forEach(function (el) {
    if (!el) return;
    el.addEventListener('input', function () {
      pushUndo();
      saveDraft();
      if (el === nameInput && !idInput.value.trim()) idInput.value = slugify(nameInput.value);
    });
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !dialog.hidden) closeEditor();
    if (!dialog.hidden && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      exportDeck();
    }
  });
  loadDraft();

  function openEditor() {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.hidden = false;
    nameInput.focus();
  }

  function closeEditor() {
    dialog.hidden = true;
    if (previousFocus && document.contains(previousFocus)) previousFocus.focus();
  }

  function currentState() {
    return { name: nameInput.value, id: idInput.value, source: sourceInput.value };
  }

  function applyState(state) {
    nameInput.value = state.name || '';
    idInput.value = state.id || '';
    sourceInput.value = state.source || '';
  }

  function pushUndo() {
    var state = JSON.stringify(currentState());
    if (undoStack[undoStack.length - 1] !== state) {
      undoStack.push(state);
      if (undoStack.length > 50) undoStack.shift();
      redoStack = [];
    }
  }

  function undo() {
    if (undoStack.length < 2) return;
    redoStack.push(undoStack.pop());
    applyState(JSON.parse(undoStack[undoStack.length - 1]));
    saveDraft();
  }

  function redo() {
    if (!redoStack.length) return;
    var state = redoStack.pop();
    undoStack.push(state);
    applyState(JSON.parse(state));
    saveDraft();
  }

  function saveDraft() {
    try { localStorage.setItem(storageKey, JSON.stringify(currentState())); } catch (error) {}
  }

  function loadDraft() {
    try {
      var raw = localStorage.getItem(storageKey);
      if (raw) applyState(JSON.parse(raw));
    } catch (error) {}
    pushUndo();
  }

  function previewDeck() {
    try {
      var deck = buildDeck();
      output.textContent = JSON.stringify(deck, null, 2);
    } catch (error) {
      output.textContent = 'Error: ' + error.message;
    }
  }

  function exportDeck() {
    try {
      var deck = buildDeck();
      var json = JSON.stringify(deck, null, 2) + '\n';
      output.textContent = json;
      var blob = new Blob([json], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = (deck.id || 'custom-deck') + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    } catch (error) {
      output.textContent = 'Error: ' + error.message;
    }
  }

  function buildDeck() {
    var name = nameInput.value.trim();
    var id = slugify(idInput.value.trim() || name);
    if (!name) throw new Error('Deck name is required.');
    if (!id) throw new Error('Deck id is required.');
    var cards = parseCards(sourceInput.value);
    if (!cards.length) throw new Error('Add at least one card.');
    return { id: id, name: name, description: 'Custom deck exported from Flash Cards.', cards: cards };
  }

  function parseCards(source) {
    var trimmed = source.trim();
    if (!trimmed) return [];
    if (/^\s*[\[{]/.test(trimmed)) {
      var data = JSON.parse(trimmed);
      if (Array.isArray(data)) return data.map(normalizeExportCard);
      if (Array.isArray(data.cards)) return data.cards.map(normalizeExportCard);
      return Object.keys(data).flatMap(function (key) {
        return Array.isArray(data[key]) ? data[key].map(normalizeQaCard) : [];
      });
    }
    return trimmed.split(/\n---+\n/g).map(function (block) {
      var q = matchField(block, 'Q') || matchField(block, 'Front') || '';
      var a = matchField(block, 'A') || matchField(block, 'Back') || '';
      return normalizeExportCard({ front: { text: markdownLite(q) }, back: { text: markdownLite(a) } });
    }).filter(function (card) { return card.front.text && card.back.text; });
  }

  function matchField(block, field) {
    var re = new RegExp('^' + field + ':\\s*([\\s\\S]*?)(?=\\n[A-Za-z]+:|$)', 'im');
    var match = block.match(re);
    return match ? match[1].trim() : '';
  }

  function normalizeQaCard(card) {
    return normalizeExportCard({ front: { text: card.Q }, back: { text: Array.isArray(card.A) ? card.A.join('\n') : card.A } });
  }

  function normalizeExportCard(card) {
    var front = card.front || {};
    var back = card.back || {};
    var q = String(front.text || card.Q || '').trim();
    var a = String(back.text || (Array.isArray(card.A) ? card.A.join('\n') : card.A || '')).trim();
    if (!q || !a) throw new Error('Every card needs front and back text.');
    return { front: { text: q }, back: { text: a } };
  }

  function markdownLite(value) {
    return String(value).trim();
  }

  function slugify(value) {
    return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
})();
