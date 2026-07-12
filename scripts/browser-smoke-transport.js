const http = require('node:http');

const DEFAULT_DEVTOOLS_STARTUP_TIMEOUT_MS = 30_000;
const DEFAULT_DEVTOOLS_REQUEST_TIMEOUT_MS = 2_000;
const DEFAULT_RETRY_DELAY_MS = 100;

function httpJson(port, requestPath, method = 'GET', timeoutMs = DEFAULT_DEVTOOLS_REQUEST_TIMEOUT_MS) {
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

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`DevTools HTTP request timed out after ${timeoutMs}ms`));
    });
    request.on('error', reject);
    request.end();
  });
}

async function waitForDevTools({
  port,
  request = () => httpJson(port, '/json/version'),
  timeoutMs = DEFAULT_DEVTOOLS_STARTUP_TIMEOUT_MS,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  abortError = () => null
}) {
  const started = Date.now();
  let lastError;

  while (Date.now() - started < timeoutMs) {
    const abort = abortError();
    if (abort) {
      throw abort;
    }

    try {
      return await request();
    } catch (error) {
      lastError = error;
      const remainingMs = timeoutMs - (Date.now() - started);
      if (remainingMs > 0) {
        await delay(Math.min(retryDelayMs, remainingMs));
      }
    }
  }

  const detail = lastError ? ` Last DevTools error: ${lastError.message}` : '';
  throw new Error(`Timed out waiting for Chrome DevTools after ${timeoutMs}ms.${detail}`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  DEFAULT_DEVTOOLS_STARTUP_TIMEOUT_MS,
  httpJson,
  waitForDevTools
};
