import {
  layoutWithLines,
  measureLineStats,
  prepareWithSegments
} from "../vendor/pretext/layout.js";

// Keep the actual package local so the offline PWA and GitHub Pages deploy use
// the same pinned implementation rather than a CDN's latest version.
window.FlashCardsPretext = Object.freeze({
  version: "0.0.6",
  layoutWithLines,
  measureLineStats,
  prepareWithSegments
});

window.dispatchEvent(new Event("flashcards-pretext-ready"));
