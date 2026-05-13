#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const assetsDir = path.join(root, 'static', 'assets');
const testsDir = path.join(root, 'content', 'tests');
const menuPath = path.join(assetsDir, 'menu.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function relativeToRoot(filePath) {
  return path.relative(root, filePath).replace(/\\/g, '/');
}

function jsonFilesUnder(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...jsonFilesUnder(entryPath));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(entryPath);
    }
  }
  return files;
}

function validateJsonAsset(filePath) {
  const context = relativeToRoot(filePath);
  const contents = fs.readFileSync(filePath, 'utf8');
  assert.ok(contents.trim(), `${context} should not be empty`);
  assert.doesNotThrow(() => JSON.parse(contents), `${context} should contain valid JSON`);
}

function frontMatterValue(markdown, key) {
  const match = markdown.match(new RegExp(`^${key}:\\s*"?([^"\\n]+)"?\\s*$`, 'm'));
  return match ? match[1].trim() : '';
}

function deckPath(test, chapter) {
  if (chapter.file.includes('/')) return chapter.file;
  if (test.assetPath) return test.assetPath.replace(/\/+$/, '') + '/' + chapter.file;
  if (test.name === 'CompTIA Network+') return 'Network+/' + chapter.file;
  return chapter.file;
}

function normalizeDeckKeys(deck) {
  const keys = new Set();
  if (deck && typeof deck === 'object' && !Array.isArray(deck)) {
    for (const [key, value] of Object.entries(deck)) {
      if (Array.isArray(value)) keys.add(key);
    }
    if (Array.isArray(deck.cards)) keys.add(deck.id || 'cards');
  }
  return keys;
}

function validateCard(card, context) {
  assert.equal(typeof card, 'object', `${context} card should be an object`);

  if (card.front || card.back) {
    assert.equal(typeof card.front?.text, 'string', `${context} imported card should have front.text`);
    assert.ok(card.front.text.trim(), `${context} imported card front.text should not be empty`);
    assert.equal(typeof card.back?.text, 'string', `${context} imported card should have back.text`);
    assert.ok(card.back.text.trim(), `${context} imported card back.text should not be empty`);
    return;
  }

  assert.equal(typeof card.Q, 'string', `${context} card should have Q text`);
  assert.ok(card.Q.trim(), `${context} card Q should not be empty`);
  assert.ok(Array.isArray(card.A) || typeof card.A === 'string', `${context} card should have A as string or array`);
  if (Array.isArray(card.A)) {
    assert.ok(card.A.length > 0, `${context} card A should not be empty`);
    const nonBlankAnswers = card.A.filter((answer) => typeof answer === 'string' && answer.trim());
    for (const answer of card.A) {
      assert.equal(typeof answer, 'string', `${context} answers should be strings`);
      assert.ok(
        answer.trim() || nonBlankAnswers.length === 0,
        `${context} should not keep blank placeholder answers alongside real answers`,
      );
    }
  } else {
    assert.equal(typeof card.A, 'string', `${context} card A should be a string when it is not an array`);
  }
  if (card.O !== undefined) {
    assert.ok(Array.isArray(card.O), `${context} card O should be an array when present`);
    assert.ok(card.O.length > 0, `${context} card O should not be empty when present`);
  }
}

assert.ok(fs.existsSync(menuPath), 'static/assets/menu.json should exist');
const jsonAssetPaths = jsonFilesUnder(assetsDir);
for (const jsonAssetPath of jsonAssetPaths) {
  validateJsonAsset(jsonAssetPath);
}
const menu = readJson(menuPath);
assert.ok(Array.isArray(menu), 'menu.json should be a top-level array');
assert.ok(menu.length > 0, 'menu.json should define at least one practice test');

const testNames = new Set();
for (const test of menu) {
  assert.equal(typeof test.name, 'string', 'each menu test should have a name');
  assert.ok(test.name.trim(), 'menu test names should not be empty');
  assert.ok(!testNames.has(test.name), `menu test names should be unique: ${test.name}`);
  testNames.add(test.name);
  assert.ok(Array.isArray(test.chapter), `${test.name} should have chapter array`);
  assert.ok(test.chapter.length > 0, `${test.name} should have at least one chapter`);

  for (const [chapterIndex, chapter] of test.chapter.entries()) {
    const chapterContext = `${test.name} chapter ${chapterIndex + 1}`;
    assert.equal(typeof chapter.name, 'string', `${chapterContext} should have a name`);
    assert.ok(chapter.name.trim(), `${chapterContext} name should not be empty`);
    assert.equal(typeof chapter.color, 'string', `${chapterContext} should have a color`);
    assert.match(chapter.color, /^#[0-9a-f]{6}$/i, `${chapterContext} color should be a six-digit hex color`);
    assert.ok(Array.isArray(chapter.section), `${chapterContext} should have section array`);
    assert.ok(chapter.section.length > 0, `${chapterContext} should have at least one section`);

    const sectionNames = new Set();
    for (const section of chapter.section) {
      assert.equal(typeof section.name, 'string', `${chapterContext} section should have name`);
      assert.ok(section.name.trim(), `${chapterContext} section name should not be empty`);
      assert.ok(!sectionNames.has(section.name), `${chapterContext} should not duplicate section ${section.name}`);
      sectionNames.add(section.name);
    }

    if (!chapter.file) continue;
    const relativeDeckPath = deckPath(test, chapter);
    const absoluteDeckPath = path.join(assetsDir, relativeDeckPath);
    assert.ok(fs.existsSync(absoluteDeckPath), `${chapterContext} deck file should exist: ${relativeDeckPath}`);
    assert.ok(fs.statSync(absoluteDeckPath).size > 0, `${chapterContext} deck file should not be empty: ${relativeDeckPath}`);

    const deck = readJson(absoluteDeckPath);
    const deckKeys = normalizeDeckKeys(deck);
    assert.ok(deckKeys.size > 0, `${relativeDeckPath} should expose at least one card section`);

    for (const section of chapter.section) {
      assert.ok(deckKeys.has(section.name), `${relativeDeckPath} should include menu section ${section.name}`);
      const cards = Array.isArray(deck[section.name]) ? deck[section.name] : deck.cards;
      assert.ok(Array.isArray(cards), `${relativeDeckPath} ${section.name} should resolve to card array`);
      assert.ok(cards.length > 0, `${relativeDeckPath} ${section.name} should contain cards`);
      cards.forEach((card, cardIndex) => validateCard(card, `${relativeDeckPath} ${section.name} card ${cardIndex + 1}`));
    }
  }
}

const routeFiles = fs.readdirSync(testsDir).filter((file) => file.endsWith('.md'));
assert.ok(routeFiles.length > 0, 'content/tests should define practice test routes');
for (const routeFile of routeFiles) {
  const markdown = fs.readFileSync(path.join(testsDir, routeFile), 'utf8');
  const testName = frontMatterValue(markdown, 'testName');
  const testIndex = Number(frontMatterValue(markdown, 'testIndex'));
  assert.ok(testName, `${routeFile} should define testName front matter`);
  assert.ok(testNames.has(testName), `${routeFile} testName should exist in menu.json: ${testName}`);
  assert.ok(Number.isInteger(testIndex), `${routeFile} should define numeric testIndex front matter`);
  assert.equal(menu[testIndex]?.name, testName, `${routeFile} testIndex should point at ${testName} in menu.json`);
}

console.log(`Deck data invariants passed for ${jsonAssetPaths.length} JSON assets, ${menu.length} menu tests, and ${routeFiles.length} routes.`);
