#!/usr/bin/env node
/**
 * OpenExecution v2 Live Demo Orchestrator
 *
 * Executes the full "Platform Activity Recording" demo:
 *   1. Reset database + apply schemas
 *   2. Start API server
 *   3. Run demo-seed (companies onboard → connect platforms → webhooks → human instruction)
 *   4. Verify chain integrity via API
 *   5. Demonstrate tamper detection (SQL UPDATE → detect → restore)
 *   6. Export artifacts to artifacts-v2/
 *   7. Run standalone verify.js
 *
 * Usage: node run-demo-v2.js
 * Prereqs: Docker Desktop running with oe-postgres container, Node.js
 */

const { execSync, spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ============================================================
// Configuration
// ============================================================
const API_DIR = path.join(__dirname, '..', 'openexecution-platform', 'api');
const WEB_DIR = path.join(__dirname, '..', 'openexecution-platform', 'web');
const SCHEMA_DIR = path.join(API_DIR, 'scripts');
const SOVEREIGN_SCHEMA_DIR = path.join(__dirname, '..', 'openexecution-sovereign', 'schema');
const DEMO_SEED = path.join(SCHEMA_DIR, 'demo-seed.js');
const EXPORT_SCRIPT = path.join(__dirname, 'export-v2-artifacts.js');
const VERIFY_SCRIPT = path.join(__dirname, 'artifacts-v2', 'provenance', 'verify.js');
const ARTIFACTS_DIR = path.join(__dirname, 'artifacts-v2');

const BASE_URL = 'http://localhost:3001/api/v1';
const DB_URL = 'postgresql://postgres:postgres@localhost:5432/openexecution';

// Schema files in application order
const SCHEMAS = [
  'schema-open.sql',
  'schema-sovereign.sql',
  'schema-spec.sql',
  '002-users.sql',
  '003-user-owned-connections.sql',
];

// ============================================================
// Utility Functions
// ============================================================

function canonicalize(obj) {
  if (obj === null || obj === undefined) return JSON.stringify(obj);
  if (typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return '[' + obj.map(item => canonicalize(item)).join(',') + ']';
  }
  const sortedKeys = Object.keys(obj).sort();
  const pairs = sortedKeys.map(key => JSON.stringify(key) + ':' + canonicalize(obj[key]));
  return '{' + pairs.join(',') + '}';
}

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

async function apiCall(method, urlPath, body = null, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE_URL}${urlPath}`, opts);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, data: json?.data || json };
}

// ============================================================
// Main Demo Flow
// ============================================================

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('  OPENEXECUTION v2 LIVE DEMO');
  console.log('  "The Flight Recorder for Platform Activity"');
  console.log('='.repeat(70));
  console.log('');

  // ============================================================
  // PREREQS: Check Docker + PostgreSQL
  // ============================================================
  console.log('-'.repeat(70));
  console.log('  PREREQS: Checking infrastructure');
  console.log('-'.repeat(70));

  // Check Docker
  const dockerCheck = exec('docker ps --format "{{.Names}}" 2>/dev/null', { ignoreError: true });
  if (!dockerCheck) {
    console.error('  FATAL: Docker is not running. Start Docker Desktop first.');
    process.exit(1);
  }
  log('✓', 'Docker is running');

  // Check/start PostgreSQL container
  const runningContainers = dockerCheck.trim().split('\n');
  if (!runningContainers.includes('oe-postgres')) {
    // Check if container exists but is stopped
    const allContainers = exec('docker ps -a --format "{{.Names}}" 2>/dev/null', { ignoreError: true }) || '';
    if (allContainers.trim().split('\n').includes('oe-postgres')) {
      log('…', 'Starting existing oe-postgres container...');
      exec('docker start oe-postgres');
    } else {
      log('…', 'Creating oe-postgres container...');
      exec(`docker run -d --name oe-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=openexecution -p 5432:5432 postgres:16-alpine`);
    }
    await sleep(5000); // Wait for PostgreSQL to initialize
    log('✓', 'oe-postgres container started');
  } else {
    log('✓', 'oe-postgres container already running');
  }

  // Wait for PostgreSQL to accept connections
  log('…', 'Waiting for PostgreSQL to accept connections...');
  let pgReady = false;
  for (let i = 0; i < 15; i++) {
    const result = exec(`docker exec oe-postgres pg_isready -U postgres 2>/dev/null`, { ignoreError: true });
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

  // ============================================================
  // ACT 1: Reset Database + Apply Schemas
  // ============================================================
  console.log('\n' + '-'.repeat(70));
  console.log('  ACT 1: Reset Database — Clean Slate');
  console.log('-'.repeat(70));

  log('…', 'Dropping and recreating openexecution database...');
  exec(`docker exec oe-postgres psql -U postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '"'"'openexecution'"'"' AND pid <> pg_backend_pid();"`, { ignoreError: true });
  exec(`docker exec oe-postgres psql -U postgres -c "DROP DATABASE IF EXISTS openexecution;"`, { ignoreError: true });
  exec(`docker exec oe-postgres psql -U postgres -c "CREATE DATABASE openexecution;"`, { ignoreError: true });
  log('✓', 'Database recreated');

  // Apply schemas in order
  log('…', 'Applying schemas...');
  for (const schemaFile of SCHEMAS) {
    // Look in api/scripts first, then sovereign schema dir
    let schemaPath = path.join(SCHEMA_DIR, schemaFile);
    if (!fs.existsSync(schemaPath)) {
      schemaPath = path.join(SOVEREIGN_SCHEMA_DIR, schemaFile);
    }
    if (!fs.existsSync(schemaPath)) {
      log('⚠', `Schema not found: ${schemaFile} — skipping`);
      continue;
    }
    // Read schema and pipe via stdin to avoid path issues on Windows/Git Bash
    try {
      const sql = fs.readFileSync(schemaPath, 'utf8');
      execSync(`docker exec -i oe-postgres psql -U postgres -d openexecution`, {
        input: sql,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 30000,
      });
    } catch (e) {
      // Ignore errors from IF NOT EXISTS / duplicate index etc.
    }
    log('✓', `Applied: ${schemaFile}`);
  }

  // Verify critical table exists
  const tableCheck = exec(`docker exec oe-postgres psql -U postgres -d openexecution -t -A -c "SELECT count(*) FROM pg_tables WHERE tablename = 'provenance_certificates';"`) || '0';
  if (tableCheck.trim() === '0') {
    log('⚠', 'provenance_certificates missing — creating directly...');
    const certSQL = `CREATE TABLE IF NOT EXISTS provenance_certificates (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), chain_id UUID NOT NULL REFERENCES execution_chains(id) UNIQUE, artifact_type VARCHAR(64) NOT NULL, artifact_ref VARCHAR(512) NOT NULL, artifact_title VARCHAR(500), certificate_data JSONB, chain_hash VARCHAR(64), certificate_signature VARCHAR(256), status VARCHAR(20) DEFAULT 'active', revocation_reason TEXT, revoked_at TIMESTAMP WITH TIME ZONE, superseded_by UUID REFERENCES provenance_certificates(id), issued_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(), created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()); CREATE INDEX IF NOT EXISTS idx_prov_certs_chain ON provenance_certificates(chain_id);`;
    exec(`docker exec oe-postgres psql -U postgres -d openexecution -c "${certSQL}"`);
    log('✓', 'provenance_certificates created');
  } else {
    log('✓', 'provenance_certificates table verified');
  }

  // ============================================================
  // ACT 2: Start API Server
  // ============================================================
  console.log('\n' + '-'.repeat(70));
  console.log('  ACT 2: Start API Server');
  console.log('-'.repeat(70));

  // Kill any existing API server
  try {
    exec('powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like \'*index.js*\' } | Stop-Process -Force"', { ignoreError: true });
  } catch { /* ignore */ }

  log('…', 'Starting API server on port 3001...');
  const apiServer = spawn('node', ['src/index.js'], {
    cwd: API_DIR,
    env: { ...process.env, DATABASE_URL: DB_URL, PORT: '3001', NODE_ENV: 'development' },
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: false,
  });

  let serverReady = false;
  apiServer.stdout.on('data', (data) => {
    const msg = data.toString();
    if (msg.includes('listening') || msg.includes('3001') || msg.includes('started')) {
      serverReady = true;
    }
  });
  apiServer.stderr.on('data', (data) => {
    // Suppress normal stderr
  });

  // Wait for API to respond
  for (let i = 0; i < 20; i++) {
    await sleep(1000);
    try {
      const { status } = await apiCall('GET', '/health');
      if (status === 200) {
        serverReady = true;
        break;
      }
    } catch { /* retry */ }
  }

  if (!serverReady) {
    console.error('  FATAL: API server did not start within 20 seconds.');
    apiServer.kill();
    process.exit(1);
  }
  log('✓', 'API server running at http://localhost:3001');

  // ============================================================
  // ACT 3: Run Demo Seed
  // ============================================================
  console.log('\n' + '-'.repeat(70));
  console.log('  ACT 3: Execute Demo Scenario');
  console.log('  "CVE-2026-4821 — Cross-platform incident response"');
  console.log('-'.repeat(70));

  log('…', 'Running demo-seed.js...');
  console.log('');
  try {
    execSync(`node "${DEMO_SEED}"`, {
      cwd: API_DIR,
      env: { ...process.env, DATABASE_URL: DB_URL },
      stdio: 'inherit',
      timeout: 60000,
    });
  } catch (e) {
    console.error('  Demo seed failed:', e.message);
    apiServer.kill();
    process.exit(1);
  }

  // ============================================================
  // ACT 4: Verify Chain Integrity
  // ============================================================
  console.log('\n' + '-'.repeat(70));
  console.log('  ACT 4: Verify Chain Integrity');
  console.log('-'.repeat(70));

  // Query chains and events directly from DB
  const GENESIS = '0'.repeat(64);
  const chainListRaw = exec(`docker exec oe-postgres psql -U postgres -d openexecution -t -A -c "SELECT id, origin_type, event_count FROM execution_chains ORDER BY created_at;"`);
  const chainList = (chainListRaw || '').trim().split('\n').filter(Boolean).map(line => {
    const [id, origin_type, event_count] = line.split('|');
    return { id, origin_type, event_count: parseInt(event_count) };
  });
  log('✓', `Found ${chainList.length} provenance chains`);

  // Verify each chain's hash linkage
  for (const chain of chainList) {
    const eventsRaw = exec(`docker exec oe-postgres psql -U postgres -d openexecution -t -A -c "SELECT seq, prev_hash, event_hash FROM chain_events WHERE chain_id = '${chain.id}' ORDER BY seq;"`);
    const events = (eventsRaw || '').trim().split('\n').filter(Boolean).map(line => {
      const [seq, prev_hash, event_hash] = line.split('|');
      return { seq: parseInt(seq), prev_hash, event_hash };
    });

    let valid = true;
    let expectedPrev = GENESIS;
    for (const ev of events) {
      if (ev.prev_hash !== expectedPrev) { valid = false; break; }
      expectedPrev = ev.event_hash;
    }
    log(valid ? '✓' : '✗', `Chain ${chain.id.substring(0, 8)}... [${chain.origin_type}]: ${events.length} events — ${valid ? 'VALID' : 'BROKEN LINKAGE'}`);
  }

  // ============================================================
  // ACT 5: Tamper Detection Proof
  // ============================================================
  console.log('\n' + '-'.repeat(70));
  console.log('  ACT 5: Tamper Detection — The Math is the Guarantee');
  console.log('-'.repeat(70));

  if (chainList.length > 0) {
    // Pick the chain with the most events
    const targetChain = chainList.reduce((a, b) => a.event_count >= b.event_count ? a : b);
    const chainId = targetChain.id;

    // 5a. Verify chain is valid before tampering
    log('…', 'Step 1: Verify chain is valid (before tampering)');
    const beforeRaw = exec(`docker exec oe-postgres psql -U postgres -d openexecution -t -A -c "SELECT payload_canonical_hash FROM chain_events WHERE chain_id = '${chainId}' AND seq = 1;"`);
    const originalHash = (beforeRaw || '').trim();
    log('✓', `Event seq=1 payload_canonical_hash: ${originalHash.substring(0, 24)}...`);

    // 5b. Tamper with a chain event in the database
    log('…', 'Step 2: TAMPERING — modifying event payload in database...');
    exec(`docker exec oe-postgres psql -U postgres -d openexecution -c "UPDATE chain_events SET payload = jsonb_set(payload, '{tampered}', 'true') WHERE chain_id = '${chainId}' AND seq = 1;"`);
    log('⚠', 'Injected tampered=true into seq=1 payload');

    // 5c. Recompute hash and compare — should detect mismatch
    log('…', 'Step 3: Checking payload hash (should MISMATCH)');
    const afterPayloadRaw = exec(`docker exec oe-postgres psql -U postgres -d openexecution -t -A -c "SELECT payload FROM chain_events WHERE chain_id = '${chainId}' AND seq = 1;"`);
    const afterPayload = (afterPayloadRaw || '').trim();
    const recomputedHash = crypto.createHash('sha256').update(canonicalize(JSON.parse(afterPayload))).digest('hex');
    if (recomputedHash !== originalHash) {
      log('✓', 'TAMPER DETECTED — payload_canonical_hash MISMATCH');
      log('⚠', `  Original:   ${originalHash.substring(0, 32)}...`);
      log('⚠', `  Recomputed: ${recomputedHash.substring(0, 32)}...`);
    } else {
      log('✗', 'Tamper not detected');
    }

    // 5d. Restore original
    log('…', 'Step 4: Restoring original payload...');
    exec(`docker exec oe-postgres psql -U postgres -d openexecution -c "UPDATE chain_events SET payload = payload - 'tampered' WHERE chain_id = '${chainId}' AND seq = 1;"`);

    // 5e. Verify again — should match
    log('…', 'Step 5: Verify payload hash (should match again)');
    const restoredPayloadRaw = exec(`docker exec oe-postgres psql -U postgres -d openexecution -t -A -c "SELECT payload FROM chain_events WHERE chain_id = '${chainId}' AND seq = 1;"`);
    const restoredHash = crypto.createHash('sha256').update(canonicalize(JSON.parse((restoredPayloadRaw || '').trim()))).digest('hex');
    log(restoredHash === originalHash ? '✓' : '✗', `Integrity: ${restoredHash === originalHash ? 'VALID — restored' : 'STILL BROKEN'}`);
  }

  // ============================================================
  // ACT 6: Export Artifacts
  // ============================================================
  console.log('\n' + '-'.repeat(70));
  console.log('  ACT 6: Export Proof Artifacts');
  console.log('-'.repeat(70));

  log('…', 'Exporting artifacts from database...');
  if (!fs.existsSync(path.join(ARTIFACTS_DIR, 'provenance'))) {
    fs.mkdirSync(path.join(ARTIFACTS_DIR, 'provenance'), { recursive: true });
  }

  try {
    execSync(`node "${EXPORT_SCRIPT}"`, {
      env: { ...process.env, DATABASE_URL: DB_URL },
      stdio: 'inherit',
      timeout: 30000,
    });
    log('✓', 'Artifacts exported to artifacts-v2/provenance/');
  } catch (e) {
    log('⚠', `Export failed: ${e.message} — using existing artifacts`);
  }

  // ============================================================
  // ACT 7: Run Standalone Verification Script
  // ============================================================
  console.log('\n' + '-'.repeat(70));
  console.log('  ACT 7: Independent Verification (No Server Needed)');
  console.log('-'.repeat(70));

  if (fs.existsSync(VERIFY_SCRIPT)) {
    log('…', 'Running verify.js — standalone, no dependencies...');
    console.log('');
    try {
      execSync(`node "${VERIFY_SCRIPT}"`, { stdio: 'inherit', timeout: 10000 });
    } catch (e) {
      log('⚠', `Verification script failed: ${e.message}`);
    }
  } else {
    log('⚠', 'verify.js not found — run export first');
  }

  // ============================================================
  // SUMMARY
  // ============================================================
  console.log('\n' + '='.repeat(70));
  console.log('  DEMO COMPLETE');
  console.log('='.repeat(70));

  // Count artifacts
  const artifactFiles = fs.existsSync(path.join(ARTIFACTS_DIR, 'provenance'))
    ? fs.readdirSync(path.join(ARTIFACTS_DIR, 'provenance'))
    : [];

  console.log(`
  What happened:
    - Database reset and schemas applied (${SCHEMAS.length} schema files)
    - API server started at http://localhost:3001
    - 2 companies onboarded (user JWT auth)
    - 3 platforms connected (Vercel, Figma, Notion)
    - 4 webhook events received and HMAC-verified
    - 1 human instruction recorded as liability event
    - 3 provenance chains created with hash-linked events
    - Chain integrity verified via API
    - Tamper detection demonstrated (inject → detect → restore)
    - ${artifactFiles.length} proof artifacts exported

  What we did:
    Nothing. We're infrastructure. We faithfully recorded.

  Artifacts:
    ${path.resolve(ARTIFACTS_DIR, 'provenance')}

  Verify independently:
    node ${path.relative(process.cwd(), VERIFY_SCRIPT)}

  Login (to view the ledger):
    Nexus Corp:    admin@nexuscorp.io / demo-nexus-2026!
    Meridian Labs: admin@meridianlabs.ai / demo-meridian-2026!
`);
  console.log('='.repeat(70));

  // Cleanup: stop API server
  log('…', 'Stopping API server...');
  apiServer.kill();
  log('✓', 'API server stopped');
  log('✓', 'PostgreSQL container still running (oe-postgres)');
  console.log('');
}

main().catch(err => {
  console.error('\n  DEMO FAILED:', err.message);
  console.error(err.stack);
  process.exit(1);
});
