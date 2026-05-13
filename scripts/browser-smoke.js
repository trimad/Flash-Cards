#!/usr/bin/env node
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const docsDir = path.join(root, 'docs');
const pagesPrefix = '/Flash-Cards';
const themeStorageKey = 'flashcards.evangelionTheme';
const progressStorageKey = 'flash-cards:network-plus:progress:v1';

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});

async function main() {
  assert.ok(fs.existsSync(path.join(docsDir, 'index.html')), 'docs/index.html should exist; run hugo --minify before browser smoke tests');

  const server = await startStaticServer(docsDir);
  const origin = `http://127.0.0.1:${server.address().port}`;
  const chrome = await startChrome();

  try {
    const client = await openPageClient(chrome.debugPort);
    await client.send('Page.enable');
    await client.send('Runtime.enable');

    await smokeThemeSelector(client, `${origin}${pagesPrefix}/`);
    await smokeResetProgress(client, `${origin}${pagesPrefix}/tests/network-plus/`);

    await client.close();
    console.log('Browser smoke checks passed for theme selector and reset progress.');
  } finally {
    await closeServer(server);
    await stopChrome(chrome);
  }
}

async function smokeThemeSelector(client, url) {
  await navigate(client, url);
  await waitFor(client, 'document.readyState === "complete"', 'home page to finish loading');

  const initial = await evaluate(client, `(() => {
    const opener = document.querySelector('[data-theme-settings-button]');
    const dialog = document.querySelector('[data-theme-dialog]');
    const backdrop = document.querySelector('[data-theme-dialog-backdrop]');
    return {
      theme: document.documentElement.dataset.theme,
      openerExpanded: opener?.getAttribute('aria-expanded'),
      dialogHidden: dialog?.hidden,
      dialogDisplay: dialog ? getComputedStyle(dialog).display : null,
      backdropHidden: backdrop?.hidden,
      choices: Array.from(document.querySelectorAll('[data-theme-choice]')).map((button) => ({
        theme: button.dataset.themeChoice,
        pressed: button.getAttribute('aria-pressed')
      }))
    };
  })()`);

  assert.equal(initial.theme, 'nerv', 'home page should start with the NERV theme');
  assert.equal(initial.openerExpanded, 'false', 'settings button should start collapsed');
  assert.equal(initial.dialogHidden, true, 'theme dialog should start hidden');
  assert.equal(initial.dialogDisplay, 'none', 'hidden theme dialog should compute to display:none');
  assert.equal(initial.backdropHidden, true, 'theme backdrop should start hidden');
  assert.deepEqual(
    initial.choices.map((choice) => choice.theme).sort(),
    ['asuka', 'nerv', 'rei', 'shinji'],
    'theme choices should include all Evangelion palettes'
  );

  const afterSelection = await evaluate(client, `(() => {
    document.querySelector('[data-theme-settings-button]').click();
    const openState = {
      openerExpanded: document.querySelector('[data-theme-settings-button]').getAttribute('aria-expanded'),
      dialogHidden: document.querySelector('[data-theme-dialog]').hidden,
      dialogDisplay: getComputedStyle(document.querySelector('[data-theme-dialog]')).display
    };
    document.querySelector('[data-theme-choice="asuka"]').click();
    document.querySelector('[data-theme-dialog-close]').click();
    return {
      openState,
      theme: document.documentElement.dataset.theme,
      storedTheme: localStorage.getItem(${JSON.stringify(themeStorageKey)}),
      asukaPressed: document.querySelector('[data-theme-choice="asuka"]').getAttribute('aria-pressed'),
      nervPressed: document.querySelector('[data-theme-choice="nerv"]').getAttribute('aria-pressed'),
      openerExpanded: document.querySelector('[data-theme-settings-button]').getAttribute('aria-expanded'),
      dialogHidden: document.querySelector('[data-theme-dialog]').hidden
    };
  })()`);

  assert.equal(afterSelection.openState.openerExpanded, 'true', 'settings button should expand when the dialog opens');
  assert.equal(afterSelection.openState.dialogHidden, false, 'theme dialog should be visible after opening');
  assert.notEqual(afterSelection.openState.dialogDisplay, 'none', 'open theme dialog should be displayed');
  assert.equal(afterSelection.theme, 'asuka', 'clicking Asuka should apply the Asuka theme');
  assert.equal(afterSelection.storedTheme, 'asuka', 'selected theme should persist to localStorage');
  assert.equal(afterSelection.asukaPressed, 'true', 'selected theme button should be pressed');
  assert.equal(afterSelection.nervPressed, 'false', 'previous theme button should no longer be pressed');
  assert.equal(afterSelection.openerExpanded, 'false', 'settings button should collapse when the dialog closes');
  assert.equal(afterSelection.dialogHidden, true, 'theme dialog should close via the close button');

  await navigate(client, url);
  await waitFor(client, `document.documentElement.dataset.theme === 'asuka'`, 'stored Asuka theme to apply after reload');
}

async function smokeResetProgress(client, url) {
  await navigate(client, url);
  await waitFor(
    client,
    `document.readyState === 'complete' && document.querySelector('#card-front') && !document.querySelector('#card-front').textContent.includes('Loading')`,
    'Network+ deck cards to load'
  );

  const resetState = await evaluate(client, `(() => {
    localStorage.setItem(${JSON.stringify(progressStorageKey)}, JSON.stringify({
      sections: {
        smoke: {
          seen: { 0: true },
          selfGrades: { 0: true },
          quizzes: { 0: { selected: ['fixture'], graded: true, correct: false, attempts: 1 } }
        }
      }
    }));
    window.confirm = () => true;
    document.querySelector('[data-theme-settings-button]').click();
    document.querySelector('[data-reset-progress]').click();
    return {
      storedProgress: localStorage.getItem(${JSON.stringify(progressStorageKey)}),
      status: document.querySelector('[data-reset-progress-status]').textContent,
      cardText: document.querySelector('#card-front').textContent,
      dialogHidden: document.querySelector('[data-theme-dialog]').hidden
    };
  })()`);

  assert.equal(resetState.storedProgress, null, 'reset progress should remove only the current deck progress key');
  assert.match(resetState.status, /Progress reset for this deck\./, 'reset progress should announce completion');
  assert.ok(resetState.cardText.trim().length > 0, 'deck should still render a visible card after reset');
  assert.equal(resetState.dialogHidden, false, 'reset action should be reachable inside the settings dialog');
}

async function navigate(client, url) {
  await client.send('Page.navigate', { url });
}

async function waitFor(client, expression, description, timeoutMs = 8000) {
  const started = Date.now();
  let lastValue;

  while (Date.now() - started < timeoutMs) {
    lastValue = await evaluate(client, `Boolean(${expression})`);
    if (lastValue === true) {
      return;
    }
    await delay(100);
  }

  throw new Error(`Timed out waiting for ${description}; last value: ${JSON.stringify(lastValue)}`);
}

async function evaluate(client, expression) {
  const response = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  });

  if (response.exceptionDetails) {
    throw new Error(`Browser evaluation failed: ${response.exceptionDetails.text}`);
  }

  return response.result ? response.result.value : undefined;
}

async function startStaticServer(directory) {
  const server = http.createServer((request, response) => {
    try {
      const requestUrl = new URL(request.url, 'http://127.0.0.1');
      let pathname = decodeURIComponent(requestUrl.pathname);

      if (pathname === pagesPrefix || pathname.startsWith(`${pagesPrefix}/`)) {
        pathname = pathname.slice(pagesPrefix.length) || '/';
      }

      if (pathname.endsWith('/')) {
        pathname += 'index.html';
      }

      const normalizedPath = path.normalize(pathname).replace(/^([/\\])+/, '');
      const filePath = path.join(directory, normalizedPath);
      const relative = path.relative(directory, filePath);

      if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('not found');
        return;
      }

      response.writeHead(200, { 'content-type': contentType(filePath) });
      fs.createReadStream(filePath).pipe(response);
    } catch (error) {
      response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      response.end(String(error && error.stack ? error.stack : error));
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  return server;
}

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.mp3': 'audio/mpeg',
    '.pdf': 'application/pdf',
    '.svg': 'image/svg+xml',
    '.wav': 'audio/wav',
    '.xml': 'application/xml; charset=utf-8'
  }[extension] || 'application/octet-stream';
}

async function startChrome() {
  const executable = findChromeExecutable();
  const debugPort = await freePort();
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flash-cards-browser-smoke-'));
  const chrome = childProcess.spawn(executable, [
    '--headless=new',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-sandbox',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profileDir}`,
    'about:blank'
  ], {
    stdio: ['ignore', 'ignore', 'pipe']
  });

  let stderr = '';
  chrome.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  chrome.profileDir = profileDir;
  chrome.debugPort = debugPort;
  chrome.stderrText = () => stderr;

  await waitForChrome(debugPort, chrome);
  return chrome;
}

function findChromeExecutable() {
  const candidates = [
    process.env.CHROME_BIN,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ].filter(Boolean);

  const executable = candidates.find((candidate) => fs.existsSync(candidate));
  assert.ok(executable, 'google-chrome or chromium is required for browser smoke tests');
  return executable;
}

async function waitForChrome(port, chrome) {
  const started = Date.now();

  while (Date.now() - started < 8000) {
    if (chrome.exitCode !== null) {
      throw new Error(`Chrome exited early with code ${chrome.exitCode}: ${chrome.stderrText()}`);
    }

    try {
      await httpJson(port, '/json/version');
      return;
    } catch (error) {
      await delay(100);
    }
  }

  throw new Error(`Timed out waiting for Chrome DevTools: ${chrome.stderrText()}`);
}

async function openPageClient(port) {
  const targets = await httpJson(port, '/json');
  let target = targets.find((item) => item.type === 'page' && item.webSocketDebuggerUrl);

  if (!target) {
    target = await httpJson(port, `/json/new?${encodeURIComponent('about:blank')}`, 'PUT');
  }

  assert.ok(target.webSocketDebuggerUrl, 'Chrome should expose a page WebSocket debugger URL');
  return new CdpClient(target.webSocketDebuggerUrl);
}

function httpJson(port, requestPath, method = 'GET') {
  return new Promise((resolve, reject) => {
    const request = http.request({ hostname: '127.0.0.1', port, path: requestPath, method }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`DevTools HTTP ${response.statusCode}: ${body}`));
          return;
        }

        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });

    request.on('error', reject);
    request.end();
  });
}

class CdpClient {
  constructor(webSocketUrl) {
    this.nextId = 1;
    this.pending = new Map();
    this.socket = new WebSocket(webSocketUrl);
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => this.handleMessage(event));
    this.socket.addEventListener('close', () => {
      for (const { reject } of this.pending.values()) {
        reject(new Error('Chrome DevTools WebSocket closed'));
      }
      this.pending.clear();
    });
  }

  async send(method, params = {}) {
    await this.ready;
    const id = this.nextId++;
    const message = JSON.stringify({ id, method, params });

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(message);
    });
  }

  handleMessage(event) {
    const message = JSON.parse(event.data);
    if (!message.id || !this.pending.has(message.id)) {
      return;
    }

    const pending = this.pending.get(message.id);
    this.pending.delete(message.id);

    if (message.error) {
      pending.reject(new Error(`${message.error.message}: ${message.error.data || ''}`));
    } else {
      pending.resolve(message.result || {});
    }
  }

  async close() {
    await this.ready;
    this.socket.close();
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

async function stopChrome(chrome) {
  const waitForExit = () => new Promise((resolve) => chrome.once('exit', resolve));

  if (chrome.exitCode === null) {
    chrome.kill('SIGTERM');
    const exitedAfterTerm = await Promise.race([
      waitForExit().then(() => true),
      delay(2000).then(() => false)
    ]);

    if (!exitedAfterTerm && chrome.exitCode === null) {
      chrome.kill('SIGKILL');
      await Promise.race([
        waitForExit(),
        delay(2000)
      ]);
    }
  }

  if (chrome.profileDir) {
    // Chromium can keep profile files open for a short moment after the main
    // process exits. Retry ENOTEMPTY/EBUSY cleanup instead of failing a passed
    // smoke test during teardown.
    for (let attempt = 1; attempt <= 20; attempt += 1) {
      try {
        fs.rmSync(chrome.profileDir, {
          recursive: true,
          force: true,
          maxRetries: 5,
          retryDelay: 100
        });
        break;
      } catch (error) {
        if (attempt === 20 || !['ENOTEMPTY', 'EBUSY', 'EPERM'].includes(error.code)) {
          throw error;
        }
        await delay(250);
      }
    }
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
