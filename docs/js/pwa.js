(function () {
  var installPrompt = null;
  var installButton = document.querySelector('[data-pwa-install]');
  var connectionStatus = document.querySelector('[data-connection-status]');
  var standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

  document.documentElement.classList.toggle('is-standalone', standalone);

  var themeColors = { rei: '#edf8fc', light: '#f4f4f5', shinji: '#080b18', asuka: '#130706', nerv: '#09090b', dark: '#090f18', amoled: '#000000' };
  function syncThemeColor() {
    var color = themeColors[document.documentElement.dataset.theme] || themeColors.nerv;
    document.querySelectorAll('meta[name="theme-color"]').forEach(function (meta) { meta.content = color; });
  }
  syncThemeColor();
  new MutationObserver(syncThemeColor).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      var manifest = document.querySelector('link[rel="manifest"]');
      var base = (window.FlashCardsConfig && window.FlashCardsConfig.baseURL) || (manifest && manifest.href.replace(/manifest\.webmanifest.*$/, '')) || '/';
      navigator.serviceWorker.register(base + 'service-worker.js', { scope: base }).catch(function (error) {
        console.warn('Service worker registration failed:', error);
      });
    });
  }

  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault();
    installPrompt = event;
    if (installButton && !standalone) installButton.hidden = false;
  });

  if (installButton) {
    installButton.addEventListener('click', function () {
      if (!installPrompt) return;
      installPrompt.prompt();
      installPrompt.userChoice.finally(function () {
        installPrompt = null;
        installButton.hidden = true;
      });
    });
  }

  window.addEventListener('appinstalled', function () {
    standalone = true;
    document.documentElement.classList.add('is-standalone');
    if (installButton) installButton.hidden = true;
  });

  function updateConnectionStatus() {
    if (!connectionStatus) return;
    if (navigator.onLine) {
      if (connectionStatus.dataset.wasOffline === 'true') {
        connectionStatus.textContent = 'Back online';
        connectionStatus.hidden = false;
        window.setTimeout(function () { connectionStatus.hidden = true; }, 2200);
      }
      connectionStatus.dataset.wasOffline = 'false';
    } else {
      connectionStatus.dataset.wasOffline = 'true';
      connectionStatus.textContent = 'Offline mode · saved decks are ready';
      connectionStatus.hidden = false;
    }
  }

  window.addEventListener('online', updateConnectionStatus);
  window.addEventListener('offline', updateConnectionStatus);
  updateConnectionStatus();

  /* iOS can leave 100vh stale after the address bar or keyboard moves. */
  function syncViewportHeight() {
    var height = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    document.documentElement.style.setProperty('--visual-viewport-height', height + 'px');
  }
  syncViewportHeight();
  window.addEventListener('resize', syncViewportHeight, { passive: true });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', syncViewportHeight, { passive: true });
})();
