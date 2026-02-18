#!/usr/bin/env node
/**
 * OpenExecution — AI Infrastructure Walkthrough Orchestrator
 *
 * Runs the full walkthrough 3 times (EN / ZH / JA), each with:
 *   - Custom dashboard.html (enterprise AI interface)
 *   - Real GLM-4-flash API calls for AI analysis + code review
 *   - Real GitHub operations (repo, issue, PR, merge)
 *   - Playwright recording with language-specific subtitles
 *   - Human authorization typed by Playwright
 *
 * Each run recreates the GitHub repo from scratch.
 *
 * Usage: node run-infra-walkthrough.js
 * Prereqs: .env with GITHUB_TOKEN, GLM_API_KEY
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// ── Load .env ──

const ENV_FILE = path.join(__dirname, '.env');
if (fs.existsSync(ENV_FILE)) {
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').replace(/\r/g, '').split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
  }
}

// ── Configuration ──

const PLAYWRIGHT_SCRIPT = path.join(__dirname, 'playwright-infra-walkthrough.js');
const LANGUAGES = ['en', 'zh', 'ja'];
const BASE_PORT = 4000;

// ── Helpers ──

function log(icon, msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`  [${ts}] ${icon} ${msg}`);
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


// ════════════════════════════════════════
//  MAIN
// ════════════════════════════════════════

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('  OPENEXECUTION — AI INFRASTRUCTURE WALKTHROUGH');
  console.log('  Dashboard + GLM-4-flash + GitHub + Multi-Language Recording');
  console.log('='.repeat(70) + '\n');

  // Verify credentials
  const githubToken = process.env.GITHUB_TOKEN || process.env.GITHUB_PAT;
  const glmKey = process.env.GLM_API_KEY;

  if (!githubToken) { console.error('  FATAL: GITHUB_TOKEN not found in .env'); process.exit(1); }
  if (!glmKey) { console.error('  FATAL: GLM_API_KEY not found in .env'); process.exit(1); }
  log('✓', 'Credentials loaded from .env');

  for (let i = 0; i < LANGUAGES.length; i++) {
    const lang = LANGUAGES[i];
    const port = BASE_PORT + i; // 4000, 4001, 4002 to avoid port conflicts
    const langLabel = { en: 'English', zh: '中文', ja: '日本語' }[lang];

    console.log('\n' + '-'.repeat(70));
    console.log(`  RECORDING ${i + 1}/${LANGUAGES.length}: ${langLabel} (${lang})`);
    console.log('-'.repeat(70) + '\n');

    log('▶', `Starting ${langLabel} recording (port ${port})...`);

    await runChild('node', [PLAYWRIGHT_SCRIPT], {
      DEMO_LANG: lang,
      DASH_PORT: String(port),
      GITHUB_TOKEN: githubToken,
      GLM_API_KEY: glmKey,
    });

    log('✓', `${langLabel} recording complete`);
  }


  // ─── SUMMARY ───
  console.log('\n' + '='.repeat(70));
  console.log('  WALKTHROUGH COMPLETE');
  console.log('='.repeat(70));

  console.log('\n  Recordings:');
  for (const lang of LANGUAGES) {
    const dir = path.join(__dirname, `recording-infra-${lang}`);
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      const pngs = files.filter(f => f.endsWith('.png'));
      const vids = files.filter(f => f.endsWith('.webm'));
      console.log(`    ${lang}: ${pngs.length} screenshots, ${vids.length} video(s) → recording-infra-${lang}/`);
    }
  }

  console.log('\n' + '='.repeat(70) + '\n');
}

main().catch(err => {
  console.error('\n  WALKTHROUGH FAILED:', err.message);
  process.exit(1);
});
