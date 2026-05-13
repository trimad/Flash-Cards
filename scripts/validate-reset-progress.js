#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const baseLayout = read('layouts/_default/baseof.html');
const testLayout = read('layouts/tests/single.html');
const css = read('static/css/flashcards.css');
const js = read('static/js/flashcards.js');
const packageJson = JSON.parse(read('package.json'));

assert.match(baseLayout, /data-reset-progress-panel/, 'settings modal should expose a deck progress reset panel');
assert.match(baseLayout, /data-reset-progress\b/, 'settings modal should include a reset progress button');
assert.match(baseLayout, /data-reset-progress-status/, 'settings modal should include an aria-live reset status message');
assert.match(baseLayout, /Reset progress/, 'reset action should be clearly labeled');
assert.match(testLayout, /data-enable-progress-reset/, 'test routes should opt into the progress reset setting');

assert.match(css, /\.settings-section/, 'settings modal should style distinct settings sections');
assert.match(css, /\.danger-button/, 'destructive reset action should have danger-button styling');

assert.match(js, /resetProgressButton:\s*document\.querySelector\("\[data-reset-progress\]"\)/, 'flashcards script should find the reset progress button');
assert.match(js, /resetProgressStatus:\s*document\.querySelector\("\[data-reset-progress-status\]"\)/, 'flashcards script should find the reset progress status element');
assert.match(js, /function resetStoredProgress\(/, 'flashcards script should implement a dedicated reset function');
assert.match(js, /window\.confirm\(/, 'reset should ask for confirmation before deleting progress');
assert.match(js, /localStorage\.removeItem\(progressKey\(getCurrentTest\(\)\)\)/, 'reset should remove the current deck progress key from localStorage');
assert.match(js, /progress\s*=\s*\{ sections: \{\} \}/, 'reset should clear in-memory progress state');
assert.match(js, /skipNextSeenMark/, 'reset should avoid immediately re-marking the visible card as studied');
assert.match(js, /resetProgressStatus\.textContent/, 'reset should announce completion to assistive technology');
assert.match(js, /renderAll\(\)/, 'reset should re-render the deck after clearing progress');
assert.match(packageJson.scripts?.validate || '', /node scripts\/validate-reset-progress\.js/, 'validate script should include reset progress invariants');

console.log('Reset progress source invariants passed.');
