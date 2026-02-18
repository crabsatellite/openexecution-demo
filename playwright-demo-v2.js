/**
 * OpenExecution v2 — Investor Demo Recording
 *
 * Records an investor-friendly browser walkthrough showing:
 *   Scene 1: Proof Dashboard — overview, stats, connected platforms
 *   Scene 2: Proof Dashboard — provenance chains with hash linkage
 *   Scene 3: Proof Dashboard — tamper detection proof
 *   Scene 4: Frontend — Login as Nexus Corp admin
 *   Scene 5: Frontend — Mission Control dashboard (live data)
 *   Scene 6: Frontend — Execution Chains (provenance)
 *   Scene 7: Frontend — Projects & workspace bindings
 *   Scene 8: Frontend — Landing page
 *
 * Prerequisites:
 *   - node serve-proof.js running on port 8080
 *   - API server running at localhost:3001 (with seeded data)
 *   - Frontend running at localhost:3000
 *   - Playwright installed: npm install playwright
 *
 * Usage: node playwright-demo-v2.js
 *
 * NOTE: Browser stays open until you press Ctrl+C
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const PROOF_PAGE = 'http://localhost:8080';
const FRONTEND = 'http://localhost:3000';
const OUTPUT_DIR = path.join(__dirname, 'recording-v2');

// Demo credentials
const NEXUS_EMAIL = 'admin@nexuscorp.io';
const NEXUS_PASS = 'demo-nexus-2026!';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function smoothScroll(page, distance, duration = 2000) {
  const steps = 40;
  const stepDist = distance / steps;
  const stepTime = duration / steps;
  for (let i = 0; i < steps; i++) {
    await page.evaluate((d) => window.scrollBy(0, d), stepDist);
    await sleep(stepTime);
  }
}

async function scrollToTop(page) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await sleep(800);
}

async function screenshot(page, name) {
  await page.screenshot({ path: path.join(OUTPUT_DIR, `${name}.png`) });
  console.log(`    [screenshot] ${name}.png`);
}

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('  OPENEXECUTION v2 — INVESTOR DEMO RECORDING');
  console.log('  Browser will stay open until you press Ctrl+C');
  console.log('='.repeat(60) + '\n');

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Check services
  const services = {};
  for (const [name, url] of [['Proof Page', PROOF_PAGE], ['API', 'http://localhost:3001/api/v1/health'], ['Frontend', FRONTEND]]) {
    try {
      const r = await fetch(url);
      services[name] = r.ok || r.status === 307;
    } catch { services[name] = false; }
    console.log(`  ${services[name] ? '\u2713' : '\u2717'} ${name}: ${services[name] ? 'running' : 'NOT RUNNING'}`);
  }
  if (!services['Proof Page']) {
    console.error('\n  FATAL: Proof page not running. Start with: node serve-proof.js');
    process.exit(1);
  }
  console.log('');

  const browser = await chromium.launch({
    headless: false,
    args: ['--start-maximized'],
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: {
      dir: OUTPUT_DIR,
      size: { width: 1920, height: 1080 },
    },
  });

  const page = await context.newPage();

  // ============================================================
  // SCENE 1: Proof Dashboard — Overview
  // ============================================================
  console.log('  [Scene 1] Proof Dashboard — Overview & Stats');

  await page.goto(PROOF_PAGE, { waitUntil: 'networkidle', timeout: 15000 });
  await sleep(2000);
  await screenshot(page, '01-proof-overview');

  // Pause on the scenario banner + stats
  await sleep(3000);

  // Scroll to connected platforms
  await smoothScroll(page, 500, 2500);
  await sleep(2000);
  await screenshot(page, '02-proof-platforms');

  // ============================================================
  // SCENE 2: Proof Dashboard — Provenance Chains
  // ============================================================
  console.log('  [Scene 2] Proof Dashboard — Provenance Chains');

  await smoothScroll(page, 500, 2500);
  await sleep(2000);
  await screenshot(page, '03-proof-chain-vercel');

  // Scroll to see hash linkage
  await smoothScroll(page, 500, 2500);
  await sleep(3000);
  await screenshot(page, '04-proof-chain-linkage');

  // Scroll to Figma chain
  await smoothScroll(page, 500, 2500);
  await sleep(2000);
  await screenshot(page, '05-proof-chain-figma');

  // ============================================================
  // SCENE 3: Proof Dashboard — Tamper Detection
  // ============================================================
  console.log('  [Scene 3] Proof Dashboard — Tamper Detection');

  await smoothScroll(page, 600, 2500);
  await sleep(2000);
  await screenshot(page, '06-proof-tamper-detection');

  // Scroll to formula + verification result
  await smoothScroll(page, 500, 2500);
  await sleep(3000);
  await screenshot(page, '07-proof-verified');

  // ============================================================
  // SCENE 4: Frontend — Login
  // ============================================================
  if (services['Frontend']) {
    console.log('  [Scene 4] Frontend — Login as Nexus Corp Admin');

    await page.goto(`${FRONTEND}/auth/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(2000);
    await screenshot(page, '08-frontend-login');

    try {
      // Type email slowly for demo effect
      const emailInput = page.locator('input[type="email"], input[name="email"]').first();
      const passInput = page.locator('input[type="password"], input[name="password"]').first();

      if (await emailInput.isVisible({ timeout: 3000 })) {
        await emailInput.click();
        await emailInput.fill('');
        await page.keyboard.type(NEXUS_EMAIL, { delay: 60 });
        await sleep(500);

        await passInput.click();
        await passInput.fill('');
        await page.keyboard.type(NEXUS_PASS, { delay: 60 });
        await sleep(1000);
        await screenshot(page, '09-frontend-login-filled');

        // Submit
        const submitBtn = page.locator('button[type="submit"]').first();
        await submitBtn.click();
        await sleep(4000);
        await screenshot(page, '10-frontend-after-login');
      }
    } catch (e) {
      console.log('    Login form interaction skipped:', e.message);
    }

    // ============================================================
    // SCENE 5: Frontend — Mission Control
    // ============================================================
    console.log('  [Scene 5] Frontend — Mission Control Dashboard');

    await page.goto(FRONTEND, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3000);
    await screenshot(page, '11-frontend-mission-control');

    await smoothScroll(page, 500, 2500);
    await sleep(2000);
    await screenshot(page, '12-frontend-dashboard-cards');

    // ============================================================
    // SCENE 6: Frontend — Execution Chains
    // ============================================================
    console.log('  [Scene 6] Frontend — Execution Chains');

    await page.goto(`${FRONTEND}/dashboard/provenance`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3000);
    await screenshot(page, '13-frontend-chains');

    await smoothScroll(page, 400, 2000);
    await sleep(2000);
    await screenshot(page, '14-frontend-chains-scroll');

    // ============================================================
    // SCENE 7: Frontend — Projects & Bindings
    // ============================================================
    console.log('  [Scene 7] Frontend — Projects & Workspace Bindings');

    await page.goto(`${FRONTEND}/projects`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3000);
    await screenshot(page, '15-frontend-projects');

    // Try to click into project detail
    try {
      const projectLink = page.locator('a[href*="projects/"]').first();
      if (await projectLink.isVisible({ timeout: 3000 })) {
        await projectLink.click();
        await sleep(3000);
        await screenshot(page, '16-frontend-project-detail');

        await smoothScroll(page, 400, 2000);
        await sleep(2000);
        await screenshot(page, '17-frontend-project-bindings');
      }
    } catch {
      console.log('    Project detail navigation skipped');
    }

    // ============================================================
    // SCENE 8: Frontend — Landing Page
    // ============================================================
    console.log('  [Scene 8] Frontend — Landing Page');

    await page.goto(`${FRONTEND}/landing`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3000);
    await screenshot(page, '18-frontend-landing-hero');

    await smoothScroll(page, 800, 3000);
    await sleep(2000);
    await screenshot(page, '19-frontend-landing-features');

    await smoothScroll(page, 800, 3000);
    await sleep(2000);
    await screenshot(page, '20-frontend-landing-how');

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(2000);
    await screenshot(page, '21-frontend-landing-cta');

  } else {
    console.log('  [Scenes 4-8 skipped — frontend not running]');
  }

  // ============================================================
  // FINAL: Return to proof page for closing shot
  // ============================================================
  console.log('  [Final] Proof Dashboard — Verification Result');

  await page.goto(PROOF_PAGE, { waitUntil: 'networkidle', timeout: 15000 });
  // Scroll to the green verification result
  await page.evaluate(() => {
    const el = document.querySelector('.verify-result');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  await sleep(3000);
  await screenshot(page, '22-final-verified');

  // ============================================================
  // DONE — keep browser open
  // ============================================================
  const screenshots = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.png'));
  console.log(`\n  Recording complete: ${screenshots.length} screenshots`);
  console.log(`  Output: ${OUTPUT_DIR}`);
  console.log('\n  Browser is still open. Press Ctrl+C to close.\n');

  // Keep alive — don't close browser
  await new Promise(() => {});
}

// Handle Ctrl+C gracefully
process.on('SIGINT', async () => {
  console.log('\n  Closing browser...');

  // List outputs
  const recordings = fs.readdirSync(OUTPUT_DIR);
  const videos = recordings.filter(f => f.endsWith('.webm'));
  const pngs = recordings.filter(f => f.endsWith('.png'));

  console.log(`  Screenshots: ${pngs.length}`);
  if (videos.length > 0) {
    console.log(`  Video: ${path.join(OUTPUT_DIR, videos[videos.length - 1])}`);
  }
  console.log('  Done.\n');
  process.exit(0);
});

main().catch(err => {
  console.error('Demo recording failed:', err.message);
  process.exit(1);
});
