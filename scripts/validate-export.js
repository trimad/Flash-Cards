#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const exportDir = path.join(root, 'docs');

const localReferencePattern = /\b(?:href|src)=(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi;
const htmlFiles = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      htmlFiles.push(fullPath);
    }
  }
}

function stripFragmentAndQuery(reference) {
  return reference.split('#')[0].split('?')[0];
}

function isExternalOrPageOnly(reference) {
  return (
    reference === '' ||
    reference.startsWith('#') ||
    /^[a-z][a-z0-9+.-]*:/i.test(reference) ||
    reference.startsWith('//')
  );
}

function resolveReference(fromFile, reference) {
  let cleanReference = stripFragmentAndQuery(reference);
  if (isExternalOrPageOnly(reference) || cleanReference === '') return null;

  // GitHub Pages builds use baseURL /Flash-Cards/. In the local docs export,
  // that URL prefix maps to the docs/ root rather than docs/Flash-Cards/.
  if (cleanReference.startsWith('/Flash-Cards/')) {
    cleanReference = cleanReference.slice('/Flash-Cards'.length);
  } else if (cleanReference === '/Flash-Cards') {
    cleanReference = '/';
  }

  const resolved = cleanReference.startsWith('/')
    ? path.join(exportDir, cleanReference)
    : path.resolve(path.dirname(fromFile), cleanReference);

  if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
    return path.join(resolved, 'index.html');
  }

  return resolved;
}

assert.ok(fs.existsSync(exportDir), 'docs export directory should exist');
walk(exportDir);

assert.ok(htmlFiles.length > 0, 'docs export should contain HTML files');

const requiredFiles = [
  'index.html',
  'css/flashcards.css',
  'js/theme-selector.js',
  'tests/index.html',
  'tests/a-plus-220-1001/index.html',
  'tests/a-plus-220-1002/index.html',
  'tests/network-plus/index.html',
  'tests/security-plus/index.html',
  'tests/early-reading/index.html',
];

for (const relativePath of requiredFiles) {
  const filePath = path.join(exportDir, relativePath);
  assert.ok(fs.existsSync(filePath), `docs export should include ${relativePath}`);
  assert.ok(fs.statSync(filePath).size > 0, `${relativePath} should not be empty`);
}

const missingReferences = [];
for (const htmlFile of htmlFiles) {
  const html = fs.readFileSync(htmlFile, 'utf8');
  for (const match of html.matchAll(localReferencePattern)) {
    const reference = match[1] || match[2] || match[3];
    const resolved = resolveReference(htmlFile, reference);
    if (!resolved) continue;
    if (!resolved.startsWith(exportDir + path.sep)) {
      missingReferences.push(`${path.relative(exportDir, htmlFile)} -> ${reference} escapes docs/`);
      continue;
    }
    if (!fs.existsSync(resolved)) {
      missingReferences.push(`${path.relative(exportDir, htmlFile)} -> ${reference} (${path.relative(exportDir, resolved)})`);
    }
  }
}

assert.deepEqual(missingReferences, [], 'all local href/src references in docs HTML should resolve inside docs/');

const home = fs.readFileSync(path.join(exportDir, 'index.html'), 'utf8');
assert.match(home, /Flash Cards/i, 'home export should contain the site title');
assert.match(home, /theme-selector/i, 'home export should include the theme selector control');
assert.match(home, /css\/flashcards\.css/i, 'home export should link the flashcards stylesheet');
assert.match(home, /js\/theme-selector\.js/i, 'home export should load the theme selector script');

console.log(`Export invariants passed for ${htmlFiles.length} HTML files.`);
