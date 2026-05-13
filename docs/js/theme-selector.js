(function () {
  var THEME_STORAGE_KEY = "flashcards.evangelionTheme";
  var THEMES = ["rei", "shinji", "asuka", "nerv"];
  var DEFAULT_THEME = "nerv";

  function safeStoredTheme() {
    try {
      return window.localStorage.getItem(THEME_STORAGE_KEY);
    } catch (error) {
      return "";
    }
  }

  function persistTheme(theme) {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch (error) {
      // Theme selection is decorative; keep working when storage is unavailable.
    }
  }

  function normalizeTheme(theme) {
    return THEMES.indexOf(theme) >= 0 ? theme : DEFAULT_THEME;
  }

  function applyTheme(theme) {
    var selectedTheme = normalizeTheme(theme);
    document.documentElement.dataset.theme = selectedTheme;

    document.querySelectorAll("[data-theme-choice]").forEach(function (button) {
      button.setAttribute("aria-pressed", String(button.dataset.themeChoice === selectedTheme));
    });

    return selectedTheme;
  }

  function bindThemeSelector() {
    document.querySelectorAll("[data-theme-choice]").forEach(function (button) {
      button.addEventListener("click", function () {
        var selectedTheme = applyTheme(button.dataset.themeChoice);
        persistTheme(selectedTheme);
      });
    });
  }

  function bindThemeDialog() {
    var opener = document.querySelector("[data-theme-settings-button]");
    var dialog = document.querySelector("[data-theme-dialog]");
    var backdrop = document.querySelector("[data-theme-dialog-backdrop]");
    var closeButtons = document.querySelectorAll("[data-theme-dialog-close]");

    if (!opener || !dialog || !backdrop) {
      return;
    }

    function setDialogOpen(isOpen) {
      dialog.hidden = !isOpen;
      backdrop.hidden = !isOpen;
      opener.setAttribute("aria-expanded", String(isOpen));

      if (isOpen) {
        var pressedTheme = dialog.querySelector('[data-theme-choice][aria-pressed="true"]');
        (pressedTheme || dialog.querySelector("[data-theme-choice]") || dialog).focus();
      } else {
        opener.focus();
      }
    }

    opener.addEventListener("click", function () {
      setDialogOpen(dialog.hidden);
    });

    backdrop.addEventListener("click", function () {
      setDialogOpen(false);
    });

    closeButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        setDialogOpen(false);
      });
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !dialog.hidden) {
        setDialogOpen(false);
      }
    });
  }

  applyTheme(safeStoredTheme() || document.documentElement.dataset.theme || DEFAULT_THEME);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      bindThemeSelector();
      bindThemeDialog();
    });
  } else {
    bindThemeSelector();
    bindThemeDialog();
  }
})();
