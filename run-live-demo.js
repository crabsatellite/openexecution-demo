#!/usr/bin/env node
/**
 * OpenExecution — Live Integration Demo Orchestrator
 *
 * Real end-to-end demo with GitHub + Vercel webhook integration:
 *   1. Check prerequisites (Docker, PostgreSQL)
 *   2. Reset database + apply schemas
 *   3. Start API server (port 3001)
 *   4. Start cloudflared tunnel (public URL for webhooks)
 *   5. Build & start Next.js frontend (production mode — no dev indicator)
 *   6. Register webhooks on GitHub + Vercel
 *   7. Run playwright-live-demo.js (browser recording with subtitles)
 *   8. Cleanup webhooks
 *
 * Required env vars:
 *   GITHUB_TOKEN   — Personal Access Token (repo + admin:repo_hook)
 *   GITHUB_OWNER   — e.g. "openexecution"
 *   GITHUB_REPO    — e.g. "openexecution-platform"
 *   VERCEL_TOKEN   — Vercel API token (optional — Vercel scenes skipped if missing)
 *   VERCEL_PROJECT  — Vercel project name (optional)
 *
 * Usage: node run-live-demo.js
 */

const { execSync, spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Load .env file from script directory (no external dependency)
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.substring(0, eqIdx).trim();
      const val = trimmed.substring(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

// ── Configuration ──

const API_DIR = path.join(__dirname, '..', 'openexecution-platform', 'api');
const WEB_DIR = path.join(__dirname, '..', 'openexecution-platform', 'web');
const SCHEMA_DIR = path.join(API_DIR, 'scripts');
const SOVEREIGN_SCHEMA_DIR = path.join(__dirname, '..', 'openexecution-sovereign', 'schema');
const PLAYWRIGHT_SCRIPT = path.join(__dirname, 'playwright-live-demo.js');

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

// External platform config
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO;
const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_PROJECT = process.env.VERCEL_PROJECT;

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

async function apiCall(method, urlPath, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE_URL}${urlPath}`, opts);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }
  if (!res.ok && res.status !== 409) {
    console.error(`  API ERROR ${method} ${urlPath}: ${res.status} ${text.substring(0, 200)}`);
    return null;
  }
  return json?.data || json;
}

// Track child processes and webhook IDs for cleanup
const children = [];
let githubWebhookId = null;
let vercelWebhookId = null;

const noGitEnv = { GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '', GCM_INTERACTIVE: 'never' };

// ── Localized GitHub Content ──
// All user-visible text created on GitHub (issues, comments) and in the platform.
// Each language run should see content in its own language.

const GITHUB_CONTENT = {
  issueTitle: {
    en: '[DEMO] CVE-2026-4821: Remote Code Execution in token validation',
    zh: '[DEMO] CVE-2026-4821：令牌验证中的远程代码执行漏洞',
    ja: '[DEMO] CVE-2026-4821: トークン検証におけるリモートコード実行',
  },
  issueBody: {
    en: '## Security Advisory — CVE-2026-4821\n\n**Severity:** Critical (CVSS 9.8)\n**Component:** `shared-auth-lib` token validation module\n\nA remote code execution vulnerability has been identified in the token validation\npipeline. Crafted JWT payloads can trigger arbitrary code execution during the\nsignature verification step.\n\n### Affected Versions\n- v3.0.0 through v3.2.4\n\n### Mitigation\nUpgrade to v3.3.0 (patch pending)\n\n---\n*This issue was created by the OpenExecution live demo and will be automatically closed.*',
    zh: '## 安全通告 — CVE-2026-4821\n\n**严重性：** 严重 (CVSS 9.8)\n**组件：** `shared-auth-lib` 令牌验证模块\n\n在令牌验证管道中发现了一个远程代码执行漏洞。\n精心构造的 JWT 载荷可在签名验证步骤中触发任意代码执行。\n\n### 受影响版本\n- v3.0.0 至 v3.2.4\n\n### 缓解措施\n升级至 v3.3.0（补丁待发布）\n\n---\n*此 Issue 由 OpenExecution 实时演示自动创建，将被自动关闭。*',
    ja: '## セキュリティアドバイザリ — CVE-2026-4821\n\n**深刻度:** 重大 (CVSS 9.8)\n**コンポーネント:** `shared-auth-lib` トークン検証モジュール\n\nトークン検証パイプラインにおいてリモートコード実行の脆弱性が確認されました。\n細工された JWT ペイロードにより、署名検証ステップで任意のコード実行が\nトリガーされる可能性があります。\n\n### 影響を受けるバージョン\n- v3.0.0 から v3.2.4\n\n### 緩和策\nv3.3.0 へアップグレード（パッチ保留中）\n\n---\n*この Issue は OpenExecution ライブデモによって自動作成され、自動的にクローズされます。*',
  },
  projectDescription: {
    en: 'Cross-company authentication library — critical production dependency',
    zh: '跨公司认证库 — 关键生产依赖',
    ja: 'クロスカンパニー認証ライブラリ — 重要なプロダクション依存関係',
  },
};

function ghText(key, lang) {
  return GITHUB_CONTENT[key]?.[lang] || GITHUB_CONTENT[key]?.en || key;
}

async function cleanupWebhooks() {
  if (githubWebhookId && GITHUB_TOKEN) {
    try {
      await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/hooks/${githubWebhookId}`, {
        method: 'DELETE',
        headers: { Authorization: `token ${GITHUB_TOKEN}`, 'User-Agent': 'OpenExecution-Demo' },
      });
      log('✓', `Deleted GitHub webhook ${githubWebhookId}`);
    } catch (e) { log('⚠', `Failed to delete GitHub webhook: ${e.message}`); }
  }
  if (vercelWebhookId && VERCEL_TOKEN) {
    try {
      await fetch(`https://api.vercel.com/v1/webhooks/${vercelWebhookId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
      });
      log('✓', `Deleted Vercel webhook ${vercelWebhookId}`);
    } catch (e) { log('⚠', `Failed to delete Vercel webhook: ${e.message}`); }
  }
}

function cleanup() {
  for (const child of children) {
    try { child.kill(); } catch { /* ignore */ }
  }
}

process.on('SIGINT', async () => {
  console.log('\n  Cleaning up...');
  await cleanupWebhooks();
  cleanup();
  process.exit(0);
});

process.on('exit', cleanup);


// ════════════════════════════════════════
//  MAIN
// ════════════════════════════════════════

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('  OPENEXECUTION — LIVE INTEGRATION DEMO');
  console.log('  Real GitHub + Vercel webhook recording');
  console.log('='.repeat(70) + '\n');

  // ─── Validate Required Config ───
  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    console.error('  FATAL: Missing required environment variables:');
    console.error('    GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO');
    console.error('  Example: GITHUB_TOKEN=ghp_xxx GITHUB_OWNER=org GITHUB_REPO=repo node run-live-demo.js');
    process.exit(1);
  }
  log('✓', `GitHub: ${GITHUB_OWNER}/${GITHUB_REPO}`);
  if (VERCEL_TOKEN && VERCEL_PROJECT) {
    log('✓', `Vercel: ${VERCEL_PROJECT}`);
  } else {
    log('⚠', 'Vercel not configured — Vercel scenes will be skipped');
  }


  // ─── STEP 1: Check Prerequisites ───
  console.log('\n' + '-'.repeat(70));
  console.log('  STEP 1: Check Prerequisites');
  console.log('-'.repeat(70));

  const dockerCheck = exec('docker ps --format "{{.Names}}" 2>/dev/null', { ignoreError: true });
  if (!dockerCheck) {
    console.error('  FATAL: Docker is not running. Start Docker Desktop first.');
    process.exit(1);
  }
  log('✓', 'Docker is running');

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

  log('…', 'Waiting for PostgreSQL...');
  let pgReady = false;
  for (let i = 0; i < 15; i++) {
    const result = exec('docker exec oe-postgres pg_isready -U postgres 2>/dev/null', { ignoreError: true });
    if (result && result.includes('accepting connections')) { pgReady = true; break; }
    await sleep(1000);
  }
  if (!pgReady) { console.error('  FATAL: PostgreSQL not ready.'); process.exit(1); }
  log('✓', 'PostgreSQL accepting connections');


  // ─── STEP 2: Reset Database ───
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
    if (!fs.existsSync(schemaPath)) schemaPath = path.join(SOVEREIGN_SCHEMA_DIR, schemaFile);
    if (!fs.existsSync(schemaPath)) { log('⚠', `Schema not found: ${schemaFile}`); continue; }
    try {
      const sql = fs.readFileSync(schemaPath, 'utf8');
      execSync('docker exec -i oe-postgres psql -U postgres -d openexecution', {
        input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000,
      });
    } catch { /* Ignore IF NOT EXISTS errors */ }
    log('✓', `Applied: ${schemaFile}`);
  }

  const tableCheck = exec(`docker exec oe-postgres psql -U postgres -d openexecution -t -A -c "SELECT count(*) FROM pg_tables WHERE tablename = 'provenance_certificates';"`) || '0';
  if (tableCheck.trim() === '0') {
    const certSQL = `CREATE TABLE IF NOT EXISTS provenance_certificates (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), chain_id UUID NOT NULL REFERENCES execution_chains(id) UNIQUE, artifact_type VARCHAR(64) NOT NULL, artifact_ref VARCHAR(512) NOT NULL, artifact_title VARCHAR(500), certificate_data JSONB, chain_hash VARCHAR(64), certificate_signature VARCHAR(256), status VARCHAR(20) DEFAULT 'active', revocation_reason TEXT, revoked_at TIMESTAMP WITH TIME ZONE, superseded_by UUID REFERENCES provenance_certificates(id), issued_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(), created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()); CREATE INDEX IF NOT EXISTS idx_prov_certs_chain ON provenance_certificates(chain_id);`;
    exec(`docker exec oe-postgres psql -U postgres -d openexecution -c "${certSQL}"`);
    log('✓', 'provenance_certificates created');
  }


  // ─── STEP 3: Start API Server ───
  console.log('\n' + '-'.repeat(70));
  console.log('  STEP 3: Start API Server');
  console.log('-'.repeat(70));

  try {
    exec('powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like \'*index.js*\' } | Stop-Process -Force"', { ignoreError: true });
  } catch { /* ignore */ }

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

  let apiReady = false;
  for (let i = 0; i < 20; i++) {
    await sleep(1000);
    if (await healthCheck(`${BASE_URL_INTERNAL.replace('/api/v1', '')}/api/v1/health`)) { apiReady = true; break; }
  }
  if (!apiReady) { console.error('  FATAL: API server did not start.'); cleanup(); process.exit(1); }
  log('✓', 'API server running at http://localhost:3001');


  // ─── STEP 4: Start Cloudflared Tunnel ───
  console.log('\n' + '-'.repeat(70));
  console.log('  STEP 4: Start Cloudflared Tunnel');
  console.log('-'.repeat(70));

  log('…', 'Starting cloudflared tunnel...');
  const tunnel = spawn('npx', ['cloudflared', 'tunnel', '--url', 'http://localhost:3001'], {
    shell: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...noGitEnv },
  });
  children.push(tunnel);

  let tunnelUrl = null;
  const tunnelHandler = (data) => {
    const text = data.toString();
    const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (match && !tunnelUrl) {
      tunnelUrl = match[0];
    }
  };
  tunnel.stdout.on('data', tunnelHandler);
  tunnel.stderr.on('data', tunnelHandler);

  for (let i = 0; i < 45; i++) {
    await sleep(1000);
    if (tunnelUrl) break;
  }
  if (!tunnelUrl) {
    console.error('  FATAL: cloudflared tunnel did not produce a URL within 45 seconds.');
    console.error('  Install cloudflared: npm install -g cloudflared');
    cleanup();
    process.exit(1);
  }
  log('✓', `Tunnel URL: ${tunnelUrl}`);

  // Verify tunnel reaches our API
  try {
    const tunnelCheck = await fetch(`${tunnelUrl}/api/v1/health`);
    if (tunnelCheck.ok) {
      log('✓', 'Tunnel → API health check passed');
    } else {
      log('⚠', `Tunnel health check returned ${tunnelCheck.status}`);
    }
  } catch (e) {
    log('⚠', `Tunnel health check failed: ${e.message}`);
  }


  // ─── STEP 5: Build & Start Frontend (Production Mode) ───
  console.log('\n' + '-'.repeat(70));
  console.log('  STEP 5: Build & Start Frontend (Production)');
  console.log('-'.repeat(70));

  // Kill any stale Next.js server on port 3000 from a previous run
  try {
    exec('powershell -Command "Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"', { ignoreError: true });
    log('✓', 'Cleared port 3000');
  } catch { /* ignore */ }
  // Also kill any stale test server on port 3333
  try {
    exec('powershell -Command "Get-NetTCPConnection -LocalPort 3333 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"', { ignoreError: true });
  } catch { /* ignore */ }
  await sleep(1000);

  log('…', 'Building Next.js for production (this may take 30-60s)...');
  try {
    execSync('npx next build', {
      cwd: WEB_DIR,
      env: { ...process.env, ...noGitEnv, NEXT_PUBLIC_API_URL: 'http://localhost:3001/api/v1' },
      stdio: 'pipe',
      timeout: 180000,
    });
    log('✓', 'Next.js build complete');
  } catch (e) {
    log('⚠', `Production build failed — falling back to dev mode: ${e.message?.substring(0, 100)}`);
    // Fall back to dev mode
    const devServer = spawn('npx', ['next', 'dev', '-p', '3000'], {
      cwd: WEB_DIR,
      env: { ...process.env, ...noGitEnv, NEXT_PUBLIC_API_URL: 'http://localhost:3001/api/v1' },
      stdio: ['pipe', 'pipe', 'pipe'], shell: true, detached: false,
    });
    children.push(devServer);
    devServer.stdout.on('data', () => {});
    devServer.stderr.on('data', () => {});

    let ready = false;
    for (let i = 0; i < 45; i++) { await sleep(1000); if (await healthCheck(FRONTEND_URL_INTERNAL)) { ready = true; break; } }
    if (!ready) { console.error('  FATAL: Frontend did not start.'); cleanup(); process.exit(1); }
    log('✓', 'Frontend running (dev mode) at http://localhost:3000');

    // Warmup pages
    for (const p of ['/auth/login', '/', '/dashboard/adapters', '/projects', '/dashboard/provenance', '/landing']) {
      try { const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 30000); await fetch(`${FRONTEND_URL_INTERNAL}${p}`, { signal: ac.signal }); clearTimeout(t); } catch {}
      await sleep(500);
    }
    log('✓', 'Pages warmed up');
    // Skip to Step 6
    return await runStep6AndBeyond(tunnelUrl);
  }

  log('…', 'Starting Next.js production server on port 3000...');
  const frontendServer = spawn('npx', ['next', 'start', '-p', '3000'], {
    cwd: WEB_DIR,
    env: { ...process.env, ...noGitEnv, NEXT_PUBLIC_API_URL: 'http://localhost:3001/api/v1' },
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: true,
    detached: false,
  });
  children.push(frontendServer);
  frontendServer.stdout.on('data', () => {});
  frontendServer.stderr.on('data', () => {});

  let frontendReady = false;
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    if (await healthCheck(FRONTEND_URL_INTERNAL)) { frontendReady = true; break; }
  }
  if (!frontendReady) { console.error('  FATAL: Frontend did not start.'); cleanup(); process.exit(1); }
  log('✓', 'Frontend running (production) at http://localhost:3000');

  await runStep6AndBeyond(tunnelUrl);
}


async function runStep6AndBeyond(tunnelUrl) {
  // ─── STEP 5.5: Clean up old demo issues ───
  log('…', 'Cleaning up old demo issues...');
  try {
    const issuesRes = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues?state=all&per_page=50`, {
      headers: { Authorization: `token ${GITHUB_TOKEN}`, 'User-Agent': 'OpenExecution-Demo', Accept: 'application/vnd.github.v3+json' },
    });
    const issues = await issuesRes.json();
    for (const issue of (issues || [])) {
      if (issue.title?.includes('[DEMO]')) {
        if (issue.state === 'open') {
          await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues/${issue.number}`, {
            method: 'PATCH',
            headers: { Authorization: `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'OpenExecution-Demo' },
            body: JSON.stringify({ state: 'closed', state_reason: 'not_planned' }),
          });
        }
        log('✓', `Cleaned up issue #${issue.number}`);
      }
    }
  } catch (e) { log('⚠', `Issue cleanup: ${e.message}`); }

  // Also delete any existing webhooks pointing to trycloudflare.com
  try {
    const hooksRes = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/hooks`, {
      headers: { Authorization: `token ${GITHUB_TOKEN}`, 'User-Agent': 'OpenExecution-Demo' },
    });
    const hooks = await hooksRes.json();
    for (const hook of (hooks || [])) {
      if (hook.config?.url?.includes('trycloudflare.com')) {
        await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/hooks/${hook.id}`, {
          method: 'DELETE',
          headers: { Authorization: `token ${GITHUB_TOKEN}`, 'User-Agent': 'OpenExecution-Demo' },
        });
        log('✓', `Deleted stale webhook ${hook.id}`);
      }
    }
  } catch (e) { log('⚠', `Webhook cleanup: ${e.message}`); }


  // ─── STEP 6: Register User + Webhooks ───
  console.log('\n' + '-'.repeat(70));
  console.log('  STEP 6: Register User + Configure Webhooks');
  console.log('-'.repeat(70));

  // Register demo user
  await apiCall('POST', '/users/register', {
    email: 'admin@nexuscorp.io',
    password: 'demo-nexus-2026!',
    username: 'nexus-admin',
  });
  const loginResult = await apiCall('POST', '/users/login', {
    email: 'admin@nexuscorp.io',
    password: 'demo-nexus-2026!',
  });
  const jwt = loginResult?.token;
  if (!jwt) { console.error('  FATAL: Cannot login.'); cleanup(); process.exit(1); }
  log('✓', 'User registered and logged in');

  // Create GitHub workspace connection
  const ghSecret = crypto.randomBytes(20).toString('hex');
  const ghConn = await apiCall('POST', '/adapters/connections', {
    platform: 'github',
    platform_account_id: `${GITHUB_OWNER}/${GITHUB_REPO}`,
    platform_account_name: `${GITHUB_OWNER}/${GITHUB_REPO}`,
    access_token: GITHUB_TOKEN,
  }, jwt);
  const ghConnId = ghConn?.id;
  if (ghConnId) {
    await apiCall('PATCH', `/adapters/connections/${ghConnId}/webhook-secret`, { webhook_secret: ghSecret }, jwt);
    log('✓', `GitHub connection: ${ghConnId.substring(0, 8)}`);
  }

  // Create Vercel workspace connection (if configured)
  let vcConnId = null;
  let vcSecret = null;
  if (VERCEL_TOKEN && VERCEL_PROJECT) {
    vcSecret = crypto.randomBytes(20).toString('hex');
    const vcConn = await apiCall('POST', '/adapters/connections', {
      platform: 'vercel',
      platform_account_id: VERCEL_PROJECT,
      platform_account_name: VERCEL_PROJECT,
      access_token: VERCEL_TOKEN,
    }, jwt);
    vcConnId = vcConn?.id;
    if (vcConnId) {
      await apiCall('PATCH', `/adapters/connections/${vcConnId}/webhook-secret`, { webhook_secret: vcSecret }, jwt);
      log('✓', `Vercel connection: ${vcConnId.substring(0, 8)}`);
    }
  }

  // Create project + bind workspaces
  const project = await apiCall('POST', '/projects', {
    repo_full_name: `${GITHUB_OWNER}/${GITHUB_REPO}`,
    title: GITHUB_REPO,
    description: 'Cross-company authentication library — critical production dependency',
    tags: ['security', 'auth', 'shared', 'critical'],
  }, jwt);
  const projectId = project?.id;
  log('✓', `Project: ${projectId?.substring(0, 8) || 'FAILED'}`);

  let ghChainId = null;
  if (projectId && ghConnId) {
    const binding = await apiCall('POST', `/projects/${projectId}/workspaces`, {
      connection_id: ghConnId, label: 'Repository Events',
    }, jwt);
    ghChainId = binding?.chain_id;
    log('✓', `GitHub binding → chain ${ghChainId?.substring(0, 8) || 'N/A'}`);
  }

  let vcChainId = null;
  if (projectId && vcConnId) {
    const binding = await apiCall('POST', `/projects/${projectId}/workspaces`, {
      connection_id: vcConnId, label: 'Production Deployments',
    }, jwt);
    vcChainId = binding?.chain_id;
    log('✓', `Vercel binding → chain ${vcChainId?.substring(0, 8) || 'N/A'}`);
  }

  // Register GitHub webhook (on the real repo)
  log('…', 'Registering GitHub webhook...');
  const ghWebhookUrl = `${tunnelUrl}/api/v1/adapters/webhooks/github/${ghConnId}`;
  try {
    const ghRes = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/hooks`, {
      method: 'POST',
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'OpenExecution-Demo',
      },
      body: JSON.stringify({
        config: { url: ghWebhookUrl, content_type: 'json', secret: ghSecret, insecure_ssl: '0' },
        events: ['issues', 'push', 'pull_request'],
        active: true,
      }),
    });
    const ghWebhookData = await ghRes.json();
    if (ghRes.ok) {
      githubWebhookId = ghWebhookData.id;
      log('✓', `GitHub webhook registered: ${githubWebhookId}`);
    } else {
      log('⚠', `GitHub webhook failed: ${JSON.stringify(ghWebhookData).substring(0, 200)}`);
    }
  } catch (e) {
    log('⚠', `GitHub webhook error: ${e.message}`);
  }

  // Register Vercel webhook (if configured)
  let vercelProjectId = null;
  if (vcConnId && VERCEL_TOKEN) {
    // Look up Vercel project ID (required for webhook registration with deployment events)
    try {
      const projRes = await fetch(`https://api.vercel.com/v9/projects/${VERCEL_PROJECT}`, {
        headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
      });
      const projData = await projRes.json();
      vercelProjectId = projData?.id;
      if (vercelProjectId) log('✓', `Vercel project ID: ${vercelProjectId}`);
    } catch (e) { log('⚠', `Vercel project lookup: ${e.message}`); }

    log('…', 'Registering Vercel webhook...');
    const vcWebhookUrl = `${tunnelUrl}/api/v1/adapters/webhooks/vercel/${vcConnId}`;
    try {
      const webhookBody = {
        url: vcWebhookUrl,
        events: ['deployment.created'],
      };
      if (vercelProjectId) webhookBody.projectIds = [vercelProjectId];
      const vcRes = await fetch('https://api.vercel.com/v1/webhooks', {
        method: 'POST',
        headers: { Authorization: `Bearer ${VERCEL_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(webhookBody),
      });
      const vcWebhookData = await vcRes.json();
      if (vcRes.ok) {
        vercelWebhookId = vcWebhookData.id;
        // Vercel returns the signing secret — update our connection
        if (vcWebhookData.secret) {
          await apiCall('PATCH', `/adapters/connections/${vcConnId}/webhook-secret`, { webhook_secret: vcWebhookData.secret }, jwt);
          vcSecret = vcWebhookData.secret;
        }
        log('✓', `Vercel webhook registered: ${vercelWebhookId}`);
      } else {
        log('⚠', `Vercel webhook failed: ${JSON.stringify(vcWebhookData).substring(0, 200)}`);
      }
    } catch (e) {
      log('⚠', `Vercel webhook error: ${e.message}`);
    }
  }


  // ─── STEP 7: Trigger Vercel Deployment (once, language-independent) ───
  console.log('\n' + '-'.repeat(70));
  console.log('  STEP 7: Trigger Vercel Deployment');
  console.log('-'.repeat(70));

  if (VERCEL_TOKEN && VERCEL_PROJECT) {
    log('…', 'Triggering Vercel deployment...');
    try {
      const deployRes = await fetch('https://api.vercel.com/v13/deployments', {
        method: 'POST',
        headers: { Authorization: `Bearer ${VERCEL_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: VERCEL_PROJECT,
          project: vercelProjectId || VERCEL_PROJECT,
          target: 'production',
          files: [{ file: 'index.html', data: '<!DOCTYPE html><html><head><title>shared-auth-lib v3.3.0</title></head><body><h1>shared-auth-lib v3.3.0</h1><p>Security patch for CVE-2026-4821 applied.</p></body></html>' }],
          projectSettings: { framework: null },
        }),
      });
      const deployData = await deployRes.json();
      if (deployRes.ok || deployRes.status === 201) {
        log('✓', `Vercel deployment: ${deployData.url || deployData.id}`);
      } else {
        log('⚠', `Deploy: ${deployRes.status} ${JSON.stringify(deployData).substring(0, 150)}`);
      }
    } catch (e) { log('⚠', `Deploy: ${e.message}`); }

    // Wait for Vercel webhook to propagate
    log('…', 'Waiting 10s for Vercel webhook propagation...');
    await sleep(10000);
    log('✓', 'Vercel webhook wait complete');
  } else {
    log('⚠', 'Vercel not configured — skipping deployment trigger');
  }


  // ─── STEP 8: Run Playwright Recordings (3 Languages) ───
  // For each language: create a localized GitHub issue, wait for webhook,
  // run the recorder, then close the issue before the next language.
  console.log('\n' + '-'.repeat(70));
  console.log('  STEP 8: Run Demo Recordings (EN / ZH / JA)');
  console.log('-'.repeat(70) + '\n');

  const LANGS = ['en', 'zh', 'ja'];
  const createdIssueNumbers = []; // Track all created issues for cleanup

  const baseEnv = {
    ...process.env,
    ...noGitEnv,
    API_URL: BASE_URL,
    FRONTEND_URL,
    TUNNEL_URL: tunnelUrl,
    GITHUB_TOKEN,
    GITHUB_OWNER,
    GITHUB_REPO,
    GITHUB_CONN_ID: ghConnId || '',
    GITHUB_CHAIN_ID: ghChainId || '',
    VERCEL_TOKEN: VERCEL_TOKEN || '',
    VERCEL_PROJECT: VERCEL_PROJECT || '',
    VERCEL_CONN_ID: vcConnId || '',
    VERCEL_CHAIN_ID: vcChainId || '',
    VERCEL_PROJECT_ID: vercelProjectId || '',
    PROJECT_ID: projectId || '',
    USER_JWT: jwt,
  };

  for (const lang of LANGS) {
    console.log(`\n  ── Recording: ${lang.toUpperCase()} ──\n`);

    // Create a localized GitHub issue for this language
    let issueNumber = null;
    log('…', `Creating GitHub issue (${lang})...`);
    try {
      const issueRes = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues`, {
        method: 'POST',
        headers: { Authorization: `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'OpenExecution-Demo' },
        body: JSON.stringify({
          title: ghText('issueTitle', lang),
          body: ghText('issueBody', lang),
        }),
      });
      const issueData = await issueRes.json();
      if (issueRes.ok) {
        issueNumber = issueData.number;
        createdIssueNumbers.push(issueNumber);
        log('✓', `GitHub issue #${issueNumber} created (${lang})`);
      } else {
        log('⚠', `Issue creation failed (${lang}): ${issueRes.status}`);
      }
    } catch (e) { log('⚠', `Issue creation (${lang}): ${e.message}`); }

    // Wait for GitHub webhook to propagate
    log('…', 'Waiting 12s for GitHub webhook propagation...');
    await sleep(12000);
    log('✓', 'Webhook wait complete');

    // Run the recorder for this language
    const exitCode = await new Promise((resolve) => {
      const pw = spawn('node', [PLAYWRIGHT_SCRIPT], {
        cwd: __dirname,
        env: { ...baseEnv, DEMO_LANG: lang, ISSUE_NUMBER: String(issueNumber || '') },
        stdio: 'inherit',
        detached: false,
      });
      children.push(pw);
      pw.on('exit', (code) => resolve(code || 0));
    });
    if (exitCode !== 0) {
      console.error(`  ${lang.toUpperCase()} recording failed (exit ${exitCode})`);
    }

    // Close the issue after recording (before next language)
    if (issueNumber) {
      log('…', `Closing GitHub issue #${issueNumber} (${lang})...`);
      try {
        await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues/${issueNumber}`, {
          method: 'PATCH',
          headers: { Authorization: `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'OpenExecution-Demo' },
          body: JSON.stringify({ state: 'closed', state_reason: 'not_planned' }),
        });
        log('✓', `Issue #${issueNumber} closed (${lang})`);
      } catch (e) { log('⚠', `Issue close (${lang}): ${e.message}`); }
    }
  }

  // Final cleanup: ensure all demo issues are closed
  for (const num of createdIssueNumbers) {
    try {
      await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues/${num}`, {
        method: 'PATCH',
        headers: { Authorization: `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'OpenExecution-Demo' },
        body: JSON.stringify({ state: 'closed', state_reason: 'not_planned' }),
      });
    } catch { /* ignore — may already be closed */ }
  }

  console.log('\n  Cleaning up webhooks...');
  await cleanupWebhooks();
  cleanup();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('Live demo failed:', err);
  await cleanupWebhooks();
  cleanup();
  process.exit(1);
});
