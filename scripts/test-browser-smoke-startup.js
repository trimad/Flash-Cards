#!/usr/bin/env node
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');

const {
  DEFAULT_DEVTOOLS_STARTUP_TIMEOUT_MS,
  httpJson,
  waitForDevTools
} = require('./browser-smoke-transport');

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});

async function main() {
  assert.ok(
    DEFAULT_DEVTOOLS_STARTUP_TIMEOUT_MS >= 30_000,
    `DevTools startup timeout should tolerate a slow hosted CI runner; got ${DEFAULT_DEVTOOLS_STARTUP_TIMEOUT_MS}ms`
  );

  const port = await freePort();
  let server;
  let attempts = 0;

  const startServer = new Promise((resolve, reject) => {
    setTimeout(() => {
      server = http.createServer((request, response) => {
        assert.equal(request.url, '/json/version');
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ Browser: 'Smoke Test Chrome' }));
      });
      server.once('error', reject);
      server.listen(port, '127.0.0.1', resolve);
    }, 350);
  });

  try {
    const version = await waitForDevTools({
      port,
      request: async () => {
        attempts += 1;
        return httpJson(port, '/json/version', 'GET', 100);
      },
      timeoutMs: 2_000,
      retryDelayMs: 25
    });

    await startServer;
    assert.equal(version.Browser, 'Smoke Test Chrome');
    assert.ok(attempts > 1, `expected retry behavior before DevTools became available; attempts=${attempts}`);
    console.log('Browser DevTools startup retry test passed.');
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
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
