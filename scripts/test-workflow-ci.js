#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflowPath = path.resolve(__dirname, '..', '.github', 'workflows', 'deploy.yml');
const workflow = fs.readFileSync(workflowPath, 'utf8');

assert.match(workflow, /node-version:\s*["']22["']/, 'GitHub Actions should use the maintained Node 22 runtime');
assert.match(workflow, /- name: Install Node dependencies\s+run: npm ci/, 'GitHub Actions should install locked dependencies before validation');
assert.match(workflow, /- name: Validate and build site\s+run: npm test/, 'GitHub Actions should run the full validation suite after installing dependencies');

const installIndex = workflow.indexOf('run: npm ci');
const testIndex = workflow.indexOf('run: npm test');
assert.ok(installIndex >= 0 && installIndex < testIndex, 'npm ci must run before npm test');

console.log('GitHub Actions workflow invariants passed.');
