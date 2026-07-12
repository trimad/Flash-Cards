# Changelog

## Production overhaul

### Deck catalog

- Removed incomplete CompTIA A+ placeholder routes and menu entries.
- The supported catalog now contains only complete decks:
  - CompTIA Network+ (N10-009)
  - CompTIA Security+ (SY0-701)
  - CompTIA Tech+ (FC0-U71)
  - Early Reading
- Reindexed deck route front matter to match the curated menu.
- Removed obsolete unreferenced root/backup JSON assets identified in the read-only analysis.

### Deck quality

- Completed the legacy Network+ objective decks by replacing 393 blank answer arrays with study-ready definitions and explanations.
- Validated all active deck JSON files for parseability, schema shape, blank questions, blank answers, route references, and menu consistency.

### Study engine

- Added cached JSON loading and parallel chapter loading to reduce startup latency and eliminate duplicate deck fetches.
- Added SM-2 spaced repetition scheduling stored locally in browser progress.
- Added Again, Hard, Good, and Easy grading controls.
- Added bookmark and suspend controls for individual cards.
- Added shuffle and due-card review entry points.
- Added session timer/review summary display.

### Search and authoring

- Added global Ctrl+K search across all active decks.
- Added instant fuzzy matching and highlighted results.
- Added a local browser deck editor that accepts Markdown-like Q/A blocks or JSON and exports repository-compatible deck JSON.
- Added autosaved editor drafts and undo/redo controls.

### PWA/offline

- Added web app manifest, installable SVG icon, PWA registration, and service worker.
- Added cache-first offline support for core shell, scripts, styles, menu, and runtime-fetched deck assets.

### Accessibility and UX

- Added persisted welcome-modal dismissal.
- Added Xbox-first panel focus: LB always focuses Deck/TOC, RB always focuses Study.
- Added deterministic roving focus indexes for TOC, Study, and modal controller contexts.
- Added modal-first controller routing so Settings, Search, Editor, and Welcome trap D-pad/A/B before study actions can fire.
- Added visible `.is-controller-focused` styling for controller-selected controls.
- Section selection from the TOC now automatically returns controller focus to Study while preserving the last TOC position.
- Added dialog-based search/editor workflows with focusable controls and aria-live status text.
- Improved study controls, focus states, and utility dialogs.
- Preserved and expanded the theme system with Evangelion, Light, Dark, and AMOLED palettes.

### CI/CD and validation

- Updated GitHub Actions deployment to run the full `npm test` validation suite before deploying.
- CI now validates package invariants, theme/reset invariants, deck data, generated export, and browser smoke tests.
- Fixed Hugo deprecation warnings by replacing `languageCode` with `locale` and using a static `lang` attribute.

### Documentation

- Rewrote README.
- Added architecture, contribution, deck format, study engine, testing, and migration documentation.
