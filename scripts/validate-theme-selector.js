#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const baseLayout = read('layouts/_default/baseof.html');
const css = read('static/css/flashcards.css');
const js = read('static/js/theme-selector.js');

assert.match(baseLayout, /data-theme="nerv"/, 'base layout should set default NERV theme on the document');
assert.match(baseLayout, /data-theme-choice="nerv" aria-pressed="true"/, 'NERV should be the initially pressed/default theme choice');
assert.match(baseLayout, /data-theme-settings-button/, 'base layout should render a settings button for theme controls');
assert.match(baseLayout, /data-theme-dialog/, 'base layout should place theme controls inside a dialog/modal');
assert.match(baseLayout, /class="theme-selector"/, 'base layout should render a theme selector in the settings modal');
assert.match(baseLayout, /data-theme-choice="rei"/, 'theme selector should include Rei');
assert.match(baseLayout, /data-theme-choice="shinji"/, 'theme selector should include Shinji');
assert.match(baseLayout, /data-theme-choice="asuka"/, 'theme selector should include Asuka');
assert.match(baseLayout, /data-theme-choice="nerv"/, 'theme selector should include NERV');
assert.match(baseLayout, /js\/theme-selector\.js/, 'base layout should load the theme selector script');

for (const theme of ['rei', 'shinji', 'asuka', 'nerv']) {
  assert.match(css, new RegExp(`html\\[data-theme="${theme}"\\]`), `CSS should define ${theme} theme variables`);
  assert.match(css, new RegExp(`html\\[data-theme="${theme}"\\][\\s\\S]*--surface-base:`), `${theme} theme should define a polished surface base`);
  assert.match(css, new RegExp(`html\\[data-theme="${theme}"\\][\\s\\S]*--header-bg:`), `${theme} theme should define a header treatment`);
  assert.match(css, new RegExp(`html\\[data-theme="${theme}"\\][\\s\\S]*--card-bg:`), `${theme} theme should define card-face polish`);
  assert.match(css, new RegExp(`html\\[data-theme="${theme}"\\][\\s\\S]*--button-bg:`), `${theme} theme should define button polish`);
  assert.match(css, new RegExp(`html\\[data-theme="${theme}"\\][\\s\\S]*--theme-aura:`), `${theme} theme should define an atmospheric aura`);
  assert.match(js, new RegExp(`\\b${theme}\\b`), `theme selector script should recognize ${theme}`);
}

assert.doesNotMatch(css, /\.app-shell\s*\{[^}]*--accent:/s, 'app shell should not override the active theme accent');
assert.match(css, /body\s*\{[\s\S]*var\(--bg-gradient\)/, 'body should use theme-specific background polish');
assert.match(css, /\.site-header\s*\{[\s\S]*var\(--header-bg\)/, 'site header should use theme-specific header polish');
assert.match(css, /\.card-face\s*\{[\s\S]*var\(--card-bg\)/, 'flash card faces should use theme-specific card polish');
assert.match(css, /\.theme-selector button::before/, 'theme buttons should include visual swatches for each theme');
assert.match(js, /DEFAULT_THEME\s*=\s*"nerv"/, 'theme selector script should fall back to NERV by default');
assert.match(js, /localStorage\.setItem\(THEME_STORAGE_KEY/, 'theme choices should persist to localStorage');
assert.match(js, /document\.documentElement\.dataset\.theme/, 'theme script should apply the choice to the document element');

console.log('Theme selector source invariants passed.');
