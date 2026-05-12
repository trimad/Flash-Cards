(function () {
  var modal = document.getElementById("welcome-modal");
  var closeButton = document.getElementById("welcome-modal-close");
  var previousFocus = null;

  if (!modal) {
    return;
  }

  bindModal();
  openModal();

  function bindModal() {
    modal.addEventListener("click", function (event) {
      var closeTarget = event.target instanceof Element && event.target.closest("[data-welcome-close]");

      if (closeTarget) {
        closeModal();
      }
    });

    document.addEventListener("keydown", function (event) {
      if (modal.hidden) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        closeModal();
      } else if (event.key === "Tab") {
        trapFocus(event);
      }
    });
  }

  function openModal() {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    modal.hidden = false;

    window.requestAnimationFrame(function () {
      if (closeButton) {
        closeButton.focus();
      }
    });
  }

  function closeModal() {
    if (modal.hidden) {
      return;
    }

    modal.hidden = true;

    if (previousFocus && document.contains(previousFocus)) {
      previousFocus.focus();
    }
  }

  function trapFocus(event) {
    var focusable = focusableElements();

    if (!focusable.length) {
      event.preventDefault();
      return;
    }

    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    var active = document.activeElement;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function focusableElements() {
    return Array.prototype.slice.call(
      modal.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")
    ).filter(function (element) {
      return element instanceof HTMLElement && !element.disabled && isVisible(element);
    });
  }

  function isVisible(element) {
    return Boolean(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
  }
})();
