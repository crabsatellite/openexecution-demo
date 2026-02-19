#!/usr/bin/env node
/**
 * OpenExecution — Pitch Deck Recording Orchestrator
 *
 * Records a walkthrough of the pitch deck in 3 languages (EN / ZH / JA).
 * For each language:
 *   1. Start Vite dev server with VITE_LANG set
 *   2. Wait for server to be ready
 *   3. Run playwright-pitch-deck.js
 *   4. Stop dev server
 *
 * Usage: node run-pitch-deck-recording.js [lang]
 *   - No args: records all 3 languages
 *   - With arg: records only that language (e.g., "en")
 *
 * Prereqs: pitch-deck node_modules installed, Playwright installed
 */

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const PITCH_DECK_DIR = path.join(__dirname, '..', 'pitch-deck');
const PLAYWRIGHT_SCRIPT = path.join(__dirname, 'playwright-pitch-deck.js');
const PORT = 5173;

const LANGUAGES = process.argv[2]
  ? [process.argv[2]]
  : ['en', 'zh', 'ja'];

// ── Helpers ──

function log(icon, msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`  [${ts}] ${icon} ${msg}`);
}

function waitForServer(url, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      http.get(url, (res) => {
        res.resume();
        if (res.statusCode < 400) return resolve();
        retry();
      }).on('error', retry);
    };
    const retry = () => {
      if (Date.now() - start > timeoutMs) {
        return reject(new Error(`Server not ready after ${timeoutMs}ms`));
      }
      setTimeout(check, 500);
    };
    check();
  });
}

function runChild(cmd, args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      env: { ...process.env, ...env },
      stdio: 'inherit',
      cwd: __dirname,
      shell: process.platform === 'win32',
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}`));
    });
    child.on('error', reject);
  });
}

// ── Main ──

async function main() {
  console.log('\n' + '═'.repeat(60));
  console.log('  OpenExecution — Pitch Deck Recording');
  console.log(`  Languages: ${LANGUAGES.join(', ').toUpperCase()}`);
  console.log('═'.repeat(60) + '\n');

  for (const lang of LANGUAGES) {
    console.log(`\n${'─'.repeat(50)}`);
    log('🌐', `Starting recording: ${lang.toUpperCase()}`);
    console.log(`${'─'.repeat(50)}`);

    // 1. Start Vite dev server
    log('🚀', `Starting Vite dev server (VITE_LANG=${lang})...`);
    const viteServer = spawn('npx', ['vite', '--port', String(PORT)], {
      cwd: PITCH_DECK_DIR,
      env: { ...process.env, VITE_LANG: lang },
      stdio: 'pipe',
      shell: process.platform === 'win32',
    });

    // Capture output for debugging
    viteServer.stdout.on('data', (d) => {
      const line = d.toString().trim();
      if (line) log('  ', line);
    });
    viteServer.stderr.on('data', (d) => {
      const line = d.toString().trim();
      if (line && !line.includes('ExperimentalWarning')) log('⚠️', line);
    });

    // 2. Wait for server
    log('⏳', `Waiting for server at http://localhost:${PORT}...`);
    try {
      await waitForServer(`http://localhost:${PORT}`, 30000);
    } catch {
      log('❌', 'Server failed to start');
      viteServer.kill();
      continue;
    }
    log('✅', 'Server ready');

    // 3. Run Playwright recording
    log('🎬', 'Running Playwright recording...');
    try {
      await runChild('node', [PLAYWRIGHT_SCRIPT], {
        DEMO_LANG: lang,
        PITCH_DECK_URL: `http://localhost:${PORT}`,
      });
      log('✅', `Recording complete for ${lang.toUpperCase()}`);
    } catch (err) {
      log('❌', `Recording failed for ${lang.toUpperCase()}: ${err.message}`);
    }

    // 4. Stop Vite server
    log('🛑', 'Stopping Vite server...');
    viteServer.kill('SIGTERM');
    // Give it a moment to shut down
    await new Promise(r => setTimeout(r, 2000));
    // Force kill if still running
    try { viteServer.kill('SIGKILL'); } catch {}
  }

  console.log('\n' + '═'.repeat(60));
  console.log('  ✅ All recordings complete');
  console.log('═'.repeat(60) + '\n');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
