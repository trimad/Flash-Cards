# Study Engine

Flash Cards supports free review, quiz grading, self grading, bookmarks, suspended cards, shuffle, due review, and SM-2 spaced repetition.

## Progress storage

Progress is stored in localStorage per deck:

```text
flash-cards:<deck-slug>:progress:v1
```

Section keys use:

```text
<chapterIndex>:<sectionName>
```

Each section may contain:

- `seen`: card indexes viewed.
- `quiz`: multiple-choice attempts.
- `selfGrade`: right/wrong grade history.
- `schedule`: SM-2 scheduling records.
- `bookmarks`: bookmarked card indexes.
- `suspended`: suspended card indexes.

## SM-2 scheduling

The app implements a browser-local SM-2 style scheduler.

Grades:

- Again: resets repetitions, schedules relearning soon, increments lapse count.
- Hard: passes but uses a shorter interval.
- Good: normal successful recall.
- Easy: successful recall with a larger interval bonus.

Stored schedule fields:

- `algorithm`: `SM-2`
- `grade`
- `ease`
- `interval`
- `repetitions`
- `lapses`
- `reviewedAt`
- `due`

## Due review

The Due cards control jumps to the first unsuspended card that has no schedule or has a due timestamp in the past.

## Shuffle

The Shuffle control jumps to a random unsuspended card in the current deck.

## Bookmarks and suspended cards

Bookmarks and suspended cards are stored locally in the progress object. Suspension excludes cards from shuffle and due-card jumps, but direct navigation still preserves backwards compatibility.

## Quiz cards

Cards with an `O` option array render multiple-choice controls. The selected options are compared to normalized answers in `A`.

## Self grading

Right/Wrong buttons are retained for fast recall tracking and existing controller support. SM-2 controls build on top of the same local persistence model.
