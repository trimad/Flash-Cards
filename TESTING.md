# Testing Strategy

The project uses lightweight custom validation scripts instead of a large test framework.

## Full suite

```bash
npm test
```

This runs:

1. `scripts/validate-package-scripts.js`
2. `scripts/validate-theme-selector.js`
3. `scripts/validate-reset-progress.js`
4. `scripts/validate-deck-data.js`
5. `hugo --minify`
6. `scripts/validate-export.js`
7. `scripts/browser-smoke.js`

## Data validation

`validate-deck-data.js` verifies:

- every source JSON asset is non-empty and parseable
- `menu.json` has valid test/chapter/section structure
- deck files exist
- section names match deck keys
- card schemas are supported
- questions and answers are not blank
- route front matter `testName` and `testIndex` match `menu.json`

## Generated export validation

`validate-export.js` verifies:

- required generated pages and assets exist
- generated HTML local `href` and `src` references resolve inside `docs/`
- search/editor/PWA assets are included

## Browser smoke tests

`browser-smoke.js` starts a local static server for `docs/`, launches headless Chrome/Edge/Chromium through the Chrome DevTools Protocol, and verifies:

- settings dialog behavior
- theme persistence
- global search index/results
- local deck editor preview
- controller panel focus, roving focus, modal controller trapping, and automatic TOC-to-Study return
- reset-progress behavior
- card animation behavior

## CI

`.github/workflows/deploy.yml` runs `npm test` before deploying. A failed validation blocks deployment.
