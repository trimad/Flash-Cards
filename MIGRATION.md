# Migration Notes

## Breaking catalog change

The incomplete CompTIA A+ placeholder decks were removed. The application now exposes only complete decks:

- CompTIA Network+ (N10-009)
- CompTIA Security+ (SY0-701)
- CompTIA Tech+ (FC0-U71)
- Early Reading

Any bookmarks to the old A+ routes will no longer resolve because those routes intentionally represented empty placeholder content.

## Route index changes

`testIndex` values changed after A+ removal:

- Network+: `0`
- Security+: `1`
- Early Reading: `2`
- Tech+: `3`

Existing browser progress keys are based on route slugs, not indexes, so existing progress for retained decks is preserved where possible.

## Generated assets

Unreferenced backup/root JSON assets were removed:

- `static/assets/examcompass.json`
- `static/assets/backup/*`
- generated copies under `docs/assets/`

These were identified by the prior analysis as unreferenced and ambiguous.

## Deployment

Deployment now uses the committed Hugo `docs/` output after full validation. The previous workflow built directly to `public/` and skipped validation.

## User data

All browser-local progress remains localStorage-based. New fields (`schedule`, `bookmarks`, `suspended`) are added lazily to section progress and are backwards compatible with existing progress objects.

## Issue resolution checklist

Resolved:

- Removed A+ placeholder decks.
- Completed blank Network+ answer arrays.
- Added cached/parallel deck loading.
- Added global search.
- Added SM-2 scheduling controls.
- Added local deck editor/export workflow.
- Added PWA/offline shell.
- Fixed Network+ `professorMesser` front matter typo.
- Persisted welcome modal dismissal.
- Removed obsolete backup/root assets.
- Updated CI to run full validation before deployment.
- Documented Python scraper dependencies.
- Reconciled deployment documentation with artifact-based Pages deployment.

Intentionally preserved:

- Hugo static architecture.
- JSON deck files.
- Browser-local persistence.
- Keyboard/gamepad/speech workflows.
- Existing Evangelion and productivity theme system.
