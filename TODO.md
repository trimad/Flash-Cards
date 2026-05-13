# Flash-Cards TODO

## Active TODOs

- [ ] Enrich or remove legacy Network+ cards whose answer arrays are entirely blank (393 cards remain without answer content).

## Done

- [x] Remove the empty stale `network-plus.json` asset and validate every source JSON asset is non-empty and parseable.
- [x] Add a settings option that resets scores and progress.
- [x] Make NERV the default theme and polish all four Evangelion theme palettes.
- [x] Move the Evangelion theme selection buttons behind a settings button that opens a modal window.
- [x] Add browser-level smoke coverage for the Evangelion theme selector and reset-progress settings action using a headless Chrome harness.
- [x] Expand validation to cover generated `docs/` export links/assets, not only theme source invariants.
- [x] Add an npm/package script or documented validation entrypoint so theme/source invariant checks can be run without remembering script paths.
- [x] Add selectable Neon Genesis: Evangelion CSS themes named Rei, Shinji, Asuka, and NERV.

## Discovered TODOs

- [ ] Audit unreferenced root/backup assets (`static/assets/examcompass.json`, `static/assets/backup/*`, and generated copies) and either document their provenance or remove them from the deployable site.
- [x] Add richer content/data validation for deck JSON shape and menu-to-deck references.
- [x] Remove blank placeholder entries from legacy Network+ cards that already have real answers.
- [x] Add browser-level smoke coverage for the reset-progress settings action once a DOM/browser test harness exists.

## Work Log

### 2026-05-13 10:10 EDT - JSON asset validation and stale file cleanup

- Tasks attempted: Strengthened deck/data validation after root-cause inspection found an unreferenced zero-byte `network-plus.json` source asset that existing menu-only validation did not exercise.
- Files changed: scripts/validate-deck-data.js, removed static/assets/network-plus.json, removed docs/assets/network-plus.json, TODO.md.
- Commands run: `git status --short --branch`; `git log --oneline -5`; project file/config inspection; `pygount --format=summary --folders-to-skip='.git,node_modules,venv,.venv,__pycache__,.cache,dist,build,.next,.tox,.eggs,*.egg-info,docs,public' .`; baseline `npm test`; source asset parse/count probes; `node scripts/validate-deck-data.js` (RED, failed on empty `static/assets/network-plus.json`); `node scripts/validate-deck-data.js` (GREEN after deleting stale empty source/generated assets); `npm test`; final `date`, `git diff --stat`, and `git status --short --branch`.
- Results: `validate-deck-data.js` now recursively checks all `static/assets/**/*.json` files for non-empty valid JSON before menu/deck assertions. Removed the obsolete zero-byte Network+ asset from source and generated output. Full validation passed.
- New TODOs added: Audit remaining unreferenced root/backup assets and either document their provenance or remove them from the deployable site.
- Remaining work: Network+ still has 393 answerless legacy cards that need source-backed enrichment or removal.

### 2026-05-13 09:36 EDT - headless browser smoke harness

- Tasks attempted: Completed the browser-level smoke coverage TODOs by adding a dependency-free headless Chrome/CDP harness, wiring it into package validation, and documenting the focused rerun command.
- Files changed: scripts/browser-smoke.js, scripts/validate-package-scripts.js, package.json, README.md, regenerated docs/* output from `npm test`, TODO.md.
- Commands run: `git status --short --branch`; `git log --oneline -5`; project file/config inspection; `pygount --format=summary --folders-to-skip='.git,node_modules,venv,.venv,__pycache__,.cache,dist,build,.next,.tox,.eggs,*.egg-info,docs,public' .`; baseline `npm test`; `node scripts/validate-package-scripts.js` (RED, missing browser smoke wiring); `node scripts/validate-package-scripts.js` (GREEN); `node scripts/browser-smoke.js`; `npm test`; Network+ blank-answer count script; final `date`, `git diff --stat`, and `git status --short --branch`.
- Results: Added `npm run browser:smoke`, included it in `npm test`, and verified the generated `docs/` site in real Chrome. The smoke test serves `docs/` locally, opens the settings dialog, checks hidden/open computed state, selects and persists the Asuka theme across reload, loads the Network+ deck, confirms reset-progress deletion, checks the aria-live status, and verifies cards still render after reset. Full validation passed.
- New TODOs added: None.
- Remaining work: Network+ still has 393 answerless legacy cards that need source-backed enrichment or removal.

### 2026-05-13 08:59 EDT - deck progress reset setting

- Tasks attempted: Completed the active reset-scores/progress TODO using a RED/GREEN source invariant, then regenerated the Hugo export.
- Files changed: scripts/validate-reset-progress.js, scripts/validate-package-scripts.js, package.json, layouts/_default/baseof.html, layouts/tests/single.html, static/js/flashcards.js, static/css/flashcards.css, README.md, regenerated docs/* output, TODO.md.
- Commands run: `git status --short --branch`; `git log --oneline -5`; project structure/config inspection; `pygount --format=summary --folders-to-skip='.git,node_modules,venv,.venv,__pycache__,.cache,dist,build,.next,.tox,.eggs,*.egg-info,docs,public' .`; baseline `npm test`; `node scripts/validate-reset-progress.js` (RED, missing reset-progress settings UI/logic); `node scripts/validate-reset-progress.js` (GREEN); `npm test`; generated export smoke search for `data-reset-progress` in `docs/tests/*`; final `date`, `git diff --stat`, and `git status --short --branch`.
- Results: Deck pages now include a Settings → Deck progress section with a destructive Reset progress button and aria-live completion status. The card app confirms before deletion, removes only the current deck's localStorage progress key, clears in-memory seen/quiz/self-grade state, prevents the visible card from being immediately re-marked studied, and re-renders the deck. Full validation passed.
- New TODOs added: Add browser-level smoke coverage for the reset-progress settings action once a DOM/browser test harness exists.
- Remaining work: Browser-level click/persistence coverage still waits on a DOM/browser harness; Network+ still has 393 answerless legacy cards that need source-backed enrichment or removal.

### 2026-05-12 20:13 EDT - NERV default and theme polish

- Tasks attempted: Made the default-theme requirement explicit and polished the Rei, Shinji, Asuka, and NERV palettes so more of the interface responds to each selected theme instead of retaining fixed dark surfaces.
- Files changed: static/css/flashcards.css, scripts/validate-theme-selector.js, regenerated docs/* output, TODO.md.
- Commands run: `node scripts/validate-theme-selector.js` (RED, missing polished surface/theme invariants); `node scripts/validate-theme-selector.js` (GREEN); `npm test`; generated export smoke-read of docs/index.html; final `git status --short --branch`.
- Results: NERV remains the source and generated default (`data-theme="nerv"`, NERV button initially pressed, JS fallback `DEFAULT_THEME = "nerv"`). Added theme-specific gradients, surfaces, headers, card faces, modal scrims, button treatments, theme auras, and selector swatches; removed the app-shell accent override so active themes carry through the study UI. Validation and full npm test passed.
- New TODOs added: None.
- Remaining work: Browser-level click/persistence coverage still waits on a DOM/browser harness; the reset-scores/progress setting remains active.

### 2026-05-12 20:02 EDT - theme settings modal

- Tasks attempted: Completed the active UI TODO to move Evangelion theme buttons out of the persistent header and into a settings modal, using the theme source invariant validator as the RED/GREEN check.
- Files changed: scripts/validate-theme-selector.js, layouts/_default/baseof.html, static/js/theme-selector.js, static/css/flashcards.css, regenerated docs/* output, TODO.md.
- Commands run: `git status --short --branch`; `git log --oneline -5`; `pygount --format=summary --folders-to-skip='.git,node_modules,venv,.venv,__pycache__,.cache,dist,build,.next,.tox,.eggs,*.egg-info,docs,public' .`; `node scripts/validate-theme-selector.js` (RED, missing settings button/modal); `node scripts/validate-theme-selector.js && npm test`; final `date '+%Y-%m-%d %H:%M %Z' && git status --short --branch`.
- Results: Header now shows a Settings button; theme choices live in an accessible dialog with backdrop, close button, Escape/backdrop close behavior, focus handoff, persisted palette selection, and an explicit `[hidden]` CSS guard so modal visibility cannot be overridden by component display rules. Validation and full npm test passed.
- New TODOs added: None.
- Remaining work: Browser-level smoke coverage for click/persistence behavior still waits on a DOM/browser harness; Network+ still has answerless legacy cards that need source-backed enrichment or removal.

### 2026-05-12 19:30 EDT - Network+ answer placeholder cleanup

- Tasks attempted: Advanced the legacy Network+ cleanup by removing blank placeholder entries from cards that already had real answer content, using the deck-data validator as the regression check.
- Files changed: scripts/validate-deck-data.js, static/assets/Network+/1-networking-concepts.json, static/assets/Network+/4-network-security.json, regenerated docs/assets/Network+/1-networking-concepts.json and docs/assets/Network+/4-network-security.json, TODO.md.
- Commands run: `git status --short --branch`; recent `git log --oneline -5`; project file/config inspection; `pygount --format=summary --folders-to-skip='.git,node_modules,venv,.venv,__pycache__,.cache,dist,build,.next,.tox,.eggs,*.egg-info,docs,public' .`; `node scripts/validate-deck-data.js` (RED, exposed blank placeholder answers alongside real answers); cleanup script for Network+ answer arrays; `node scripts/validate-deck-data.js && npm test`; final blank-answer count script; final `git status --short --branch`.
- Results: Tightened deck validation so cards with real answers cannot keep blank placeholder answer entries. Removed partial blank placeholders from Network+ JSON; validation and full npm test passed.
- New TODOs added: Enrich or remove 393 legacy Network+ cards whose answer arrays are entirely blank.
- Remaining work: Browser-level theme selector smoke coverage still needs a DOM/browser harness; Network+ still has answerless legacy cards that need source-backed content enrichment or removal.

### 2026-05-12 18:58 EDT - deck/menu data validation

- Tasks attempted: Completed the discovered TODO to validate deck JSON shape, menu references, and content route front matter using a RED/GREEN package-script invariant check.
- Files changed: package.json, README.md, scripts/validate-package-scripts.js, scripts/validate-deck-data.js, regenerated docs/* output from validation, TODO.md.
- Commands run: `git status --short --branch`; project structure/config inspection; `pygount --format=summary --folders-to-skip='.git,node_modules,venv,.venv,__pycache__,.cache,dist,build,.next,.tox,.eggs,*.egg-info,docs,public' .`; `node scripts/validate-package-scripts.js` (RED, validation did not include deck data checks); `node scripts/validate-deck-data.js` (RED exposed legacy empty answer placeholders in Network+ deck data); `node scripts/validate-package-scripts.js && node scripts/validate-deck-data.js`; `npm test`; final `git status --short --branch`.
- Results: Added `scripts/validate-deck-data.js` to assert menu structure, route `testName`/`testIndex` consistency, deck-file existence, section coverage, and supported card schemas. Wired it into `npm test` and documented the broader validation. Validation passed.
- New TODOs added: Clean up legacy Network+ deck cards whose answer arrays contain empty placeholder strings.
- Remaining work: Browser-level theme selector smoke coverage still needs a DOM/browser harness; legacy Network+ deck content has placeholder blanks that should be normalized in a separate data-cleanup pass.

### 2026-05-12 18:25 EDT - generated export validation

- Tasks attempted: Completed the discovered TODO to validate generated `docs/` export links/assets using a RED/GREEN package-script invariant check.
- Files changed: package.json, README.md, scripts/validate-package-scripts.js, scripts/validate-export.js, regenerated docs/* output from validation, TODO.md.
- Commands run: `git status --short --branch`; project structure/config inspection; `pygount --format=summary --folders-to-skip='.git,node_modules,venv,.venv,__pycache__,.cache,dist,build,.next,.tox,.eggs,*.egg-info,docs,public' .`; `node scripts/validate-package-scripts.js` (RED, missing export validator in npm validation); `npm test` (first GREEN attempt exposed the `/Flash-Cards/` GitHub Pages baseURL prefix in generated links); `npm test` (GREEN after normalizing that prefix in the export validator); final `git status --short --branch`.
- Results: Added `scripts/validate-export.js` to assert required generated pages/assets are present, non-empty, and all local HTML `href`/`src` references resolve inside `docs/`; wired it into `npm test` after `hugo --minify`; documented the stronger validation. Validation passed.
- New TODOs added: Add richer content/data validation for deck JSON shape and menu-to-deck references.
- Remaining work: Browser-level theme selector smoke coverage still needs a DOM/browser harness; deck/menu data invariants are not yet covered.

### 2026-05-12 17:52 EDT - npm validation entrypoint

- Tasks attempted: Completed the discovered TODO for a discoverable project validation entrypoint using a RED/GREEN package-script invariant check.
- Files changed: package.json, README.md, scripts/validate-package-scripts.js, regenerated docs/* output from validation, TODO.md.
- Commands run: `git status --short --branch`; project structure/config inspection; `pygount --format=summary --folders-to-skip='.git,node_modules,venv,.venv,__pycache__,.cache,dist,build,.next,.tox,.eggs,*.egg-info,docs,public' .`; `npm test` (reproduced missing script); `node scripts/validate-package-scripts.js` (RED, missing package.json); `node scripts/validate-package-scripts.js && npm test`; final `git status --short --branch`.
- Results: Added private `package.json` scripts for `npm test`, `npm run validate`, `npm run build`, and `npm run serve`; added a package-script invariant validator; documented `npm test` and `npm run build` in README. Validation passed.
- New TODOs added: Expand validation to cover generated `docs/` export links/assets.
- Remaining work: Add browser-level theme selector smoke coverage when a DOM/browser harness exists; strengthen export validation beyond current source invariants.

### 2026-05-12 17:21 EDT - Evangelion theme selector

- Tasks attempted: Implemented the active TODO for selectable Neon Genesis: Evangelion CSS themes using a source-invariant RED/GREEN check.
- Files changed: layouts/_default/baseof.html, static/css/flashcards.css, static/js/theme-selector.js, scripts/validate-theme-selector.js, generated docs/* output, TODO.md.
- Commands run: `git status --short --branch`; project structure/config inspection; `pygount --format=summary --folders-to-skip='.git,node_modules,venv,.venv,__pycache__,.cache,dist,build,.next,.tox,.eggs,*.egg-info,docs,public' .`; `node scripts/validate-theme-selector.js` (RED, missing script); `node scripts/validate-theme-selector.js && hugo --minify`; built-output smoke search; final git status.
- Results: Added a persistent header theme selector with Rei, Shinji, Asuka, and NERV options; added CSS variable palettes for each theme; added localStorage-backed theme persistence; regenerated the Hugo `docs/` output. Validation passed: theme source invariants and Hugo build.
- New TODOs added: Add browser-level smoke coverage for the theme selector; add a documented/package validation entrypoint.
- Remaining work: Commit/review changes; later add richer DOM coverage for click/persistence behavior.

### 2026-05-12 - Manual TODO update

- Tasks attempted: Captured Tristan's requested UI/theme feature before the autonomous cron run begins.
- Files changed: TODO.md
- Commands run: Hermes cron run for job a3b4e3691d01 was triggered.
- Results: Added active TODO for selectable Evangelion CSS themes: Rei, Shinji, Asuka, and NERV.
- New TODOs added: Add selectable Neon Genesis: Evangelion CSS themes named Rei, Shinji, Asuka, and NERV.
- Remaining work: Implement theme selection UI/state and CSS theme variants; validate in the app.
