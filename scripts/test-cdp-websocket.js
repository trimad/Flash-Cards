#!/usr/bin/env node
const assert = require('node:assert/strict');

const { getWebSocketConstructor } = require('./cdp-websocket');

const originalWebSocket = globalThis.WebSocket;

try {
  globalThis.WebSocket = undefined;
  const WebSocketConstructor = getWebSocketConstructor();
  assert.equal(typeof WebSocketConstructor, 'function', 'the CDP client needs a WebSocket implementation when Node does not expose a global WebSocket');
  assert.equal(typeof WebSocketConstructor.prototype.send, 'function', 'the WebSocket fallback should support CDP messages');
  console.log('CDP WebSocket compatibility test passed.');
} finally {
  globalThis.WebSocket = originalWebSocket;
}
