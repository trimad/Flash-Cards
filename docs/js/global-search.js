(function () {
  var dialog = document.querySelector('[data-global-search-dialog]');
  var openers = document.querySelectorAll('[data-global-search-open]');
  var closeButton = document.querySelector('[data-global-search-close]');
  var input = document.querySelector('[data-global-search-input]');
  var results = document.querySelector('[data-global-search-results]');
  var status = document.querySelector('[data-global-search-status]');
  var previousFocus = null;
  var indexPromise = null;
  var index = [];

  if (!dialog || !input || !results) return;

  openers.forEach(function (button) {
    button.addEventListener('click', openSearch);
  });
  closeButton && closeButton.addEventListener('click', closeSearch);
  input.addEventListener('input', debounce(renderSearch, 60));
  document.addEventListener('keydown', function (event) {
    var key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && key === 'k') {
      event.preventDefault();
      openSearch();
      return;
    }
    if (event.key === 'Escape' && !dialog.hidden) closeSearch();
  });

  async function openSearch() {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.hidden = false;
    input.focus();
    status.textContent = 'Loading searchable deck index...';
    try {
      index = await loadIndex();
      status.textContent = index.length + ' cards indexed. Type to search, then press Enter on a result.';
      renderSearch();
    } catch (error) {
      status.textContent = 'Search index failed to load. Check your connection and try again.';
      console.error(error);
    }
  }

  function closeSearch() {
    dialog.hidden = true;
    if (previousFocus && document.contains(previousFocus)) previousFocus.focus();
  }

  function normalizeBase() {
    var config = window.FlashCardsConfig || {};
    var fromScript = document.querySelector('script[src$="global-search.js"]');
    if (config.baseURL) return config.baseURL.endsWith('/') ? config.baseURL : config.baseURL + '/';
    if (fromScript) return fromScript.src.replace(/js\/global-search\.js(?:\?.*)?$/, '');
    return '/';
  }

  async function loadIndex() {
    if (indexPromise) return indexPromise;
    indexPromise = buildIndex();
    return indexPromise;
  }

  async function buildIndex() {
    var baseURL = normalizeBase();
    var jsonCache = {};
    async function fetchJson(path) {
      var url = baseURL + path.replace(/^\/+/, '');
      if (!jsonCache[url]) {
        jsonCache[url] = fetch(url).then(function (response) {
          if (!response.ok) throw new Error('Unable to load ' + path + ': ' + response.status);
          return response.json();
        });
      }
      return jsonCache[url];
    }
    function deckPath(test, chapter) {
      if (chapter.file.indexOf('/') >= 0) return chapter.file;
      if (test.assetPath) return test.assetPath.replace(/\/+$/, '') + '/' + chapter.file;
      return chapter.file;
    }
    function cardsFor(deck, section) {
      if (Array.isArray(deck[section.name])) return deck[section.name].map(normalizeCard);
      if (Array.isArray(deck.cards)) return deck.cards.map(normalizeImportedCard);
      return [];
    }
    function normalizeCard(card) {
      return {
        q: String(card && card.Q || ''),
        a: Array.isArray(card && card.A) ? card.A.map(String) : [String(card && card.A || '')],
        options: Array.isArray(card && card.O) ? card.O.map(String) : []
      };
    }
    function normalizeImportedCard(card) {
      return {
        q: String(card && card.front && card.front.text || ''),
        a: [String(card && card.back && card.back.text || '')],
        options: []
      };
    }

    var menu = await fetchJson('assets/menu.json');
    var pages = Array.prototype.slice.call(document.querySelectorAll('.test-nav a')).map(function (a) {
      return { title: a.textContent.trim(), href: a.href };
    });
    var pageByTitle = {};
    pages.forEach(function (page) { pageByTitle[page.title] = page.href; });

    var rows = [];
    await Promise.all(menu.map(async function (test) {
      await Promise.all((test.chapter || []).map(async function (chapter) {
        if (!chapter.file) return;
        var deck = await fetchJson('assets/' + deckPath(test, chapter));
        (chapter.section || []).forEach(function (section) {
          cardsFor(deck, section).forEach(function (card, cardIndex) {
            var haystack = [test.name, chapter.name, section.name, section.label || '', card.q, card.a.join(' '), card.options.join(' ')].join(' ');
            rows.push({
              deck: test.name,
              chapter: chapter.name,
              section: section.name,
              label: section.label || '',
              card: cardIndex + 1,
              q: card.q,
              a: card.a,
              href: (pageByTitle[test.name.replace(' (N10-009)', '')] || pageByTitle[test.name] || '') + '#section=' + encodeURIComponent(section.name) + '&card=' + (cardIndex + 1),
              haystack: normalize(haystack)
            });
          });
        });
      }));
    }));
    return rows;
  }

  function renderSearch() {
    var query = input.value.trim();
    results.innerHTML = '';
    if (!query) {
      status.textContent = index.length ? index.length + ' cards indexed. Start typing to search.' : 'Search index ready.';
      return;
    }
    var q = normalize(query);
    var scored = index.map(function (row) {
      return { row: row, score: score(row.haystack, q) };
    }).filter(function (item) {
      return item.score > 0;
    }).sort(function (a, b) {
      return b.score - a.score || a.row.deck.localeCompare(b.row.deck);
    }).slice(0, 40);

    status.textContent = scored.length + ' result' + (scored.length === 1 ? '' : 's') + ' for “' + query + '”.';
    scored.forEach(function (item) {
      var row = item.row;
      var link = document.createElement('a');
      link.className = 'search-result';
      link.href = row.href || '#';
      link.innerHTML = '<small>' + escapeHtml(row.deck + ' › ' + row.chapter + ' › ' + row.section) + '</small>' +
        '<strong>' + highlight(row.q, query) + '</strong>' +
        '<span>' + highlight(row.a.join(' • '), query) + '</span>';
      link.addEventListener('click', closeSearch);
      results.appendChild(link);
    });
  }

  function normalize(value) {
    return String(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function score(text, query) {
    if (!query) return 0;
    if (text.indexOf(query) >= 0) return 1000 - text.indexOf(query);
    var parts = query.split(/\s+/).filter(Boolean);
    var allParts = parts.every(function (part) { return text.indexOf(part) >= 0; });
    if (allParts) return 700;
    var pos = 0;
    var matched = 0;
    for (var i = 0; i < query.length; i += 1) {
      var found = text.indexOf(query[i], pos);
      if (found === -1) continue;
      matched += 1;
      pos = found + 1;
    }
    return matched >= Math.max(2, Math.ceil(query.length * 0.65)) ? 300 + matched : 0;
  }

  function highlight(text, query) {
    var safe = escapeHtml(text);
    var terms = query.trim().split(/\s+/).filter(function (term) { return term.length > 1; }).slice(0, 6);
    terms.forEach(function (term) {
      var re = new RegExp('(' + escapeRegExp(escapeHtml(term)) + ')', 'ig');
      safe = safe.replace(re, '<mark>$1</mark>');
    });
    return safe;
  }

  function escapeHtml(value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function debounce(fn, wait) {
    var timeout;
    return function () {
      window.clearTimeout(timeout);
      timeout = window.setTimeout(fn, wait);
    };
  }
})();
