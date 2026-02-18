#!/usr/bin/env node
/**
 * OpenExecution — Platform Demo Orchestrator
 *
 * Sets up the full environment and launches the Playwright platform recording.
 *   1. Check prerequisites (Docker, PostgreSQL)
 *   2. Reset database + apply schemas
 *   3. Start API server (port 3001)
 *   4. Start Next.js frontend (port 3000)
 *   5. Run playwright-platform-demo.js (browser recording)
 *
 * Usage: node run-platform-demo.js
 * Prereqs: Docker Desktop running, Node.js, Playwright Chromium
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// ── Configuration ──

const API_DIR = path.join(__dirname, '..', 'openexecution-platform', 'api');
const WEB_DIR = path.join(__dirname, '..', 'openexecution-platform', 'web');
const SCHEMA_DIR = path.join(API_DIR, 'scripts');
const SOVEREIGN_SCHEMA_DIR = path.join(__dirname, '..', 'openexecution-sovereign', 'schema');
const PLAYWRIGHT_SCRIPT = path.join(__dirname, 'playwright-platform-demo.js');

// Use 127.0.0.1 for health checks (Node.js IPv6 resolution issue)
// Use localhost for Playwright (browser CORS compatibility)
const BASE_URL_INTERNAL = 'http://127.0.0.1:3001/api/v1';
const FRONTEND_URL_INTERNAL = 'http://127.0.0.1:3000';
const BASE_URL = 'http://localhost:3001/api/v1';
const FRONTEND_URL = 'http://localhost:3000';
const DB_URL = 'postgresql://postgres:postgres@localhost:5432/openexecution';

const SCHEMAS = [
  'schema-open.sql',
  'schema-sovereign.sql',
  'schema-spec.sql',
  '002-users.sql',
  '003-user-owned-connections.sql',
];

// ── Helpers ──

function log(icon, msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`  [${ts}] ${icon} ${msg}`);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function exec(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: 'pipe', ...opts });
  } catch (e) {
    if (!opts.ignoreError) {
      console.error(`  Command failed: ${cmd}`);
      console.error(`  ${e.stderr || e.message}`);
    }
    return null;
  }
}

async function healthCheck(url) {
  try {
    const res = await fetch(url);
    return res.status === 200;
  } catch { return false; }
}

// Track child processes for cleanup
const children = [];

function cleanup() {
  for (const child of children) {
    try { child.kill(); } catch { /* ignore */ }
  }
}

process.on('SIGINT', () => {
  console.log('\n  Shutting down...');
  cleanup();
  process.exit(0);
});

process.on('exit', cleanup);


// ════════════════════════════════════════
//  MAIN
// ════════════════════════════════════════

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('  OPENEXECUTION — PLATFORM DEMO');
  console.log('  Live platform recording with Playwright');
  console.log('='.repeat(70) + '\n');


  // ─── STEP 1: Check Prerequisites ───
  console.log('-'.repeat(70));
  console.log('  STEP 1: Check Prerequisites');
  console.log('-'.repeat(70));

  // Docker
  const dockerCheck = exec('docker ps --format "{{.Names}}" 2>/dev/null', { ignoreError: true });
  if (!dockerCheck) {
    console.error('  FATAL: Docker is not running. Start Docker Desktop first.');
    process.exit(1);
  }
  log('✓', 'Docker is running');

  // PostgreSQL container
  const runningContainers = dockerCheck.trim().split('\n');
  if (!runningContainers.includes('oe-postgres')) {
    const allContainers = exec('docker ps -a --format "{{.Names}}" 2>/dev/null', { ignoreError: true }) || '';
    if (allContainers.trim().split('\n').includes('oe-postgres')) {
      log('…', 'Starting existing oe-postgres container...');
      exec('docker start oe-postgres');
    } else {
      log('…', 'Creating oe-postgres container...');
      exec('docker run -d --name oe-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=openexecution -p 5432:5432 postgres:16-alpine');
    }
    await sleep(5000);
    log('✓', 'oe-postgres container started');
  } else {
    log('✓', 'oe-postgres container already running');
  }

  // Wait for PostgreSQL
  log('…', 'Waiting for PostgreSQL...');
  let pgReady = false;
  for (let i = 0; i < 15; i++) {
    const result = exec('docker exec oe-postgres pg_isready -U postgres 2>/dev/null', { ignoreError: true });
    if (result && result.includes('accepting connections')) {
      pgReady = true;
      break;
    }
    await sleep(1000);
  }
  if (!pgReady) {
    console.error('  FATAL: PostgreSQL not ready after 15 seconds.');
    process.exit(1);
  }
  log('✓', 'PostgreSQL accepting connections');


  // ─── STEP 2: Reset Database + Apply Schemas ───
  console.log('\n' + '-'.repeat(70));
  console.log('  STEP 2: Reset Database');
  console.log('-'.repeat(70));

  log('…', 'Dropping and recreating openexecution database...');
  exec(`docker exec oe-postgres psql -U postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'openexecution' AND pid <> pg_backend_pid();"`, { ignoreError: true });
  exec(`docker exec oe-postgres psql -U postgres -c "DROP DATABASE IF EXISTS openexecution;"`, { ignoreError: true });
  exec(`docker exec oe-postgres psql -U postgres -c "CREATE DATABASE openexecution;"`, { ignoreError: true });
  log('✓', 'Database recreated');

  log('…', 'Applying schemas...');
  for (const schemaFile of SCHEMAS) {
    let schemaPath = path.join(SCHEMA_DIR, schemaFile);
    if (!fs.existsSync(schemaPath)) {
      schemaPath = path.join(SOVEREIGN_SCHEMA_DIR, schemaFile);
    }
    if (!fs.existsSync(schemaPath)) {
      log('⚠', `Schema not found: ${schemaFile} — skipping`);
      continue;
    }
    try {
      const sql = fs.readFileSync(schemaPath, 'utf8');
      execSync('docker exec -i oe-postgres psql -U postgres -d openexecution', {
        input: sql,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 30000,
      });
    } catch { /* Ignore IF NOT EXISTS / duplicate errors */ }
    log('✓', `Applied: ${schemaFile}`);
  }

  // Verify provenance_certificates table
  const tableCheck = exec(`docker exec oe-postgres psql -U postgres -d openexecution -t -A -c "SELECT count(*) FROM pg_tables WHERE tablename = 'provenance_certificates';"`) || '0';
  if (tableCheck.trim() === '0') {
    log('⚠', 'provenance_certificates missing — creating...');
    const certSQL = `CREATE TABLE IF NOT EXISTS provenance_certificates (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), chain_id UUID NOT NULL REFERENCES execution_chains(id) UNIQUE, artifact_type VARCHAR(64) NOT NULL, artifact_ref VARCHAR(512) NOT NULL, artifact_title VARCHAR(500), certificate_data JSONB, chain_hash VARCHAR(64), certificate_signature VARCHAR(256), status VARCHAR(20) DEFAULT 'active', revocation_reason TEXT, revoked_at TIMESTAMP WITH TIME ZONE, superseded_by UUID REFERENCES provenance_certificates(id), issued_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(), created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()); CREATE INDEX IF NOT EXISTS idx_prov_certs_chain ON provenance_certificates(chain_id);`;
    exec(`docker exec oe-postgres psql -U postgres -d openexecution -c "${certSQL}"`);
    log('✓', 'provenance_certificates created');
  } else {
    log('✓', 'provenance_certificates verified');
  }


  // ─── STEP 3: Start API Server ───
  console.log('\n' + '-'.repeat(70));
  console.log('  STEP 3: Start API Server');
  console.log('-'.repeat(70));

  // Kill any existing API server
  try {
    exec('powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like \'*index.js*\' } | Stop-Process -Force"', { ignoreError: true });
  } catch { /* ignore */ }

  // Suppress Git credential prompts (Windows Git Credential Manager)
  const noGitEnv = { GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '', GCM_INTERACTIVE: 'never' };

  log('…', 'Starting API server on port 3001...');
  const apiServer = spawn('node', ['src/index.js'], {
    cwd: API_DIR,
    env: { ...process.env, ...noGitEnv, DATABASE_URL: DB_URL, PORT: '3001', NODE_ENV: 'development' },
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: false,
  });
  children.push(apiServer);

  apiServer.stdout.on('data', () => {});
  apiServer.stderr.on('data', () => {});

  // Wait for API health check
  let apiReady = false;
  for (let i = 0; i < 20; i++) {
    await sleep(1000);
    if (await healthCheck(`${BASE_URL_INTERNAL.replace('/api/v1', '')}/api/v1/health`)) {
      apiReady = true;
      break;
    }
  }
  if (!apiReady) {
    console.error('  FATAL: API server did not start within 20 seconds.');
    cleanup();
    process.exit(1);
  }
  log('✓', 'API server running at http://localhost:3001');


  // ─── STEP 4: Start Frontend ───
  console.log('\n' + '-'.repeat(70));
  console.log('  STEP 4: Start Frontend');
  console.log('-'.repeat(70));

  log('…', 'Starting Next.js frontend on port 3000...');
  const frontendServer = spawn('npx', ['next', 'dev', '-p', '3000'], {
    cwd: WEB_DIR,
    env: { ...process.env, ...noGitEnv, NEXT_PUBLIC_API_URL: 'http://localhost:3001/api/v1' },
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: true,
    detached: false,
  });
  children.push(frontendServer);

  frontendServer.stdout.on('data', () => {});
  frontendServer.stderr.on('data', () => {});

  // Wait for frontend
  let frontendReady = false;
  for (let i = 0; i < 45; i++) {
    await sleep(1000);
    if (await healthCheck(FRONTEND_URL_INTERNAL)) {
      frontendReady = true;
      break;
    }
  }
  if (!frontendReady) {
    console.error('  FATAL: Frontend did not start within 45 seconds.');
    cleanup();
    process.exit(1);
  }
  log('✓', 'Frontend running at http://localhost:3000');

  // Warm up Next.js compilation by pre-fetching key pages (with timeout)
  log('…', 'Warming up Next.js (compiling pages)...');
  const warmupPages = ['/auth/login', '/', '/dashboard/adapters', '/projects', '/dashboard/provenance', '/landing'];
  for (const p of warmupPages) {
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 30000);
      await fetch(`${FRONTEND_URL_INTERNAL}${p}`, { signal: ac.signal });
      clearTimeout(timer);
      log('✓', `Compiled: ${p}`);
    } catch { log('⚠', `Warm-up slow/failed: ${p} (will compile on demand)`); }
    await sleep(1000);
  }
  await sleep(2000);
  log('✓', 'Frontend warmed up');


  // ─── STEP 5: Run Playwright Recording ───
  console.log('\n' + '-'.repeat(70));
  console.log('  STEP 5: Run Platform Demo Recording');
  console.log('-'.repeat(70) + '\n');

  const playwright = spawn('node', [PLAYWRIGHT_SCRIPT], {
    cwd: __dirname,
    env: { ...process.env, ...noGitEnv, API_URL: BASE_URL, FRONTEND_URL },
    stdio: 'inherit',
    detached: false,
  });
  children.push(playwright);

  playwright.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`\n  Playwright exited with code ${code}`);
    }
    cleanup();
    process.exit(code || 0);
  });

  // Keep process alive
  await new Promise(() => {});
}

main().catch(err => {
  console.error('Platform demo failed:', err);
  cleanup();
  process.exit(1);
});
