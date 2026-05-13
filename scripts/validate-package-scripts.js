#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const packagePath = path.join(root, 'package.json');

assert.ok(fs.existsSync(packagePath), 'package.json should provide discoverable validation entrypoints');

const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
assert.equal(pkg.private, true, 'package should be private to avoid accidental publication');
assert.equal(pkg.scripts?.test, 'npm run validate', 'npm test should run the full validation suite');
assert.match(pkg.scripts?.validate || '', /node scripts\/validate-package-scripts\.js/, 'validate script should include package script invariants');
assert.match(pkg.scripts?.validate || '', /node scripts\/validate-theme-selector\.js/, 'validate script should include theme source invariants');
assert.match(pkg.scripts?.validate || '', /node scripts\/validate-reset-progress\.js/, 'validate script should include reset progress invariants');
assert.match(pkg.scripts?.validate || '', /node scripts\/validate-deck-data\.js/, 'validate script should include deck/menu data invariants');
assert.match(pkg.scripts?.validate || '', /node scripts\/validate-export\.js/, 'validate script should include generated export invariants');
assert.match(pkg.scripts?.validate || '', /node scripts\/browser-smoke\.js/, 'validate script should include browser-level smoke coverage');
assert.equal(pkg.scripts?.['browser:smoke'], 'node scripts/browser-smoke.js', 'browser:smoke should run the headless browser smoke test directly');
assert.ok(fs.existsSync(path.join(root, 'scripts/browser-smoke.js')), 'browser smoke test script should exist');
assert.match(pkg.scripts?.validate || '', /hugo --minify/, 'validate script should include the Hugo production build');

console.log('Package script invariants passed.');
