function getWebSocketConstructor() {
  return globalThis.WebSocket || require('ws');
}

module.exports = { getWebSocketConstructor };
