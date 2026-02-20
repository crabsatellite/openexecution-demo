#!/usr/bin/env node
/**
 * OpenExecution — Live Integration Demo Recording (Multi-Language)
 *
 * Pure recording script — events are pre-created by run-live-demo.js orchestrator.
 * Records a walkthrough of the platform with real GitHub + Vercel data, adding
 * subtitle overlays in the language specified by DEMO_LANG (en/zh/ja).
 *
 * Env vars provided by orchestrator:
 *   DEMO_LANG       — "en" | "zh" | "ja"
 *   ISSUE_NUMBER    — GitHub issue number (pre-created)
 *   API_URL, FRONTEND_URL, TUNNEL_URL
 *   GITHUB_*, VERCEL_*, PROJECT_ID, USER_JWT
 *
 * Output: recording-live-{lang}/ with screenshots + video
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// ── Config from Orchestrator ──

const LANG = process.env.DEMO_LANG || 'en';
const ISSUE_NUMBER = process.env.ISSUE_NUMBER || '';

const API_URL = process.env.API_URL || 'http://localhost:3001/api/v1';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const TUNNEL_URL = process.env.TUNNEL_URL || '';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_OWNER = process.env.GITHUB_OWNER || '';
const GITHUB_REPO = process.env.GITHUB_REPO || '';
const GITHUB_CONN_ID = process.env.GITHUB_CONN_ID || '';

const VERCEL_TOKEN = process.env.VERCEL_TOKEN || '';
const VERCEL_PROJECT = process.env.VERCEL_PROJECT || '';
const VERCEL_CONN_ID = process.env.VERCEL_CONN_ID || '';

const PROJECT_ID = process.env.PROJECT_ID || '';
const USER_JWT = process.env.USER_JWT || '';

const USER_EMAIL = 'admin@nexuscorp.io';
const USER_PASSWORD = 'demo-nexus-2026!';

const OUTPUT_DIR = path.join(__dirname, `recording-live-${LANG}`);
const GOTO = { waitUntil: 'domcontentloaded', timeout: 60000 };

// ── Subtitle Translations ──
// Each key is a scene identifier. Value is { en, zh, ja }.

const SUBTITLES = {
  // ACT I — Login & Platform Overview
  login: {
    en: 'Logging into the OpenExecution platform, where all evidence is managed.',
    zh: '登录 OpenExecution 平台 — 所有证据在此管理。',
    ja: 'OpenExecutionプラットフォームにログイン — 全証拠をここで管理。',
  },
  missionControl: {
    en: 'Mission Control — real-time overview of all AI agent activity and evidence chains.',
    zh: '任务控制中心 — 实时掌握所有 AI 智能体活动与证据链。',
    ja: 'ミッションコントロール — AIエージェントのアクティビティとプロベナンスチェーンをリアルタイムで把握。',
  },
  adapters: {
    en: 'Connect existing tools like GitHub and Vercel. OpenExecution automatically captures every webhook event as evidence.',
    zh: '接入现有工具 — GitHub、Vercel — OpenExecution 自动将每个 Webhook 事件捕获为证据。',
    ja: '既存ツール（GitHub、Vercel）を接続するだけで — OpenExecutionが全Webhookイベントを証拠として自動記録。',
  },

  // ACT II — Real External Platforms
  githubRepo: {
    en: 'A real GitHub repository — the external platform where agents do their normal work.',
    zh: '真实的 GitHub 仓库 — 智能体执行日常工作的外部平台。',
    ja: '実際のGitHubリポジトリ — エージェントが通常業務を行う外部プラットフォーム。',
  },
  githubIssueBefore: {
    en: 'Standard GitHub issues — created by AI agents as part of their normal workflow.',
    zh: '标准 GitHub Issue — 由 AI 智能体在常规工作流中自动创建。',
    ja: '通常のGitHubイシュー — AIエージェントが通常のワークフローで作成。',
  },
  githubIssueDetail: {
    en: 'This issue was created by an agent via API — the webhook event was automatically recorded by OpenExecution.',
    zh: '此 Issue 由智能体通过 API 创建 — Webhook 事件已由 OpenExecution 自动捕获入账。',
    ja: 'このイシューはエージェントがAPI経由で作成 — WebhookイベントはOpenExecutionが自動記録済み。',
  },

  // ACT III — Platform Records (the core value proposition)
  projectWorkspaces: {
    en: 'Workspace bindings — every connected platform automatically feeds evidence into the provenance chain.',
    zh: '工作区绑定 — 每个已连接平台自动将证据注入溯源链。',
    ja: 'ワークスペースバインディング — 接続した各プラットフォームから証拠が自動的にプロベナンスチェーンへ流入。',
  },
  auditTrail: {
    en: 'Complete audit trail — every API call and webhook event, with SHA-256 integrity hash. Tamper-evident.',
    zh: '完整审计追踪 — 每个 API 调用与 Webhook 事件均附 SHA-256 完整性哈希。防篡改。',
    ja: '完全な監査証跡 — 全APIコールとWebhookイベント、SHA-256整合性ハッシュ付き。改ざん防止。',
  },
  auditScroll: {
    en: 'Each event includes full payload, timestamp, and cryptographic proof — independently verifiable.',
    zh: '每条事件记录包含完整载荷、时间戳与密码学证明 — 可独立核验。',
    ja: '各イベントに完全なペイロード、タイムスタンプ、暗号証明 — 独立検証可能。',
  },
  provenanceChains: {
    en: 'Provenance chains — hash-linked records that prove the complete history of every AI agent action.',
    zh: '溯源链 — 哈希链接记录，证明每个 AI 智能体操作的完整历史。',
    ja: 'プロベナンスチェーン — AIエージェントのあらゆる操作履歴を証明する、ハッシュリンクされた記録。',
  },
  chainExpanded: {
    en: 'Each event is Ed25519 signed and hash-chained — the "flight recorder" for AI agent actions.',
    zh: '每个事件均经 Ed25519 签名并哈希链接 — AI 智能体的行为黑匣子。',
    ja: '各イベントはEd25519署名とハッシュチェーン — AIエージェント行動の「フライトレコーダー」。',
  },

  // ACT IV — Return to Dashboard
  missionControlAfter: {
    en: 'Back to Mission Control — all events from connected platforms recorded automatically. Zero manual effort.',
    zh: '返回任务控制中心 — 所有已接入平台的事件均已自动记录。零人工干预。',
    ja: 'ミッションコントロールに戻る — 接続されたプラットフォームの全イベントが自動記録。手動操作ゼロ。',
  },

  // EPILOGUE — Landing Page
  landingHero: {
    en: 'OpenExecution — The Flight Recorder for AI Agent Actions',
    zh: 'OpenExecution — AI 智能体的飞行黑匣子',
    ja: 'OpenExecution — AIエージェント行動のフライトレコーダー',
  },
  landingFeatures: {
    en: 'Every action recorded. Every decision traceable. Every agent accountable.',
    zh: '每一操作，皆有记录。每一决策，均可追溯。每一智能体，皆须问责。',
    ja: 'すべての操作を記録。すべての判断を追跡。すべてのエージェントに説明責任。',
  },
  landingCta: {
    en: 'The third-party behavioral ledger for AI agents. Accountability infrastructure for autonomous agents.',
    zh: 'AI 智能体的第三方行为账本 — 将问责落实于基础设施层。',
    ja: 'AIエージェントのための第三者行動台帳 — インフラレベルで説明責任を実現。',
  },

  // Vercel Pitch Deck Evidence
  vercelEn: {
    en: 'Real Vercel deployment — English pitch deck. Deployment events are captured as provenance evidence.',
    zh: '真实 Vercel 部署 — 英文版 Pitch Deck。部署事件被捕获为溯源证据。',
    ja: '実際のVercelデプロイ — 英語版ピッチデック。デプロイイベントはプロベナンス証拠として記録。',
  },
  vercelZh: {
    en: 'Real Vercel deployment — Chinese pitch deck. Multi-language deployment monitoring.',
    zh: '真实 Vercel 部署 — 中文版 Pitch Deck。多语言部署监控。',
    ja: '実際のVercelデプロイ — 中国語版ピッチデック。多言語デプロイ監視。',
  },
  vercelJa: {
    en: 'Real Vercel deployment — Japanese pitch deck. Three languages, three deployments, one ledger.',
    zh: '真实 Vercel 部署 — 日文版 Pitch Deck。三种语言、三个部署、一个账本。',
    ja: '実際のVercelデプロイ — 日本語版ピッチデック。3言語、3デプロイ、1つの台帳。',
  },
};

function sub(key) {
  const entry = SUBTITLES[key];
  if (!entry) return key;
  return entry[LANG] || entry.en || key;
}

// ── Helpers ──

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

let screenshotCount = 0;
async function screenshot(page, label) {
  screenshotCount++;
  const filename = `${String(screenshotCount).padStart(2, '0')}-${label}.png`;
  await page.screenshot({ path: path.join(OUTPUT_DIR, filename), fullPage: false });
  console.log(`    [${LANG}] screenshot: ${filename}`);
}

// ── Subtitle System ──
// Injects a fixed-position overlay captured by Playwright's recordVideo.
// Re-inject after every page.goto() since the DOM is replaced.

async function showSubtitle(page, text, durationMs = 4000) {
  // Determine if text has CJK characters for font sizing
  const hasCJK = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/.test(text);
  const fontSize = hasCJK ? '22px' : '20px';

  await page.evaluate(({ text, durationMs, fontSize }) => {
    const existing = document.getElementById('oe-demo-subtitle');
    if (existing) existing.remove();

    const el = document.createElement('div');
    el.id = 'oe-demo-subtitle';
    el.textContent = text;
    Object.assign(el.style, {
      position: 'fixed',
      bottom: '40px',
      left: '50%',
      transform: 'translateX(-50%)',
      backgroundColor: 'rgba(0, 0, 0, 0.88)',
      color: '#ffffff',
      fontFamily: '"Noto Sans SC", "Noto Sans JP", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize,
      fontWeight: '500',
      padding: '16px 40px',
      borderRadius: '12px',
      boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
      zIndex: '99999',
      maxWidth: '88vw',
      textAlign: 'center',
      lineHeight: '1.6',
      opacity: '0',
      transition: 'opacity 0.4s ease-in-out',
      letterSpacing: '0.02em',
      pointerEvents: 'none',
      whiteSpace: 'pre-wrap',
      wordBreak: 'keep-all',
    });
    document.body.appendChild(el);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => { el.style.opacity = '1'; });
    });

    if (durationMs > 0) {
      setTimeout(() => {
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 500);
      }, durationMs);
    }
  }, { text, durationMs, fontSize });

  await sleep(500); // Wait for fade-in
}

async function clearSubtitle(page) {
  await page.evaluate(() => {
    const el = document.getElementById('oe-demo-subtitle');
    if (el) {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 500);
    }
  });
  await sleep(600);
}


// ── Intro Title Card ── (full-screen overlay before the demo starts)

const INTRO_TITLE = {
  en: 'LIVE DEMO',
  zh: '现场演示',
  ja: 'ライブデモ',
};
const INTRO_HEADING = {
  en: 'From Zero to Full Operation',
  zh: '从零到完整运行',
  ja: 'ゼロから完全稼働まで',
};
const INTRO_DESC = {
  en: 'Starting from an empty database — register a user, connect GitHub and Vercel,\nbind workspaces, and watch real webhook events flow in as tamper-evident\nprovenance records with Ed25519 signatures and SHA-256 integrity hashes.',
  zh: '从空白数据库开始 — 注册用户、连接 GitHub 和 Vercel 工作区，\n真实 Webhook 事件持续流入 — 每个操作都被自动记录\n至附有 Ed25519 签名与 SHA-256 完整性哈希的防篡改溯源链中。',
  ja: '空のデータベースから開始 — ユーザー登録、GitHubとVercelを接続し、\nワークスペースをバインド。実際のWebhookイベントが流入 —\nEd25519署名とSHA-256整合性ハッシュによる改ざん防止プロベナンス記録として自動記録。',
};

async function showIntroCard(page, title, heading, desc) {
  const hasCJK = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/.test(heading);
  await page.evaluate(({ title, heading, desc, hasCJK }) => {
    const el = document.createElement('div');
    el.id = 'oe-intro-card';
    Object.assign(el.style, {
      position: 'fixed', inset: '0', zIndex: '100000',
      background: 'linear-gradient(135deg, #0d1117 0%, #161b22 100%)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      opacity: '0', transition: 'opacity 0.8s ease-in-out',
    });
    el.innerHTML = `
      <div style="color:#01A5CD;font-size:14px;letter-spacing:4px;text-transform:uppercase;margin-bottom:12px;font-weight:600">${title}</div>
      <div style="color:#e6edf3;font-size:${hasCJK ? '38px' : '36px'};font-weight:800;margin-bottom:20px;letter-spacing:-0.5px;text-align:center">${heading}</div>
      <div style="color:#8b949e;font-size:${hasCJK ? '17px' : '16px'};line-height:1.8;text-align:center;max-width:800px;white-space:pre-wrap;word-break:keep-all">${desc}</div>
      <div style="margin-top:40px;display:flex;align-items:center;gap:10px">
        <div style="width:8px;height:8px;border-radius:50%;background:#32B173;animation:pulse 1.2s infinite"></div>
        <span style="color:#8b949e;font-size:13px">OpenExecution</span>
      </div>
    `;
    const style = document.createElement('style');
    style.textContent = '@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}';
    document.head.appendChild(style);
    document.body.appendChild(el);
    requestAnimationFrame(() => { requestAnimationFrame(() => { el.style.opacity = '1'; }); });
  }, { title, heading, desc, hasCJK });
  await sleep(800);
}

async function hideIntroCard(page) {
  await page.evaluate(() => {
    const el = document.getElementById('oe-intro-card');
    if (el) { el.style.opacity = '0'; setTimeout(() => el.remove(), 1000); }
  });
  await sleep(1200);
}


// ════════════════════════════════════════
//  MAIN
// ════════════════════════════════════════

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const langLabel = { en: 'English', zh: '\u4e2d\u6587', ja: '\u65e5\u672c\u8a9e' }[LANG] || LANG;
  console.log(`
${'='.repeat(62)}
  OPENEXECUTION \u2014 LIVE DEMO RECORDING [${langLabel}]
  Real GitHub + Vercel | Subtitle Narration
${'='.repeat(62)}
`);
  console.log(`  Language:  ${langLabel} (${LANG})`);
  console.log(`  GitHub:    ${GITHUB_OWNER}/${GITHUB_REPO}`);
  console.log(`  Issue:     #${ISSUE_NUMBER || 'N/A'}`);
  console.log(`  Output:    ${OUTPUT_DIR}\n`);

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
  await context.addCookies([{
    name: 'oe_locale',
    value: LANG,
    url: FRONTEND_URL,
  }]);
  const page = await context.newPage();


  // ╔═══════════════════════════════════════════════╗
  // ║  INTRO TITLE CARD                               ║
  // ╚═══════════════════════════════════════════════╝

  console.log('\n\u2501\u2501\u2501 INTRO TITLE CARD \u2501\u2501\u2501\n');

  await page.goto('about:blank');
  await sleep(800);
  await showIntroCard(
    page,
    INTRO_TITLE[LANG] || INTRO_TITLE.en,
    INTRO_HEADING[LANG] || INTRO_HEADING.en,
    INTRO_DESC[LANG] || INTRO_DESC.en,
  );
  await screenshot(page, 'intro-title-card');
  await sleep(6000);
  await hideIntroCard(page);


  // ╔═══════════════════════════════════════════════╗
  // ║  ACT I — LOGIN & PLATFORM OVERVIEW            ║
  // ╚═══════════════════════════════════════════════╝

  console.log('\n\u2501\u2501\u2501 ACT I: LOGIN & PLATFORM OVERVIEW \u2501\u2501\u2501\n');

  // ════════════════════════════════════════
  //  Scene 1: Login
  // ════════════════════════════════════════
  console.log('[Scene 1] Login');
  await page.goto(`${FRONTEND_URL}/auth/login`, GOTO);
  await page.waitForTimeout(1500);

  // Ensure locale cookie is readable — backup via document.cookie
  await page.evaluate((lang) => {
    document.cookie = `oe_locale=${lang};path=/;max-age=31536000`;
  }, LANG);
  // Reload so TranslationProvider picks up the cookie on mount
  await page.reload(GOTO);
  await page.waitForTimeout(1500);

  await showSubtitle(page, sub('login'), 0);
  await screenshot(page, 'login-page');

  // Visual fill for screenshot — set input values via React's internal setter
  await page.evaluate(({ email, password }) => {
    const emailInput = document.querySelector('#email');
    const passwordInput = document.querySelector('#password');
    if (emailInput) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(emailInput, email);
      emailInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (passwordInput) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(passwordInput, password);
      passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, { email: USER_EMAIL, password: USER_PASSWORD });
  await page.waitForTimeout(500);

  await screenshot(page, 'login-filled');

  // Auth: perform actual login via API from within the browser
  await clearSubtitle(page);
  const loginSuccess = await page.evaluate(async ({ apiUrl, email, password }) => {
    try {
      const res = await fetch(`${apiUrl}/users/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      const token = json?.data?.token;
      if (token) {
        localStorage.setItem('oe_user_token', token);
        return true;
      }
      console.error('[Login] No token in response:', JSON.stringify(json).substring(0, 200));
      return false;
    } catch (e) {
      console.error('[Login] Fetch error:', e.message);
      return false;
    }
  }, { apiUrl: API_URL, email: USER_EMAIL, password: USER_PASSWORD });

  if (!loginSuccess && USER_JWT) {
    console.log(`    [${LANG}] ⚠ Browser login failed — falling back to env-var JWT`);
    await page.evaluate((jwt) => {
      localStorage.setItem('oe_user_token', jwt);
    }, USER_JWT);
  }

  console.log(`    [${LANG}] Login: ${loginSuccess ? 'browser API' : 'env JWT fallback'}`);
  await page.goto(`${FRONTEND_URL}/dashboard`, GOTO);
  await page.waitForTimeout(3500);
  await screenshot(page, 'after-login');


  // ════════════════════════════════════════
  //  Scene 2: Mission Control
  // ════════════════════════════════════════
  console.log('[Scene 2] Mission Control');
  await page.goto(`${FRONTEND_URL}/`, GOTO);
  await page.waitForTimeout(3000);
  await showSubtitle(page, sub('missionControl'), 0);
  await page.waitForTimeout(1000);
  await screenshot(page, 'mission-control');
  await clearSubtitle(page);


  // ════════════════════════════════════════
  //  Scene 3: Adapters — Connections Active
  // ════════════════════════════════════════
  console.log('[Scene 3] Adapters');
  await page.goto(`${FRONTEND_URL}/dashboard/adapters`, GOTO);
  await page.waitForTimeout(2000);
  await showSubtitle(page, sub('adapters'), 0);
  await page.waitForTimeout(1000);
  await screenshot(page, 'adapters-connected');
  await clearSubtitle(page);


  // ╔═══════════════════════════════════════════════╗
  // ║  ACT II — REAL EXTERNAL PLATFORMS              ║
  // ╚═══════════════════════════════════════════════╝

  console.log('\n\u2501\u2501\u2501 ACT II: REAL EXTERNAL PLATFORMS \u2501\u2501\u2501\n');

  // ════════════════════════════════════════
  //  Scene 4: GitHub Repository Page
  // ════════════════════════════════════════
  console.log('[Scene 4] GitHub Repository');
  await page.goto(`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`, {
    ...GOTO, timeout: 30000,
  });
  await page.waitForTimeout(3000);
  await showSubtitle(page, sub('githubRepo'), 0);
  await page.waitForTimeout(1000);
  await screenshot(page, 'github-repo');
  await clearSubtitle(page);


  // ════════════════════════════════════════
  //  Scene 5: GitHub Issues List
  // ════════════════════════════════════════
  console.log('[Scene 5] GitHub Issues');
  await page.goto(`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/issues`, {
    ...GOTO, timeout: 30000,
  });
  await page.waitForTimeout(3000);
  await showSubtitle(page, sub('githubIssueBefore'), 0);
  await page.waitForTimeout(1000);
  await screenshot(page, 'github-issues');
  await clearSubtitle(page);


  // ════════════════════════════════════════
  //  Scene 6: GitHub Issue Detail (pre-created by orchestrator)
  // ════════════════════════════════════════
  if (ISSUE_NUMBER) {
    console.log(`[Scene 6] GitHub Issue #${ISSUE_NUMBER}`);
    await page.goto(`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/issues/${ISSUE_NUMBER}`, {
      ...GOTO, timeout: 30000,
    });
    await page.waitForTimeout(3000);
    await showSubtitle(page, sub('githubIssueDetail'), 0);
    await page.waitForTimeout(1500);
    await screenshot(page, 'github-issue-detail');
    await clearSubtitle(page);
  }


  // ╔═══════════════════════════════════════════════╗
  // ║  ACT II-B — REAL VERCEL DEPLOYMENTS (EVIDENCE) ║
  // ╚═══════════════════════════════════════════════╝

  console.log('\n\u2501\u2501\u2501 ACT II-B: VERCEL DEPLOYMENT EVIDENCE \u2501\u2501\u2501\n');

  // ════════════════════════════════════════
  //  Scene 7: Vercel — English Pitch Deck
  // ════════════════════════════════════════
  console.log('[Scene 7] Vercel — English Pitch Deck');
  await page.goto('https://pitch-deck-en.vercel.app', { ...GOTO, timeout: 30000 });
  await page.waitForTimeout(3000);
  await showSubtitle(page, sub('vercelEn'), 0);
  await page.waitForTimeout(1500);
  await screenshot(page, 'vercel-en');
  await clearSubtitle(page);


  // ════════════════════════════════════════
  //  Scene 8: Vercel — Chinese Pitch Deck
  // ════════════════════════════════════════
  console.log('[Scene 8] Vercel — Chinese Pitch Deck');
  await page.goto('https://pitch-deck-zh.vercel.app', { ...GOTO, timeout: 30000 });
  await page.waitForTimeout(3000);
  await showSubtitle(page, sub('vercelZh'), 0);
  await page.waitForTimeout(1500);
  await screenshot(page, 'vercel-zh');
  await clearSubtitle(page);


  // ════════════════════════════════════════
  //  Scene 9: Vercel — Japanese Pitch Deck
  // ════════════════════════════════════════
  console.log('[Scene 9] Vercel — Japanese Pitch Deck');
  await page.goto('https://pitch-deck-ja.vercel.app', { ...GOTO, timeout: 30000 });
  await page.waitForTimeout(3000);
  await showSubtitle(page, sub('vercelJa'), 0);
  await page.waitForTimeout(1500);
  await screenshot(page, 'vercel-ja');
  await clearSubtitle(page);


  // ╔═══════════════════════════════════════════════╗
  // ║  ACT III — PLATFORM RECORDS                    ║
  // ╚═══════════════════════════════════════════════╝

  console.log('\n\u2501\u2501\u2501 ACT III: PLATFORM RECORDS \u2501\u2501\u2501\n');

  // ════════════════════════════════════════
  //  Scene 10: Project Workspaces — Audit Events
  // ════════════════════════════════════════
  console.log('[Scene 10] Project Workspaces');
  let projectTabsLoaded = false;
  if (PROJECT_ID) {
    await page.goto(`${FRONTEND_URL}/projects/${PROJECT_ID}`, GOTO);
    await page.waitForTimeout(3000); // Wait for SWR data fetch + render
    try {
      await page.locator('[role="tab"]').first().waitFor({ state: 'visible', timeout: 20000 });
      projectTabsLoaded = true;
    } catch {
      console.log(`    [${LANG}] ⚠ Project tabs did not appear — taking diagnostic screenshot`);
      await screenshot(page, 'project-debug');
    }
    if (projectTabsLoaded) {
      await page.waitForTimeout(500);
      // Click the Workspaces tab by its text content (localized)
      const wsText = LANG === 'zh' ? '工作区' : LANG === 'ja' ? 'ワークスペース' : 'Workspaces';
      await page.locator('[role="tab"]').filter({ hasText: wsText }).click();
      await page.waitForTimeout(2500);
      await showSubtitle(page, sub('projectWorkspaces'), 0);
      await page.waitForTimeout(1000);
      await screenshot(page, 'project-workspaces');
      await clearSubtitle(page);
    }
  }


  // ════════════════════════════════════════
  //  Scene 11: Project Audit Trail
  // ════════════════════════════════════════
  console.log('[Scene 11] Project Audit Trail');
  if (PROJECT_ID && projectTabsLoaded) {
    const atText = LANG === 'zh' ? '审计追踪' : LANG === 'ja' ? '監査証跡' : 'Audit Trail';
    await page.locator('[role="tab"]').filter({ hasText: atText }).click();
    await page.waitForTimeout(2500);
    await showSubtitle(page, sub('auditTrail'), 0);
    await page.waitForTimeout(1000);
    await screenshot(page, 'project-audit-trail');

    // Scroll to show more entries
    await page.evaluate(() => window.scrollTo(0, 400));
    await page.waitForTimeout(1000);
    await showSubtitle(page, sub('auditScroll'), 0);
    await screenshot(page, 'project-audit-scroll');
    await clearSubtitle(page);
  }


  // ════════════════════════════════════════
  //  Scene 12: Provenance Chains
  // ════════════════════════════════════════
  console.log('[Scene 12] Provenance Chains');
  await page.goto(`${FRONTEND_URL}/dashboard/provenance`, GOTO);
  await page.waitForTimeout(3000);
  await showSubtitle(page, sub('provenanceChains'), 0);
  await page.waitForTimeout(1000);
  await screenshot(page, 'provenance-chains');

  // Attempt to expand a chain for detail view
  try {
    const chainsText = LANG === 'zh' ? '链' : LANG === 'ja' ? 'チェーン' : 'Chains';
    await page.locator('nav[aria-label="Tabs"] button').filter({ hasText: chainsText }).click();
    await page.waitForTimeout(2000);

    const chainRow = page.locator('button.w-full.text-left').first();
    if (await chainRow.count() > 0) {
      await chainRow.click();
      await page.waitForTimeout(2500);
      await showSubtitle(page, sub('chainExpanded'), 0);
      await page.waitForTimeout(1000);
      await screenshot(page, 'chain-expanded');
    }
  } catch (err) {
    console.log(`  (Could not expand chain: ${err.message})`);
  }
  await clearSubtitle(page);


  // ╔═══════════════════════════════════════════════╗
  // ║  ACT IV — RETURN TO DASHBOARD                  ║
  // ╚═══════════════════════════════════════════════╝

  console.log('\n\u2501\u2501\u2501 ACT IV: RETURN TO DASHBOARD \u2501\u2501\u2501\n');

  // ════════════════════════════════════════
  //  Scene 13: Mission Control — Summary
  // ════════════════════════════════════════
  console.log('[Scene 13] Mission Control — Summary');
  await page.goto(`${FRONTEND_URL}/`, GOTO);
  await page.waitForTimeout(3000);
  await showSubtitle(page, sub('missionControlAfter'), 0);
  await page.waitForTimeout(1500);
  await screenshot(page, 'mission-control-final');
  await clearSubtitle(page);


  // ╔═══════════════════════════════════════════════╗
  // ║  EPILOGUE — Landing Page                       ║
  // ╚═══════════════════════════════════════════════╝

  console.log('\n\u2501\u2501\u2501 EPILOGUE \u2501\u2501\u2501\n');

  // ════════════════════════════════════════
  //  Scene 14: Landing Page
  // ════════════════════════════════════════
  console.log('[Scene 14] Landing Page');
  await page.goto(`${FRONTEND_URL}/landing`, GOTO);
  await page.waitForTimeout(2000);
  await showSubtitle(page, sub('landingHero'), 0);
  await page.waitForTimeout(1500);
  await screenshot(page, 'landing-hero');

  await clearSubtitle(page);
  await page.evaluate(() => window.scrollTo(0, 800));
  await page.waitForTimeout(1500);

  await showSubtitle(page, sub('landingFeatures'), 0);
  await page.waitForTimeout(1000);
  await screenshot(page, 'landing-features');

  await clearSubtitle(page);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1500);

  await showSubtitle(page, sub('landingCta'), 0);
  await page.waitForTimeout(1000);
  await screenshot(page, 'landing-cta');
  await clearSubtitle(page);


  // ── Done ──
  console.log(`
${'='.repeat(62)}
  [${langLabel}] Recording complete: ${screenshotCount} screenshots
  Output: ${OUTPUT_DIR}

  Browser closing in 3 seconds...
${'='.repeat(62)}
`);

  await sleep(3000);
  await context.close();
  await browser.close();
}

main().catch(async (err) => {
  console.error(`[${LANG}] Demo failed:`, err);
  process.exit(1);
});
