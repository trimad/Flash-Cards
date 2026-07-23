#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'static', 'assets', 'Security+');
const deckPath = path.join(assets, 'examcompass-sy0-701-practice-tests.json');
const menuPath = path.join(root, 'static', 'assets', 'menu.json');
const testName = 'CompTIA Security+ (SY0-701)';
const expectedPractice = Array.from({ length: 24 }, (_, index) => `Practice Test ${index + 1}`);
const expectedAcronyms = Array.from({ length: 10 }, (_, index) => `Acronyms ${index + 1}`);
const expectedSections = [...expectedPractice, ...expectedAcronyms];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

const deck = readJson(deckPath);
assert.deepEqual(Object.keys(deck), expectedSections, 'Security+ deck must contain exactly the 24 ExamCompass practice tests followed by 10 SY0-701 acronym quizzes');

let total = 0;
for (const section of expectedSections) {
  const cards = deck[section];
  assert.ok(Array.isArray(cards), `${section} must be a card array`);
  assert.ok(cards.length >= 5, `${section} must contain at least five scraped cards`);
  total += cards.length;
  for (const [index, card] of cards.entries()) {
    const context = `${section} card ${index + 1}`;
    assert.equal(typeof card.Q, 'string', `${context} must contain question text`);
    assert.ok(card.Q.trim(), `${context} question text must not be blank`);
    assert.ok(Array.isArray(card.A) && card.A.length > 0, `${context} must contain at least one correct answer`);
    assert.ok(Array.isArray(card.O) && card.O.length > 1, `${context} must contain answer choices`);
    assert.ok(card.A.every((answer) => card.O.includes(answer)), `${context} correct answers must appear in its choices`);
    assert.ok(['single_choice', 'multiple_choice', 'true_false'].includes(card.questionType), `${context} must declare a supported question type`);
  }
}
assert.ok(total >= 650, `Expected at least 650 cards across the requested 34 source quizzes, found ${total}`);

const menu = readJson(menuPath);
const security = menu.find((item) => item.name === testName);
assert.ok(security, `${testName} must remain present in menu.json`);
assert.equal(security.assetPath, 'Security+/', `${testName} must use the Security+ asset path`);
assert.equal(security.chapter.length, 2, `${testName} must expose only source-practice and acronym-quiz chapters`);
assert.deepEqual(
  security.chapter.map((chapter) => chapter.name),
  ['ExamCompass SY0-701 Practice Tests', 'ExamCompass SY0-701 Acronym Quizzes'],
  `${testName} chapter names must describe the exact scraped sources`,
);
assert.deepEqual(
  security.chapter.flatMap((chapter) => chapter.section.map((section) => section.name)),
  expectedSections,
  `${testName} menu sections must match the scraped source sections exactly`,
);
assert.ok(security.chapter.every((chapter) => chapter.file === 'examcompass-sy0-701-practice-tests.json'), `${testName} chapters must load the scraped-source deck`);

console.log(`Security+ ExamCompass source deck passed: ${total} cards across ${expectedPractice.length} practice tests and ${expectedAcronyms.length} acronym quizzes.`);
