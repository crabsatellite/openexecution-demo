#!/usr/bin/env node
/**
 * OpenExecution — Pitch Deck Recording (Multi-Language)
 *
 * Records a full walkthrough of the pitch deck including:
 *   - All 13 slides with subtitles
 *   - Navigation into both demo pages (Infra + Platform)
 *   - Screenshots of each slide and demo step
 *   - Full WebM video via Playwright recordVideo
 *
 * Env vars (from orchestrator):
 *   DEMO_LANG        — "en" | "zh" | "ja"  (default: "en")
 *   PITCH_DECK_URL   — URL to the pitch deck (default: http://localhost:5173)
 *
 * Output: recording-pitch-deck-{lang}/ with numbered screenshots + video
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// ── Config ──

const LANG = process.env.DEMO_LANG || 'en';
const BASE_URL = process.env.PITCH_DECK_URL || 'http://localhost:5173';
const OUTPUT_DIR = path.join(__dirname, `recording-pitch-deck-${LANG}`);

// ── Helpers ──

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let screenshotCount = 0;
async function screenshot(page, name) {
  screenshotCount++;
  const file = `${String(screenshotCount).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: path.join(OUTPUT_DIR, file), fullPage: false });
  console.log(`    📸 ${file}`);
}

function sub(key) {
  const entry = SUBTITLES[key];
  return entry ? (entry[LANG] || entry.en) : key;
}

// ── Subtitle Translations ──

const SUBTITLES = {
  cover: {
    en: 'Cover: Ed25519-signed, hash-chained, tamper-evident provenance for AI agents.',
    zh: '封面：Ed25519 签名、哈希链接、防篡改的 AI 智能体溯源系统。',
    ja: '表紙：Ed25519署名、ハッシュチェーン、改ざん防止のAIエージェント・プロベナンス。',
  },
  thesis: {
    en: 'The Thesis: Agents act across every system. No single system records what they did.',
    zh: '核心论点：智能体在每个系统中操作，但没有任何系统完整记录他们的行为。',
    ja: 'テーゼ：エージェントはあらゆるシステムで動作するが、何をしたか記録する統一システムは存在しない。',
  },
  gap: {
    en: 'The Gap: Existing tools monitor, but none create portable, cryptographic proof of what happened.',
    zh: '市场空白：现有工具可以监控，但没有工具能创建可移植的密码学行为证明。',
    ja: 'ギャップ：既存ツールは監視できるが、可搬性のある暗号学的行動証明は作れない。',
  },
  solution: {
    en: 'The Solution: A third-party behavioral ledger — not logs, not monitoring, but signed proof.',
    zh: '解决方案：第三方行为账本 — 不是日志，不是监控，而是签名的证明。',
    ja: 'ソリューション：サードパーティの行動台帳 — ログでも監視でもなく、署名された証明。',
  },
  whyNow: {
    en: 'Why Now: 2025-2027 — the standards window. First mover defines the category.',
    zh: '为什么是现在：2025-2027 标准窗口期。先行者定义品类。',
    ja: 'なぜ今か：2025-2027年は標準化の窓。先行者がカテゴリーを定義する。',
  },
  howItWorks: {
    en: 'How It Works: 5-step flow from agent action to verifiable certificate.',
    zh: '工作原理：从智能体操作到可验证证书的 5 步流程。',
    ja: '仕組み：エージェントの動作から検証可能な証明書まで5ステップ。',
  },
  architecture: {
    en: 'Architecture: Core engine, multi-platform adapters, and provenance certificates.',
    zh: '架构：核心引擎、多平台适配器和溯源证书。',
    ja: 'アーキテクチャ：コアエンジン、マルチプラットフォームアダプター、プロベナンス証明書。',
  },
  demoScenario: {
    en: 'Demo Scenario: Two live demos — Enterprise AI Infrastructure and Platform Monitoring.',
    zh: '演示场景：两个实时演示 — 企业级 AI 基础设施与平台监控。',
    ja: 'デモシナリオ：2つのライブデモ — エンタープライズAIインフラとプラットフォーム監視。',
  },
  traction: {
    en: 'Traction & Validation: What we have built and the pipeline ahead.',
    zh: '市场验证：已构建的产品和前方的增长管线。',
    ja: 'トラクション：構築済みのプロダクトと今後のパイプライン。',
  },
  founder: {
    en: 'Founder: Background, system thinking, and expansion roadmap.',
    zh: '创始人：背景、系统性思维和扩展路线图。',
    ja: '創業者：バックグラウンド、システム思考、拡張ロードマップ。',
  },
  valueCapture: {
    en: 'Value Capture: Three adoption phases and domain expansion strategy.',
    zh: '价值捕获：三阶段采用路径与领域扩展策略。',
    ja: '価値獲得：3段階の普及フェーズとドメイン拡大戦略。',
  },
  liveProof: {
    en: 'Live Demo Proof: Cryptographic verification of execution chains.',
    zh: '实时证明：执行链的密码学验证。',
    ja: 'ライブデモ証明：実行チェーンの暗号学的検証。',
  },
  theAsk: {
    en: 'The Ask: Funding milestones and what we need to build the standard.',
    zh: '融资需求：资金里程碑和建立标准所需的资源。',
    ja: '資金調達：マイルストーンと標準構築に必要なリソース。',
  },
  demoInfraIntro: {
    en: 'Entering Demo: Enterprise AI Infrastructure — GLM-4 vulnerability remediation with provenance.',
    zh: '进入演示：企业级 AI 基础设施 — 带溯源的 GLM-4 漏洞修复。',
    ja: 'デモ開始：エンタープライズAIインフラ — プロベナンス付きGLM-4脆弱性修復。',
  },
  demoInfraScroll: {
    en: 'Each step is recorded with Ed25519 signatures, forming an immutable hash chain.',
    zh: '每一步都通过 Ed25519 签名记录，形成不可变的哈希链。',
    ja: '各ステップはEd25519署名で記録され、不変のハッシュチェーンを形成。',
  },
  demoPlatformIntro: {
    en: 'Entering Demo: Platform Behavior Monitoring — real-time dashboard and audit trail.',
    zh: '进入演示：平台行为监控 — 实时仪表盘和审计追踪。',
    ja: 'デモ開始：プラットフォーム行動監視 — リアルタイムダッシュボードと監査証跡。',
  },
  demoPlatformScroll: {
    en: 'Multi-platform adapters connect to GitHub, Vercel, Figma — one unified provenance view.',
    zh: '多平台适配器连接 GitHub、Vercel、Figma — 统一的溯源视图。',
    ja: 'マルチプラットフォームアダプターがGitHub、Vercel、Figmaを接続 — 統一プロベナンスビュー。',
  },
  closing: {
    en: 'Thank you for watching. OpenExecution — the behavioral ledger for AI agents.',
    zh: '感谢观看。OpenExecution — AI 智能体行为账本。',
    ja: 'ご視聴ありがとうございます。OpenExecution — AIエージェントの行動台帳。',
  },
};

const INTRO_CARD = {
  title: {
    en: 'OPENEXECUTION',
    zh: 'OPENEXECUTION',
    ja: 'OPENEXECUTION',
  },
  heading: {
    en: 'Investor Pitch Deck — Complete Walkthrough',
    zh: '投资人演示文稿 — 完整讲解',
    ja: '投資家向けピッチデッキ — 完全ウォークスルー',
  },
  desc: {
    en: 'The Third-Party Behavioral Ledger for AI Agents\nEd25519-signed · Hash-chained · Tamper-evident',
    zh: 'AI 智能体的第三方行为账本\nEd25519 签名 · 哈希链接 · 防篡改',
    ja: 'AIエージェントのサードパーティ行動台帳\nEd25519署名 · ハッシュチェーン · 改ざん防止',
  },
};

// ── Slide names (matching slide order in App.tsx) ──

const SLIDES = [
  'cover', 'thesis', 'gap', 'solution', 'why-now',
  'how-it-works', 'architecture', 'demo-scenario',
  'traction', 'founder', 'value-capture', 'live-proof', 'ask',
];

const SLIDE_SUBTITLE_KEYS = [
  'cover', 'thesis', 'gap', 'solution', 'whyNow',
  'howItWorks', 'architecture', 'demoScenario',
  'traction', 'founder', 'valueCapture', 'liveProof', 'theAsk',
];


// ── Subtitle / Intro Card Functions (same pattern as infra walkthrough) ──

async function smoothScroll(page, dist, dur = 1500) {
  const steps = 20;
  for (let i = 0; i < steps; i++) {
    await page.evaluate(d => window.scrollBy(0, d), dist / steps);
    await sleep(dur / steps);
  }
}

async function showSubtitle(page, text, durationMs = 0) {
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
  await sleep(500);
}

async function clearSubtitle(page) {
  await page.evaluate(() => {
    const el = document.getElementById('oe-demo-subtitle');
    if (el) { el.style.opacity = '0'; setTimeout(() => el.remove(), 500); }
  });
  await sleep(600);
}

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

async function clearIntroCard(page) {
  await page.evaluate(() => {
    const el = document.getElementById('oe-intro-card');
    if (el) { el.style.opacity = '0'; setTimeout(() => el.remove(), 800); }
  });
  await sleep(900);
}


// ══════════════════════════════════════════════════════════
//  MAIN RECORDING
// ══════════════════════════════════════════════════════════

async function main() {
  console.log(`\n  🎬 Recording Pitch Deck — ${LANG.toUpperCase()}`);
  console.log(`  URL: ${BASE_URL}`);
  console.log(`  Output: ${OUTPUT_DIR}\n`);

  // Prepare output directory
  if (fs.existsSync(OUTPUT_DIR)) {
    fs.rmSync(OUTPUT_DIR, { recursive: true });
  }
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Launch browser
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: OUTPUT_DIR, size: { width: 1920, height: 1080 } },
  });
  const page = await context.newPage();

  try {
    // ── INTRO CARD ──
    await page.goto('about:blank');
    await showIntroCard(
      page,
      INTRO_CARD.title[LANG] || INTRO_CARD.title.en,
      INTRO_CARD.heading[LANG] || INTRO_CARD.heading.en,
      INTRO_CARD.desc[LANG] || INTRO_CARD.desc.en,
    );
    await screenshot(page, 'intro-title-card');
    await sleep(3000);
    await clearIntroCard(page);

    // ── NAVIGATE TO DECK ──
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await sleep(2000);

    // ── WALK THROUGH 13 SLIDES ──
    const slides = await page.$$('.slide');
    console.log(`  Found ${slides.length} slides\n`);

    for (let i = 0; i < slides.length; i++) {
      const slideName = SLIDES[i] || `slide-${i + 1}`;
      const subtitleKey = SLIDE_SUBTITLE_KEYS[i];

      // Scroll slide into view
      await slides[i].scrollIntoViewIfNeeded();
      await sleep(1200);

      // Show subtitle
      if (subtitleKey && SUBTITLES[subtitleKey]) {
        await showSubtitle(page, sub(subtitleKey));
      }
      await sleep(2000);

      // Screenshot
      await screenshot(page, slideName);

      // Clear subtitle
      await clearSubtitle(page);
      await sleep(500);
    }

    // ── DEMO PAGE 1: INFRA ──
    console.log('\n  📋 Navigating to Infra Demo...\n');
    await page.goto(`${BASE_URL}#demo-infra`, { waitUntil: 'networkidle' });
    await sleep(2000);

    await showSubtitle(page, sub('demoInfraIntro'));
    await sleep(2000);
    await screenshot(page, 'demo-infra-header');
    await clearSubtitle(page);

    // Scroll through demo content
    const infraSteps = await page.$$('.demo-tl-item');
    console.log(`  Infra demo: ${infraSteps.length} steps`);

    for (let i = 0; i < infraSteps.length; i++) {
      await infraSteps[i].scrollIntoViewIfNeeded();
      await sleep(1000);

      if (i === 0) {
        await showSubtitle(page, sub('demoInfraScroll'));
        await sleep(1500);
      }

      await screenshot(page, `demo-infra-step${i + 1}`);
      if (i === 0) await clearSubtitle(page);
      await sleep(500);
    }

    // Scroll to video section if exists
    const infraVideo = await page.$('.demo-video-section');
    if (infraVideo) {
      await infraVideo.scrollIntoViewIfNeeded();
      await sleep(1500);
      await screenshot(page, 'demo-infra-video');
    }

    // ── DEMO PAGE 2: PLATFORM ──
    console.log('\n  📋 Navigating to Platform Demo...\n');
    await page.goto(`${BASE_URL}#demo-platform`, { waitUntil: 'networkidle' });
    await sleep(2000);

    await showSubtitle(page, sub('demoPlatformIntro'));
    await sleep(2000);
    await screenshot(page, 'demo-platform-header');
    await clearSubtitle(page);

    // Scroll through demo content
    const platformSteps = await page.$$('.demo-tl-item');
    console.log(`  Platform demo: ${platformSteps.length} steps`);

    for (let i = 0; i < platformSteps.length; i++) {
      await platformSteps[i].scrollIntoViewIfNeeded();
      await sleep(1000);

      if (i === 0) {
        await showSubtitle(page, sub('demoPlatformScroll'));
        await sleep(1500);
      }

      await screenshot(page, `demo-platform-step${i + 1}`);
      if (i === 0) await clearSubtitle(page);
      await sleep(500);
    }

    // Scroll to video section if exists
    const platformVideo = await page.$('.demo-video-section');
    if (platformVideo) {
      await platformVideo.scrollIntoViewIfNeeded();
      await sleep(1500);
      await screenshot(page, 'demo-platform-video');
    }

    // ── CLOSING ──
    console.log('\n  🎬 Closing...\n');
    await page.goto(`${BASE_URL}`, { waitUntil: 'networkidle' });
    await sleep(1000);

    // Scroll to last slide
    const allSlides = await page.$$('.slide');
    if (allSlides.length > 0) {
      await allSlides[allSlides.length - 1].scrollIntoViewIfNeeded();
      await sleep(1000);
    }
    await showSubtitle(page, sub('closing'));
    await sleep(3000);
    await screenshot(page, 'closing');
    await clearSubtitle(page);

  } finally {
    await page.close();
    await context.close();
    await browser.close();
  }

  console.log(`\n  ✅ Recording complete: ${OUTPUT_DIR}`);
  console.log(`  📸 ${screenshotCount} screenshots`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
