#!/usr/bin/env node
/**
 * Platform Demo Recording — OpenExecution
 *
 * Records a live walkthrough of the actual OpenExecution platform:
 *   1. Login as platform admin
 *   2. Connect external platforms (Vercel, Figma, Notion)
 *   3. Configure webhook signing secrets
 *   4. Bind workspaces to project (creates provenance chains)
 *   5. Simulate HMAC-signed webhook events from external platforms
 *   6. View audit trail + provenance chains in the platform UI
 *   7. Show landing page
 *
 * Usage:
 *   npx playwright install chromium   # first time
 *   node playwright-platform-demo.js
 *
 * Prerequisites:
 *   - API running on port 3001
 *   - Frontend running on port 3000
 *   - User registered (run seed-platform-demo.js first or use run-platform-demo.js)
 */
const { chromium } = require('playwright');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

// ── Config ──

const API_URL = process.env.API_URL || 'http://localhost:3001/api/v1';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const OUTPUT_DIR = path.join(__dirname, 'recording-platform');

// Demo credentials
const USER_EMAIL = 'admin@nexuscorp.io';
const USER_PASSWORD = 'demo-nexus-2026!';

// Platform tokens (fake — just stored, not validated against real APIs)
const VERCEL_TOKEN = 'vcel_NxPr0d_a1b2c3d4e5f6g7h8i9j0';
const FIGMA_TOKEN  = 'figd_SharedDS_x9y8z7w6v5u4t3s2';
const NOTION_TOKEN = 'ntn_NxDocs_k1j2i3h4g5f6e7d8';

// Webhook signing secrets
const VERCEL_SECRET = 'whsec_vercel_nexus_prod_2026';
const FIGMA_SECRET  = 'whsec_figma_shared_design_2026';

// ── Helpers ──

function hmacSha1(secret, data) {
  return crypto.createHmac('sha1', secret).update(data).digest('hex');
}
function hmacSha256(secret, data) {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function apiCall(method, urlPath, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API_URL}${urlPath}`, opts);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }
  if (!res.ok && res.status !== 409) {
    console.error(`  API ERROR ${method} ${urlPath}: ${res.status} ${text.substring(0, 200)}`);
    return null;
  }
  return json?.data || json;
}

async function rawWebhook(urlPath, rawBody, headers = {}) {
  const opts = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: rawBody,
  };
  const res = await fetch(`${API_URL}${urlPath}`, opts);
  return { status: res.status };
}

let screenshotCount = 0;
async function screenshot(page, label) {
  screenshotCount++;
  const filename = `${String(screenshotCount).padStart(2, '0')}-${label}.png`;
  await page.screenshot({ path: path.join(OUTPUT_DIR, filename), fullPage: false });
  console.log(`    [screenshot] ${filename}`);
}

// ── UI Interaction Helpers ──

/**
 * Connect a platform via the Adapters page Connect dialog.
 * Works for both 'token' and 'both' (OAuth+token) auth modes.
 */
async function connectPlatform(page, platformName, accountName, token) {
  // Find the Card (data-slot="card") containing the platform name
  const card = page.locator('[data-slot="card"]').filter({ hasText: platformName });

  // Click the Connect trigger button within this card
  // The trigger is a <Button> rendered by DialogTrigger asChild
  await card.getByRole('button', { name: /Connect/ }).first().click();

  // Wait for dialog
  await page.waitForSelector('[role="dialog"]', { timeout: 8000 });
  const dialog = page.locator('[role="dialog"]');
  await page.waitForTimeout(300);

  // Fill Account Name (first non-password input in the dialog)
  // For 'both' auth platforms, the input is below the OAuth section
  const nameInputs = dialog.locator('input:not([type="password"])');
  if (await nameInputs.count() > 0) {
    await nameInputs.first().fill(accountName);
    await page.waitForTimeout(200);
  }

  // Fill API Token (password input)
  const tokenInput = dialog.locator('input[type="password"]');
  await tokenInput.fill(token);
  await page.waitForTimeout(200);

  // Click the Connect button in the dialog footer
  // Use exact text to avoid matching "Connect with OAuth"
  // The footer Connect button has bg-indigo-600 class
  const connectBtns = dialog.locator('button.bg-indigo-600, button.bg-indigo-700');
  const btnCount = await connectBtns.count();
  // Pick the last indigo button (for 'both' auth: first is OAuth, last is token Connect)
  // For 'token' only auth: there's just one indigo button
  await connectBtns.last().click();

  // Wait for dialog to close (connection created)
  try {
    await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 10000 });
  } catch {
    // Dialog may have already closed or still closing
  }
  await page.waitForTimeout(1500);
}

/**
 * Set webhook secret for a platform connection via the Adapters page UI.
 */
async function setWebhookSecret(page, platformName, secret) {
  // Find the Card containing the platform name
  const card = page.locator('[data-slot="card"]').filter({ hasText: platformName });

  // Click "Show webhook settings" link
  const toggle = card.getByText('Show webhook settings').first();
  await toggle.click();
  await page.waitForTimeout(500);

  // Fill the webhook secret input (inside the expanded bg-slate-50 section)
  const secretSection = card.locator('.bg-slate-50');
  const secretInput = secretSection.locator('input[type="password"]');
  await secretInput.fill(secret);
  await page.waitForTimeout(200);

  // Click Save
  const saveBtn = secretSection.getByRole('button', { name: 'Save' });
  await saveBtn.click();
  await page.waitForTimeout(1000);
}


// ════════════════════════════════════════════════════
//  MAIN
// ════════════════════════════════════════════════════

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log(`
============================================================
  OPENEXECUTION — PLATFORM DEMO RECORDING v2
  Before / After — Live Platform Walkthrough
============================================================
`);

  // ── Setup: Pre-seed user via API ──
  console.log('[Setup] Registering user...');
  await apiCall('POST', '/users/register', {
    email: USER_EMAIL,
    password: USER_PASSWORD,
    username: 'nexus-admin',
  });

  const loginResult = await apiCall('POST', '/users/login', {
    email: USER_EMAIL,
    password: USER_PASSWORD,
  });
  const jwt = loginResult?.token;
  if (!jwt) {
    console.error('FATAL: Cannot login via API. Is the API server running?');
    process.exit(1);
  }
  console.log('[Setup] User ready. JWT obtained.\n');

  // ── Launch Browser ──
  console.log('[Browser] Launching Chromium...');
  const browser = await chromium.launch({
    headless: false,
    args: ['--window-size=1920,1080'],
  });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: OUTPUT_DIR, size: { width: 1920, height: 1080 } },
  });
  const page = await context.newPage();

  const GOTO = { waitUntil: 'domcontentloaded', timeout: 60000 };


  // ╔═══════════════════════════════════════════════╗
  // ║  ACT I — BEFORE STATE (Empty Platform Tour)  ║
  // ╚═══════════════════════════════════════════════╝

  console.log('\n━━━ ACT I: BEFORE STATE ━━━\n');

  // ════════════════════════════════════════
  //  Scene 1: Login
  // ════════════════════════════════════════
  console.log('[Scene 1] Login as Nexus Corp Admin');
  await page.goto(`${FRONTEND_URL}/auth/login`, GOTO);
  await page.waitForTimeout(3000);
  await screenshot(page, 'login-page');

  await page.locator('#email').fill(USER_EMAIL);
  await page.waitForTimeout(400);
  await page.locator('#password').fill(USER_PASSWORD);
  await page.waitForTimeout(500);
  await screenshot(page, 'login-filled');

  await page.locator('button[type="submit"]').click();
  await page.waitForURL('**/dashboard**', { timeout: 30000 });
  await page.waitForTimeout(2500);
  await screenshot(page, 'after-login');


  // ════════════════════════════════════════
  //  Scene 2: Mission Control — Empty
  // ════════════════════════════════════════
  console.log('[Scene 2] Mission Control — Empty');
  // Use sidebar nav (client-side) to preserve Zustand auth state
  // Full page.goto('/') loses Zustand store → redirects to /landing
  await page.getByText('Mission Control').first().click();
  await page.waitForTimeout(3000);
  await screenshot(page, 'mission-control-BEFORE');


  // ════════════════════════════════════════
  //  Scene 3: Adapters — No Connections
  // ════════════════════════════════════════
  console.log('[Scene 3] Adapters — No Connections');
  await page.goto(`${FRONTEND_URL}/dashboard/adapters`, GOTO);
  await page.waitForTimeout(2000);
  await screenshot(page, 'adapters-BEFORE');


  // ════════════════════════════════════════
  //  Scene 4: Projects — Empty List
  // ════════════════════════════════════════
  console.log('[Scene 4] Projects — Empty');
  await page.goto(`${FRONTEND_URL}/projects`, GOTO);
  await page.waitForTimeout(2000);
  await screenshot(page, 'projects-BEFORE');


  // ════════════════════════════════════════
  //  Scene 5: Provenance — No Chains
  // ════════════════════════════════════════
  console.log('[Scene 5] Provenance — No Chains');
  await page.goto(`${FRONTEND_URL}/dashboard/provenance`, GOTO);
  await page.waitForTimeout(2500);
  await screenshot(page, 'provenance-BEFORE');


  // ╔═══════════════════════════════════════════════╗
  // ║  ACT II — CONFIGURE & OPERATE                ║
  // ╚═══════════════════════════════════════════════╝

  console.log('\n━━━ ACT II: CONFIGURE & OPERATE ━━━\n');

  // ════════════════════════════════════════
  //  Scene 6: Connect Workspace Adapters
  // ════════════════════════════════════════
  console.log('[Scene 6] Connect Workspace Adapters');
  await page.goto(`${FRONTEND_URL}/dashboard/adapters`, GOTO);
  await page.waitForTimeout(2000);

  // Connect Vercel
  console.log('  Connecting Vercel...');
  await connectPlatform(page, 'Vercel', 'Nexus Corp Production', VERCEL_TOKEN);
  await page.waitForTimeout(1000);

  // Connect Figma
  console.log('  Connecting Figma...');
  await connectPlatform(page, 'Figma', 'Shared Design System', FIGMA_TOKEN);
  await page.waitForTimeout(1000);

  // Connect Notion
  console.log('  Connecting Notion...');
  await connectPlatform(page, 'Notion', 'Nexus Corp Docs', NOTION_TOKEN);
  await page.waitForTimeout(1000);
  await screenshot(page, 'adapters-connected');

  // Configure webhook secrets
  console.log('  Configuring webhook secrets...');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);

  await setWebhookSecret(page, 'Vercel', VERCEL_SECRET);
  await page.waitForTimeout(800);
  await setWebhookSecret(page, 'Figma', FIGMA_SECRET);
  await page.waitForTimeout(800);

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1000);
  await screenshot(page, 'adapters-webhooks-configured');


  // ════════════════════════════════════════
  //  Scene 7: Create Project & Bind Workspaces
  // ════════════════════════════════════════
  console.log('[Scene 7] Create Project & Bind Workspaces');

  const connections = await apiCall('GET', '/adapters/connections', null, jwt);
  const vercelConn = (connections || []).find(c => c.platform === 'vercel');
  const figmaConn  = (connections || []).find(c => c.platform === 'figma');
  const notionConn = (connections || []).find(c => c.platform === 'notion');

  console.log(`  Connections: Vercel=${vercelConn?.id?.substring(0,8)}, Figma=${figmaConn?.id?.substring(0,8)}, Notion=${notionConn?.id?.substring(0,8)}`);

  // Create project
  const project = await apiCall('POST', '/projects', {
    repo_full_name: 'nexuscorp/shared-auth-lib',
    title: 'shared-auth-lib',
    description: 'Cross-company authentication library — critical production dependency',
    tags: ['security', 'auth', 'shared', 'critical'],
  }, jwt);
  const projectId = project?.id;
  console.log(`  Project: ${projectId ? projectId.substring(0, 8) + '...' : 'FAILED'}`);

  // Bind workspaces (creates provenance chains)
  let vercelChainId;
  if (projectId && vercelConn) {
    const binding = await apiCall('POST', `/projects/${projectId}/workspaces`, {
      connection_id: vercelConn.id, label: 'Production Deployments',
    }, jwt);
    vercelChainId = binding?.chain_id;
    console.log(`  Vercel → chain ${vercelChainId?.substring(0, 8) || 'N/A'}`);
  }
  if (projectId && notionConn) {
    const binding = await apiCall('POST', `/projects/${projectId}/workspaces`, {
      connection_id: notionConn.id, label: 'Incident Runbooks',
    }, jwt);
    console.log(`  Notion → chain ${binding?.chain_id?.substring(0, 8) || 'N/A'}`);
  }
  if (projectId && figmaConn) {
    const binding = await apiCall('POST', `/projects/${projectId}/workspaces`, {
      connection_id: figmaConn.id, label: 'Security Diagrams',
    }, jwt);
    console.log(`  Figma → chain ${binding?.chain_id?.substring(0, 8) || 'N/A'}`);
  }

  // Show project with bound workspaces (0 events yet)
  if (projectId) {
    await page.goto(`${FRONTEND_URL}/projects/${projectId}`, GOTO);
    await page.waitForTimeout(2000);
    await page.getByRole('tab', { name: /Workspaces/ }).click();
    await page.waitForTimeout(2000);
    await screenshot(page, 'project-workspaces-BEFORE');
  }


  // ════════════════════════════════════════
  //  Scene 8: Webhook Events (API-only, no browser)
  // ════════════════════════════════════════
  console.log('[Scene 8] Platform Events Flow In (Webhooks)');
  console.log('  Scenario: CVE-2026-4821 — Cross-platform incident response\n');

  if (vercelConn) {
    console.log('  [T+0s]   Vercel: deployment.created (pre-patch baseline)');
    const payload = JSON.stringify({
      type: 'deployment.created',
      payload: { url: 'shared-auth-lib-main.nexuscorp.vercel.app', name: 'shared-auth-lib',
        meta: { gitBranch: 'main', gitCommit: 'a1b2c3d' } },
    });
    const sig = hmacSha1(VERCEL_SECRET, payload);
    const { status } = await rawWebhook(`/adapters/webhooks/vercel/${vercelConn.id}`, payload, { 'x-vercel-signature': sig });
    console.log(`           → ${status === 200 ? 'Verified ✓' : 'FAILED ' + status} (HMAC-SHA1)`);
  }
  await sleep(1000);

  if (figmaConn) {
    console.log('  [T+2s]   Figma: FILE_UPDATE (security architecture diagram)');
    const payload = JSON.stringify({
      event_type: 'FILE_UPDATE', file_key: 'sec-arch-2026',
      file_name: 'Security Architecture — shared-auth-lib',
      triggered_by: { id: 'meridian-admin', handle: 'meridian-admin' },
    });
    const sig = hmacSha256(FIGMA_SECRET, payload);
    const { status } = await rawWebhook(`/adapters/webhooks/figma/${figmaConn.id}`, payload, { 'x-figma-signature': sig });
    console.log(`           → ${status === 200 ? 'Verified ✓' : 'FAILED ' + status} (HMAC-SHA256)`);
  }
  await sleep(1000);

  if (vercelChainId) {
    console.log('  [T+4s]   HUMAN: nexus-admin instructs on chain');
    const result = await apiCall('POST', `/users/me/chains/${vercelChainId}/instruct`, {
      instruction: 'HOLD all deployments of shared-auth-lib until the RCE patch passes SAST and DAST scans. This is CVE-2026-4821 — production-critical.',
      scope: 'until_resolved',
    }, jwt);
    console.log(`           → ${result ? 'Instruction recorded (liability event) ✓' : 'FAILED'}`);
  }
  await sleep(1000);

  if (vercelConn) {
    console.log('  [T+6s]   Vercel: deployment.ready (patched v3.3.0)');
    const payload = JSON.stringify({
      type: 'deployment.ready',
      payload: { url: 'shared-auth-lib-v3.3.0.nexuscorp.vercel.app', name: 'shared-auth-lib',
        meta: { gitBranch: 'fix/cve-2026-4821', gitCommit: 'd4e5f6g' } },
    });
    const sig = hmacSha1(VERCEL_SECRET, payload);
    const { status } = await rawWebhook(`/adapters/webhooks/vercel/${vercelConn.id}`, payload, { 'x-vercel-signature': sig });
    console.log(`           → ${status === 200 ? 'Verified ✓' : 'FAILED ' + status} (HMAC-SHA1)`);
  }
  await sleep(1000);

  if (figmaConn) {
    console.log('  [T+8s]   Figma: FILE_VERSION_UPDATE (diagram finalized)');
    const payload = JSON.stringify({
      event_type: 'FILE_VERSION_UPDATE', file_key: 'sec-arch-2026',
      file_name: 'Security Architecture — shared-auth-lib v3.3.0',
      triggered_by: { id: 'meridian-admin', handle: 'meridian-admin' },
    });
    const sig = hmacSha256(FIGMA_SECRET, payload);
    const { status } = await rawWebhook(`/adapters/webhooks/figma/${figmaConn.id}`, payload, { 'x-figma-signature': sig });
    console.log(`           → ${status === 200 ? 'Verified ✓' : 'FAILED ' + status} (HMAC-SHA256)`);
  }
  console.log('');


  // ╔═══════════════════════════════════════════════╗
  // ║  ACT III — AFTER STATE (Same Pages, New Data) ║
  // ╚═══════════════════════════════════════════════╝

  console.log('\n━━━ ACT III: AFTER STATE ━━━\n');

  // ════════════════════════════════════════
  //  Scene 9: Project — Workspaces (Now With Events)
  // ════════════════════════════════════════
  console.log('[Scene 9] Project Workspaces — AFTER');
  if (projectId) {
    await page.goto(`${FRONTEND_URL}/projects/${projectId}`, GOTO);
    await page.waitForTimeout(2000);
    await page.getByRole('tab', { name: /Workspaces/ }).click();
    await page.waitForTimeout(2500);
    await screenshot(page, 'project-workspaces-AFTER');
  }


  // ════════════════════════════════════════
  //  Scene 10: Project — Audit Trail
  // ════════════════════════════════════════
  console.log('[Scene 10] Project Audit Trail — AFTER');
  if (projectId) {
    await page.getByRole('tab', { name: /Audit Trail/ }).click();
    await page.waitForTimeout(2500);
    await screenshot(page, 'project-audit-trail');

    await page.evaluate(() => window.scrollTo(0, 400));
    await page.waitForTimeout(1000);
    await screenshot(page, 'project-audit-trail-scroll');
  }


  // ════════════════════════════════════════
  //  Scene 11: Provenance — AFTER
  // ════════════════════════════════════════
  console.log('[Scene 11] Provenance — AFTER');
  await page.goto(`${FRONTEND_URL}/dashboard/provenance`, GOTO);
  await page.waitForTimeout(3000);
  await screenshot(page, 'provenance-overview-AFTER');

  // Chains tab
  await page.locator('nav[aria-label="Tabs"] button').filter({ hasText: 'Chains' }).click();
  await page.waitForTimeout(2500);
  await screenshot(page, 'provenance-chains-AFTER');

  // Expand first chain
  try {
    const firstChainButton = page.locator('button.w-full.text-left').first();
    if (await firstChainButton.count() > 0) {
      await firstChainButton.click();
      await page.waitForTimeout(2500);
      await screenshot(page, 'provenance-chain-expanded');
    }
  } catch (err) {
    console.log('  (Could not expand chain row:', err.message, ')');
  }


  // ════════════════════════════════════════
  //  Scene 12: Mission Control — AFTER
  // ════════════════════════════════════════
  console.log('[Scene 12] Mission Control — AFTER');
  // Use sidebar nav (client-side) to preserve Zustand auth state
  await page.getByText('Mission Control').first().click();
  await page.waitForTimeout(3000);
  await screenshot(page, 'mission-control-AFTER');


  // ╔═══════════════════════════════════════════════╗
  // ║  EPILOGUE — Landing Page                      ║
  // ╚═══════════════════════════════════════════════╝

  console.log('\n━━━ EPILOGUE ━━━\n');

  // ════════════════════════════════════════
  //  Scene 13: Landing Page
  // ════════════════════════════════════════
  console.log('[Scene 13] Landing Page');
  await page.goto(`${FRONTEND_URL}/landing`, GOTO);
  await page.waitForTimeout(2000);
  await screenshot(page, 'landing-hero');

  await page.evaluate(() => window.scrollTo(0, 800));
  await page.waitForTimeout(1000);
  await screenshot(page, 'landing-features');

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1000);
  await screenshot(page, 'landing-cta');


  // ════════════════════════════════════════
  //  Done — Keep browser open
  // ════════════════════════════════════════
  console.log(`
============================================================
  Recording complete: ${screenshotCount} screenshots
  Output: ${OUTPUT_DIR}

  Browser is still open. Press Ctrl+C to close.
============================================================
`);

  process.on('SIGINT', async () => {
    console.log('\nClosing browser...');
    await context.close();
    await browser.close();
    process.exit(0);
  });

  // Keep the process alive
  await new Promise(() => {});
}

main().catch(err => {
  console.error('Demo failed:', err);
  process.exit(1);
});
