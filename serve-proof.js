#!/usr/bin/env node
/**
 * Serves the investor proof page with live artifact data injected.
 * Usage: node serve-proof.js [port]
 * Default port: 8080
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.argv[2]) || 8080;
const ARTIFACTS = path.join(__dirname, 'artifacts-v2', 'provenance');

function loadJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ARTIFACTS, file), 'utf8'));
  } catch {
    return null;
  }
}

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    const chains = loadJSON('execution-chains.json') || [];
    const summary = loadJSON('demo-summary.json') || {};
    const connections = loadJSON('connections.json') || [];

    let html = fs.readFileSync(path.join(__dirname, 'investor-proof.html'), 'utf8');
    html = html.replace('CHAINS_PLACEHOLDER', JSON.stringify(chains));
    html = html.replace('SUMMARY_PLACEHOLDER', JSON.stringify(summary));
    html = html.replace('CONNECTIONS_PLACEHOLDER', JSON.stringify(connections));

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  } else if (req.url.startsWith('/api/chains')) {
    const chains = loadJSON('execution-chains.json') || [];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(chains, null, 2));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`Investor proof page: http://localhost:${PORT}`);
});
