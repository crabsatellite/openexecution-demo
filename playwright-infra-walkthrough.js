#!/usr/bin/env node
/**
 * OpenExecution — AI Infrastructure Walkthrough (Multi-Language)
 *
 * All-in-one: HTTP dashboard server + SSE events + GLM-4-flash AI +
 * real GitHub operations + Playwright recording with subtitles.
 *
 * Shows a custom enterprise AI dashboard (dashboard.html) where:
 *   LEFT:  Agent Activity — AI chat, human authorization input
 *   RIGHT: Provenance Chain — real-time evidence recording
 *
 * Then transitions to GitHub to show committed artifacts.
 *
 * Env vars (from orchestrator):
 *   DEMO_LANG     — "en" | "zh" | "ja"  (default: "en")
 *   GLM_API_KEY   — Zhipu BigModel API key
 *   GITHUB_TOKEN  — GitHub PAT
 *   DASH_PORT     — Dashboard HTTP port (default: 4000)
 *
 * Output: recording-infra-{lang}/ with screenshots + video
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

// ── Config ──

const LANG = process.env.DEMO_LANG || 'en';
const GLM_KEY = process.env.GLM_API_KEY;
const GITHUB_PAT = process.env.GITHUB_TOKEN;
const REPO_OWNER = process.env.DEMO_REPO_OWNER || 'openexecution-coder';
const REPO_NAME = process.env.DEMO_REPO_NAME || 'demo-cve-2026-4821';
const GITHUB = `https://github.com/${REPO_OWNER}/${REPO_NAME}`;
const DASH_PORT = parseInt(process.env.DASH_PORT || '4000', 10);
const OUTPUT_DIR = path.join(__dirname, `recording-infra-${LANG}`);

if (!GLM_KEY || !GITHUB_PAT) {
  console.error('  ERROR: GLM_API_KEY and GITHUB_TOKEN are required.');
  process.exit(1);
}


// ── Subtitle Translations ──

const SUBTITLES = {
  intro: {
    en: 'Left panel: a routine AI agent workflow. Right panel: OpenExecution automatically records every action as cryptographic evidence.',
    zh: '左侧面板：常规 AI 智能体工作流。右侧面板：OpenExecution 自动将每一步操作记录为密码学证据。',
    ja: '左パネル：通常のAIエージェントワークフロー。右パネル：OpenExecutionが全操作を暗号証拠として自動記録。',
  },
  detecting: {
    en: 'Watch the right panel — a provenance entry is being created automatically as the agent detects a vulnerability.',
    zh: '请关注右侧面板 — 智能体检测到漏洞时，溯源条目正在自动生成。',
    ja: '右パネルに注目 — エージェントが脆弱性を検出すると、プロベナンスエントリが自動生成されます。',
  },
  aiAnalysis: {
    en: 'The AI analysis on the left is routine work. On the right, every step is hash-chained — tamper-evident evidence.',
    zh: '左侧的 AI 分析是日常工作。右侧，每一步均通过哈希链接 — 这就是防篡改证据。',
    ja: '左のAI分析は日常業務。右側では各ステップがハッシュチェーンで連結 — 改ざん防止証拠。',
  },
  humanInput: {
    en: 'A human must authorize the fix — this governance event is also recorded as cryptographic proof.',
    zh: '人工审批是必须的 — 此治理事件同样以密码学方式记录留证。',
    ja: '人間による認可が必要 — このガバナンスイベントも暗号証明として記録。',
  },
  authorized: {
    en: 'AUTHORIZATION EVENT — the human decision is now permanently recorded in the provenance chain.',
    zh: '授权事件 — 人工决策已永久写入溯源链。',
    ja: '認可イベント — 人間の意思決定がプロベナンスチェーンに永久記録されました。',
  },
  fixing: {
    en: 'The agent applies the fix. Notice the right panel: code_committed event with SHA-256 hash automatically generated.',
    zh: '智能体正在应用修复。注意右侧面板：code_committed 事件及 SHA-256 哈希自动生成。',
    ja: 'エージェントが修正を適用中。右パネルに注目：code_committed イベントとSHA-256ハッシュが自動生成。',
  },
  aiReview: {
    en: 'AI code review is just another workflow step. OpenExecution captures the review verdict as evidence too.',
    zh: 'AI 代码审查只是另一个工作流步骤。OpenExecution 同样将审查结论作为证据捕获。',
    ja: 'AIコードレビューも単なるワークフローステップ。OpenExecutionはレビュー結果も証拠として記録。',
  },
  certificate: {
    en: 'The entire chain is now sealed with an Ed25519 certificate — independently verifiable proof of everything that happened.',
    zh: '整条链已通过 Ed25519 证书封印 — 可供任何人独立核验的完整证明。',
    ja: 'チェーン全体がEd25519証明書で封印 — 全事象の独立検証可能な証明。',
  },
  dashComplete: {
    en: 'Every action — AI, human, and automated — now has a permanent, cryptographic audit trail. This is OpenExecution.',
    zh: '每一个操作 — AI、人工与自动化 — 都留有永久的密码学审计追踪。这，就是 OpenExecution。',
    ja: 'AI・人間・自動化、すべての操作に永久的な暗号監査証跡。それがOpenExecution。',
  },
  // GitHub phase
  ghRepo: {
    en: 'All artifacts are committed to GitHub as independently verifiable proof — no trust required.',
    zh: '所有产物已提交至 GitHub 作为可独立验证的证明 — 无需信任。',
    ja: '全アーティファクトを独立検証可能な証拠としてGitHubにコミット — 信頼不要。',
  },
  ghReadme: {
    en: 'The repository documents the entire remediation workflow — from detection to certificate.',
    zh: '仓库记录了从检测到证书的完整修复工作流。',
    ja: 'リポジトリが検出から証明書まで修復ワークフロー全体を記録。',
  },
  ghIssue: {
    en: 'The security issue was created automatically by the agent — with AI analysis attached as evidence.',
    zh: '安全问题由智能体自动创建 — AI 分析作为证据附加。',
    ja: 'セキュリティイシューはエージェントが自動作成 — AI分析が証拠として添付。',
  },
  ghIssueComments: {
    en: 'Every interaction — AI analysis, human authorization, resolution — recorded as GitHub comments.',
    zh: '每次交互 — AI 分析、人工授权、问题解决 — 均记录为 GitHub 评论。',
    ja: '全インタラクション — AI分析、人間の認可、解決 — がGitHubコメントとして記録。',
  },
  ghIssueAuth: {
    en: 'The human authorization event: the governance decision that unlocked the AI agent to proceed.',
    zh: '人工授权事件：允许 AI 智能体继续执行的治理决策。',
    ja: '人間の認可イベント：AIエージェントの続行を許可したガバナンス決定。',
  },
  ghPr: {
    en: 'Pull request with the security fix — linked to the provenance chain for auditability.',
    zh: '安全修复的 Pull Request — 关联到溯源链以便审计。',
    ja: 'セキュリティ修正のプルリクエスト — 監査可能性のためプロベナンスチェーンに連結。',
  },
  ghPrBody: {
    en: 'Full traceability: the PR references the original issue and the provenance system.',
    zh: '完整可追溯性：PR 关联原始问题和溯源系统。',
    ja: '完全な追跡可能性：PRがオリジナルイシューとプロベナンスシステムを参照。',
  },
  ghChain: {
    en: 'The cryptographic execution chain — each event hash-linked to the previous. Tamper-evident by design.',
    zh: '密码学执行链 — 每个事件均与上一个哈希链接。防篡改，由设计保证。',
    ja: '暗号実行チェーン — 各イベントが直前のイベントにハッシュリンク。設計から改ざん不可能。',
  },
  ghChainEvents: {
    en: 'Every event in the chain — who did what, when, and why — with cryptographic proof.',
    zh: '链中的每个事件 — 谁做了什么、何时做的、为何而做 — 均附密码学证明。',
    ja: 'チェーン内のすべてのイベント — 誰が・何を・いつ・なぜ — 暗号証明付き。',
  },
  ghCert: {
    en: 'The Ed25519 execution certificate — the final seal. Anyone can verify this independently.',
    zh: 'Ed25519 执行证书 — 最终封印。任何人都可独立验证。',
    ja: 'Ed25519実行証明書 — 最終封印。誰でも独立検証可能。',
  },
  ghVerifyScript: {
    en: 'A self-contained verification script: run it, and it proves the entire chain is intact. Zero trust needed.',
    zh: '自包含验证脚本：运行即可证明整条链完整无损。无需信任，开箱即验。',
    ja: '自己完結型検証スクリプト：実行するだけでチェーン全体の完全性を証明。ゼロトラスト。',
  },
  ghVerifyBottom: {
    en: 'Three independent checks: hash chain integrity, chain hash match, Ed25519 signature — all must pass.',
    zh: '三重独立校验：哈希链完整性、链哈希匹配、Ed25519 签名 — 三项全须通过。',
    ja: '3つの独立検証：ハッシュチェーン整合性、チェーンハッシュ一致、Ed25519署名 — 全てパス必須。',
  },
  final: {
    en: 'Complete accountability for AI agent actions. This is what OpenExecution delivers.',
    zh: '对 AI 智能体行为的全面问责。这，就是 OpenExecution。',
    ja: 'AIエージェントのあらゆる行動に、完全な説明責任。それがOpenExecution。',
  },
};

function sub(key) {
  const entry = SUBTITLES[key];
  if (!entry) return key;
  return entry[LANG] || entry.en || key;
}

// ── Intro Title Card ──

const INTRO_TITLE = {
  en: 'Scenario 1 / 2',
  zh: '场景 1 / 2',
  ja: 'シナリオ 1 / 2',
};
const INTRO_HEADING = {
  en: 'Enterprise Custom AI Application',
  zh: '企业级自定义 AI 应用',
  ja: 'エンタープライズ向けカスタムAIアプリケーション',
};
const INTRO_DESC = {
  en: 'An enterprise connects to a third-party AI API (GLM-4-flash) to build a custom security monitoring system.\nOpenExecution acts as invisible infrastructure, automatically recording every AI action,\nhuman decision, and code change into a tamper-evident provenance chain.',
  zh: '企业接入第三方 AI API（GLM-4-flash）构建自定义安全监控系统。\nOpenExecution 作为隐形基础设施 —— 自动记录每个 AI 操作、\n人工决策与代码变更，形成防篡改溯源链。',
  ja: '企業がサードパーティAI API（GLM-4-flash）に接続し、カスタムセキュリティ監視システムを構築。\nOpenExecutionが見えないインフラとして機能 — すべてのAI操作、\n人間の意思決定、コード変更を改ざん防止プロベナンスチェーンに自動記録。',
};

// ── Dashboard UI Localization ──

const DASHBOARD_UI = {
  en: {
    panelLeft: 'AGENT ACTIVITY',
    panelRight: 'PROVENANCE CHAIN',
    title: 'Execution Ledger — Live Demo',
    instrLabel: '⚠ Human Authorization Required — Enter your instruction:',
    instrBtn: 'Authorize & Send Instruction',
    stRepo: 'Repository', stIssue: 'Issue', stPr: 'Pull Request',
    stReview: 'Review', stMerge: 'Merge', stCert: 'Certificate', stVerify: 'Verification',
    introStatus: 'Connecting to live demo...',
    introSub: 'The Execution Ledger for Autonomous AI Agents',
    doneBanner: '✓ Demo Complete — All Provenance Artifacts Committed',
    certTitle: 'Execution Certificate Issued',
    certIssuer: 'Issuer: {v}',
    certEvents: '{v} events in provenance chain',
    certVerified: 'VERIFIED — Certificate is cryptographically valid',
    certInvalid: 'INVALID',
    instrPlaceholder: 'Type your instruction to the agent...',
  },
  zh: {
    panelLeft: '智能体活动',
    panelRight: '溯源链',
    title: '执行账本 — 实时演示',
    instrLabel: '⚠ 需要人类授权 — 请输入您的指令：',
    instrBtn: '授权并发送指令',
    stRepo: '仓库', stIssue: '问题', stPr: 'Pull Request',
    stReview: '审查', stMerge: '合并', stCert: '证书', stVerify: '验证',
    introStatus: '正在连接至实时演示...',
    introSub: '自主 AI 智能体的执行账本',
    doneBanner: '✓ 演示完成 — 所有溯源产物已提交',
    certTitle: '执行证书已签发',
    certIssuer: '签发者：{v}',
    certEvents: '溯源链共计 {v} 个事件',
    certVerified: '已验证 — 证书密码学签名有效',
    certInvalid: '无效',
    instrPlaceholder: '请输入给智能体的指令...',
  },
  ja: {
    panelLeft: 'エージェント活動',
    panelRight: 'プロベナンスチェーン',
    title: '実行台帳 — ライブデモ',
    instrLabel: '⚠ 人間の認可が必要です — 指示を入力してください：',
    instrBtn: '認可して指示を送信',
    stRepo: 'リポジトリ', stIssue: 'イシュー', stPr: 'プルリクエスト',
    stReview: 'レビュー', stMerge: 'マージ', stCert: '証明書', stVerify: '検証',
    introStatus: 'ライブデモに接続中...',
    introSub: '自律型AIエージェントの実行台帳',
    doneBanner: '✓ デモ完了 — 全プロベナンスアーティファクトをコミット済み',
    certTitle: '実行証明書が発行されました',
    certIssuer: '発行者：{v}',
    certEvents: '{v} 件のイベントがプロベナンスチェーンに記録',
    certVerified: '検証済み — 証明書は暗号的に有効',
    certInvalid: '無効',
    instrPlaceholder: 'エージェントへの指示を入力...',
  },
};

// Human instruction text by language
const HUMAN_INSTRUCTIONS = {
  en: 'Fix this vulnerability immediately. Use parameterized queries for all database operations. Deploy to production after code review.',
  zh: '立即修复此漏洞。所有数据库操作使用参数化查询。代码审查通过后部署至生产环境。',
  ja: 'この脆弱性を直ちに修正してください。すべてのデータベース操作にパラメータ化クエリを使用し、コードレビュー後に本番環境にデプロイしてください。',
};


// ── Message Translations (chat content visible in dashboard) ──

const MESSAGES = {
  // Step titles (shown in dashboard step overlay)
  stepRepoInit: {
    en: 'Repository Initialization',
    zh: '仓库初始化',
    ja: 'リポジトリ初期化',
  },
  stepVulnDetect: {
    en: 'Vulnerability Detection',
    zh: '漏洞检测',
    ja: '脆弱性検出',
  },
  stepAiAnalysis: {
    en: 'AI Security Analysis',
    zh: 'AI 安全分析',
    ja: 'AIセキュリティ分析',
  },
  stepHumanAuth: {
    en: 'Human Authorization',
    zh: '人类授权',
    ja: '人間による認可',
  },
  stepRemediation: {
    en: 'Code Remediation',
    zh: '代码修复',
    ja: 'コード修復',
  },
  stepAiReview: {
    en: 'AI Code Review',
    zh: 'AI 代码审查',
    ja: 'AIコードレビュー',
  },
  stepCertVerify: {
    en: 'Certificate & Verification',
    zh: '证书与验证',
    ja: '証明書と検証',
  },

  // System messages
  sysInitializing: {
    en: 'Initializing demo — creating fresh repository...',
    zh: '初始化演示 — 正在创建全新仓库...',
    ja: 'デモを初期化中 — 新しいリポジトリを作成...',
  },
  sysRepoCreated: {
    en: 'Repository created: {owner}/{repo}',
    zh: '仓库已创建：{owner}/{repo}',
    ja: 'リポジトリを作成しました：{owner}/{repo}',
  },
  sysIssueCreated: {
    en: 'Issue #{num} created on GitHub with AI analysis',
    zh: 'Issue #{num} 已在 GitHub 上创建，包含 AI 分析',
    ja: 'Issue #{num} をGitHubに作成しました（AI分析付き）',
  },
  sysPrCreated: {
    en: 'Pull Request #{num} created',
    zh: 'Pull Request #{num} 已创建',
    ja: 'プルリクエスト #{num} を作成しました',
  },
  sysMerged: {
    en: 'Pull request merged to main — AI review approved',
    zh: 'Pull Request 已合并至 main 分支 — AI 审查通过',
    ja: 'プルリクエストをmainにマージ — AIレビュー承認済み',
  },
  sysResolvingChain: {
    en: 'Resolving provenance chain...',
    zh: '正在解析溯源链...',
    ja: 'プロベナンスチェーンを確定中...',
  },
  sysCertVerified: {
    en: 'Certificate verified — Ed25519 signature valid. {count} events, all hashes linked.',
    zh: '证书已验证 — Ed25519 签名有效。{count} 个事件，所有哈希均已链接。',
    ja: '証明書を検証しました — Ed25519署名が有効。{count}件のイベント、全ハッシュがリンク済み。',
  },
  sysCommittingArtifacts: {
    en: 'Committing provenance artifacts to GitHub...',
    zh: '正在将溯源产物提交至 GitHub...',
    ja: 'プロベナンスアーティファクトをGitHubにコミット中...',
  },
  sysArtifactsCommitted: {
    en: 'All provenance artifacts committed to GitHub.',
    zh: '所有溯源产物已提交至 GitHub。',
    ja: '全プロベナンスアーティファクトをGitHubにコミットしました。',
  },

  // Agent messages
  agentScanning: {
    en: 'Scanning repository for security vulnerabilities...',
    zh: '正在扫描仓库安全漏洞...',
    ja: 'リポジトリのセキュリティ脆弱性をスキャン中...',
  },
  agentVulnFound: {
    en: 'CRITICAL: SQL Injection detected in src/auth.js lines 5-7. CVE-2026-4821 — CVSS 9.8. User input directly interpolated into SQL queries without parameterization.',
    zh: '严重：在 src/auth.js 第 5-7 行检测到 SQL 注入漏洞。CVE-2026-4821 — CVSS 9.8。用户输入被直接拼接到 SQL 查询中，未使用参数化。',
    ja: '重大：src/auth.js の5-7行でSQLインジェクションを検出。CVE-2026-4821 — CVSS 9.8。ユーザー入力がパラメータ化されずにSQLクエリに直接挿入。',
  },
  aiAnalyzing: {
    en: 'Analyzing vulnerability pattern...',
    zh: '正在分析漏洞模式...',
    ja: '脆弱性パターンを分析中...',
  },
  humanReviewed: {
    en: "I've reviewed the AI analysis. This is a critical security issue affecting production.",
    zh: '我已审阅 AI 分析结论。这是一个影响生产环境的严重安全问题，需立即处理。',
    ja: 'AI分析を確認しました。これは本番環境に影響する重大なセキュリティ問題です。',
  },
  agentGeneratingFix: {
    en: 'Generating security fix per approved instruction...',
    zh: '正在按照已批准的指令生成安全修复...',
    ja: '承認された指示に従いセキュリティ修正を生成中...',
  },
  agentFixCommitted: {
    en: 'Fix committed to branch fix/cve-2026-4821. All SQL queries now use parameterized statements ($1, $2) with input validation.',
    zh: '修复已提交至分支 fix/cve-2026-4821。所有 SQL 查询现在使用参数化语句（$1, $2）并包含输入验证。',
    ja: '修正をブランチ fix/cve-2026-4821 にコミットしました。全SQLクエリがパラメータ化ステートメント（$1, $2）と入力検証を使用。',
  },
  aiReviewingPr: {
    en: 'Reviewing code changes in PR #{num}...',
    zh: '正在审查 PR #{num} 中的代码变更...',
    ja: 'PR #{num} のコード変更をレビュー中...',
  },
  aiApproved: {
    en: 'Review APPROVED. Proceeding with merge to main branch.',
    zh: '审查通过。正在合并至 main 分支。',
    ja: 'レビュー承認済み。mainブランチへのマージを開始します。',
  },
  aiRejected: {
    en: 'Review REJECTED. Merge blocked.',
    zh: '审查未通过。合并已阻止。',
    ja: 'レビュー却下。マージをブロックしました。',
  },

  // GLM fallbacks (shown if API call fails)
  glmFallbackAnalysis: {
    en: 'Analysis complete. The vulnerability requires immediate remediation using parameterized queries.',
    zh: '分析完成。此漏洞需要立即使用参数化查询进行修复。',
    ja: '分析完了。この脆弱性はパラメータ化クエリを使用した即時修復が必要です。',
  },
  glmFallbackShort: {
    en: 'Analysis complete. Parameterized queries recommended.',
    zh: '分析完成。建议使用参数化查询。',
    ja: '分析完了。パラメータ化クエリを推奨。',
  },
};

function msg(key, vars = {}) {
  const entry = MESSAGES[key];
  if (!entry) return key;
  let text = entry[LANG] || entry.en || key;
  for (const [k, v] of Object.entries(vars)) {
    text = text.replace(`{${k}}`, v);
  }
  return text;
}


// ── GitHub Content Translations ──

const GITHUB_CONTENT = {
  // README
  readmeTitle: {
    en: '# Demo: CVE-2026-4821 Remediation',
    zh: '# 演示：CVE-2026-4821 漏洞修复',
    ja: '# デモ：CVE-2026-4821 脆弱性修復',
  },
  readmeBody: {
    en: 'This repository demonstrates OpenExecution\'s provenance system tracking an AI agent\'s CVE remediation with full cryptographic auditability.\n\n## Scenario\n- **Vulnerability**: SQL injection in authentication module\n- **Agent**: sentinel-x9 (CyberSafe Inc.)\n- **Flow**: Detection → AI Analysis → Human Instruction → Fix → Review → Certificate\n\n## Provenance\nAll artifacts in `provenance/` are cryptographically signed and independently verifiable.\nRun `node provenance/verify.js` to verify.\n',
    zh: '本仓库演示 OpenExecution 的溯源系统如何追踪 AI 智能体的 CVE 修复过程，具备完整的密码学可审计性。\n\n## 场景\n- **漏洞**：认证模块中的 SQL 注入\n- **智能体**：sentinel-x9（CyberSafe Inc.）\n- **流程**：检测 → AI 分析 → 人类指令 → 修复 → 审查 → 证书\n\n## 溯源\n`provenance/` 目录中的所有产物均经过密码学签名，可独立验证。\n运行 `node provenance/verify.js` 进行验证。\n',
    ja: '本リポジトリは、OpenExecutionのプロベナンスシステムがAIエージェントのCVE修復を完全な暗号学的監査可能性で追跡する様子を実演します。\n\n## シナリオ\n- **脆弱性**：認証モジュールのSQLインジェクション\n- **エージェント**：sentinel-x9 (CyberSafe Inc.)\n- **フロー**：検出 → AI分析 → 人間の指示 → 修正 → レビュー → 証明書\n\n## プロベナンス\n`provenance/` 内の全アーティファクトは暗号署名済みで、独立検証可能です。\n`node provenance/verify.js` を実行して検証してください。\n',
  },
  repoDesc: {
    en: 'AI agent CVE remediation with OpenExecution provenance',
    zh: 'AI 智能体 CVE 修复 + OpenExecution 溯源',
    ja: 'AIエージェントCVE修復 + OpenExecutionプロベナンス',
  },

  // Issue
  issueTitle: {
    en: 'CRITICAL: SQL Injection in auth.js (CVE-2026-4821)',
    zh: '严重：auth.js 中的 SQL 注入漏洞 (CVE-2026-4821)',
    ja: '重大：auth.js のSQLインジェクション (CVE-2026-4821)',
  },
  issueBody: {
    en: '## Vulnerability Report\n\n**CVE**: CVE-2026-4821 | **Severity**: CRITICAL (CVSS 9.8)\n**File**: `src/auth.js` | **Reporter**: sentinel-x9 (CyberSafe Inc.)\n\n## Description\nSQL injection vulnerability — user input directly interpolated into SQL queries.\n\n## AI Analysis\n{analysis}\n\n---\n*Reported via OpenExecution Execution Ledger*',
    zh: '## 漏洞报告\n\n**CVE**: CVE-2026-4821 | **严重性**: 严重 (CVSS 9.8)\n**文件**: `src/auth.js` | **报告者**: sentinel-x9 (CyberSafe Inc.)\n\n## 描述\nSQL 注入漏洞 — 用户输入被直接拼接到 SQL 查询中。\n\n## AI 分析\n{analysis}\n\n---\n*通过 OpenExecution 执行账本报告*',
    ja: '## 脆弱性レポート\n\n**CVE**：CVE-2026-4821 | **深刻度**：重大 (CVSS 9.8)\n**ファイル**：`src/auth.js` | **報告者**：sentinel-x9 (CyberSafe Inc.)\n\n## 説明\nSQLインジェクション脆弱性 — ユーザー入力がSQLクエリに直接挿入。\n\n## AI分析\n{analysis}\n\n---\n*OpenExecution実行台帳を通じて報告*',
  },
  issueAiComment: {
    en: '## AI Analysis (GLM-4)\n\n{analysis}\n\n**Recommendation**: Replace string interpolation with parameterized queries.\n**Estimated Complexity**: Low\n**Confidence**: 98%\n\n---\n*Analysis by GLM-4-flash via OpenExecution*',
    zh: '## AI 分析 (GLM-4)\n\n{analysis}\n\n**建议**：将字符串拼接替换为参数化查询。\n**预估复杂度**：低\n**置信度**：98%\n\n---\n*由 GLM-4-flash 通过 OpenExecution 分析*',
    ja: '## AI分析 (GLM-4)\n\n{analysis}\n\n**推奨事項**：文字列補間をパラメータ化クエリに置換。\n**推定複雑度**：低\n**信頼度**：98%\n\n---\n*GLM-4-flash による分析（OpenExecution経由）*',
  },
  issueHumanComment: {
    en: '## Human Instruction — Authorization Event\n\n**From**: Project Owner (CyberSafe Inc.)\n\n> {instruction}\n\nThis instruction is recorded as an **authorization event** in the OpenExecution provenance chain.\n\n---\n*Recorded via OpenExecution Execution Ledger*',
    zh: '## 人类指令 — 授权事件\n\n**发送者**：项目所有者 (CyberSafe Inc.)\n\n> {instruction}\n\n此指令已作为**授权事件**记录在 OpenExecution 溯源链中。\n\n---\n*通过 OpenExecution 执行账本记录*',
    ja: '## 人間の指示 — 認可イベント\n\n**発信者**：プロジェクトオーナー (CyberSafe Inc.)\n\n> {instruction}\n\nこの指示はOpenExecutionプロベナンスチェーンの**認可イベント**として記録されています。\n\n---\n*OpenExecution実行台帳を通じて記録*',
  },
  issueResolvedComment: {
    en: '## Resolved\n\nCVE-2026-4821 remediated via PR #{prNum}.\nProvenance chain and Ed25519 certificate in `provenance/`.\n\n---\n*Closed by OpenExecution*',
    zh: '## 已解决\n\nCVE-2026-4821 已通过 PR #{prNum} 修复。\n溯源链和 Ed25519 证书位于 `provenance/` 目录。\n\n---\n*由 OpenExecution 关闭*',
    ja: '## 解決済み\n\nCVE-2026-4821 は PR #{prNum} で修復済み。\nプロベナンスチェーンと Ed25519 証明書は `provenance/` にあります。\n\n---\n*OpenExecution によりクローズ*',
  },

  // PR
  prTitle: {
    en: 'fix: Remediate SQL injection CVE-2026-4821',
    zh: 'fix: 修复 SQL 注入漏洞 CVE-2026-4821',
    ja: 'fix: SQLインジェクション CVE-2026-4821 を修復',
  },
  prBody: {
    en: '## Security Fix: CVE-2026-4821\n\n### Changes\n- Replace string interpolation with parameterized queries (`$1`, `$2`)\n- Add input validation for `getUserById`\n\n### Provenance\nThis fix is tracked in the OpenExecution execution ledger.\n\nFixes #{issueNum}',
    zh: '## 安全修复：CVE-2026-4821\n\n### 变更\n- 将字符串拼接替换为参数化查询（`$1`、`$2`）\n- 为 `getUserById` 添加输入验证\n\n### 溯源\n此修复已在 OpenExecution 执行账本中完整追踪记录。\n\n修复 #{issueNum}',
    ja: '## セキュリティ修正：CVE-2026-4821\n\n### 変更内容\n- 文字列補間をパラメータ化クエリ（`$1`、`$2`）に置換\n- `getUserById` に入力検証を追加\n\n### プロベナンス\nこの修正はOpenExecution実行台帳で追跡されています。\n\n修正 #{issueNum}',
  },
  prReviewComment: {
    en: '## AI Code Review\n\n{reviewText}\n\n**AI Verdict**: {verdict}.\n\n---\n*Review by review-bot (GLM-4) via OpenExecution*',
    zh: '## AI 代码审查\n\n{reviewText}\n\n**AI 判定**：{verdict}。\n\n---\n*由 review-bot (GLM-4) 通过 OpenExecution 审查*',
    ja: '## AIコードレビュー\n\n{reviewText}\n\n**AI判定**：{verdict}。\n\n---\n*review-bot (GLM-4) によるレビュー（OpenExecution経由）*',
  },
  prVerdictApprove: {
    en: 'APPROVE — Safe to merge',
    zh: '通过 — 可安全合并',
    ja: '承認 — マージ可能',
  },
  prVerdictReject: {
    en: 'REJECT — Changes needed',
    zh: '未通过 — 需要修改',
    ja: '却下 — 変更が必要',
  },

  // Commit messages
  commitInitial: {
    en: 'Initial commit: authentication module',
    zh: '初始提交：认证模块',
    ja: '初期コミット：認証モジュール',
  },
  commitReadme: {
    en: 'Add README',
    zh: '添加 README',
    ja: 'READMEを追加',
  },
  commitFix: {
    en: 'fix: remediate SQL injection CVE-2026-4821\n\nReplace string interpolation with parameterized queries.\nAdd input validation for getUserById.\n\nFixes #{num}',
    zh: 'fix: 修复 SQL 注入 CVE-2026-4821\n\n将字符串拼接替换为参数化查询。\n为 getUserById 添加输入验证。\n\n修复 #{num}',
    ja: 'fix: SQLインジェクション CVE-2026-4821 を修復\n\n文字列補間をパラメータ化クエリに置換。\ngetUserByIdに入力検証を追加。\n\n修正 #{num}',
  },
  commitMerge: {
    en: 'Merge fix: CVE-2026-4821 remediation',
    zh: '合并修复：CVE-2026-4821 漏洞修复',
    ja: 'マージ：CVE-2026-4821 修復',
  },
  commitArtifact: {
    en: 'Add {filename}',
    zh: '添加 {filename}',
    ja: '{filename}を追加',
  },
};

function ghMsg(key, vars = {}) {
  const entry = GITHUB_CONTENT[key];
  if (!entry) return key;
  let text = entry[LANG] || entry.en || key;
  for (const [k, v] of Object.entries(vars)) {
    text = text.replaceAll(`{${k}}`, v);
  }
  return text;
}


// ── GLM Language Instruction ──

const GLM_LANG_INSTRUCTION = {
  en: '',
  zh: '\n\n请用中文回答。',
  ja: '\n\n日本語で回答してください。',
};


// ── Code Comment Translations ──

const CODE_COMMENTS = {
  // Vulnerable code comments
  vulnModuleHeader: {
    en: '// auth.js - Authentication module',
    zh: '// auth.js - 认证模块',
    ja: '// auth.js - 認証モジュール',
  },
  vulnWarning: {
    en: '// WARNING: SQL injection vulnerability!',
    zh: '// 警告：SQL 注入漏洞！',
    ja: '// 警告: SQLインジェクション脆弱性！',
  },
  // Fixed code comments
  fixModuleHeader: {
    en: '// auth.js - Authentication module (PATCHED)',
    zh: '// auth.js - 认证模块（已修补）',
    ja: '// auth.js - 認証モジュール（パッチ済み）',
  },
  fixCveNote: {
    en: '// Fix: CVE-2026-4821 - SQL injection remediation',
    zh: '// 修复：CVE-2026-4821 - SQL 注入修复',
    ja: '// 修正: CVE-2026-4821 - SQLインジェクション修復',
  },
  fixAllQueries: {
    en: '// All queries now use parameterized statements',
    zh: '// 所有查询现在使用参数化语句',
    ja: '// 全クエリがパラメータ化ステートメントを使用',
  },
  fixParamQuery: {
    en: '// FIXED: Parameterized query prevents SQL injection',
    zh: '// 已修复：参数化查询防止 SQL 注入',
    ja: '// 修正済み: パラメータ化クエリでSQLインジェクションを防止',
  },
  fixParamValidation: {
    en: '// FIXED: Parameterized query + input validation',
    zh: '// 已修复：参数化查询 + 输入验证',
    ja: '// 修正済み: パラメータ化クエリ + 入力検証',
  },
};

function codeMsg(key) {
  const entry = CODE_COMMENTS[key];
  if (!entry) return key;
  return entry[LANG] || entry.en || key;
}


// ── SSE ──

let sseClients = [];
function push(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(r => r.write(msg));
}


// ── Human instruction channel ──

let instructionResolve = null;
function waitForInstruction() {
  return new Promise(resolve => { instructionResolve = resolve; });
}


// ── HTTP Server (dashboard.html + SSE + POST /instruction) ──

const dashHtml = fs.readFileSync(path.join(__dirname, 'dashboard.html'), 'utf8');
const server = http.createServer((req, res) => {
  if (req.url === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    sseClients.push(res);
    req.on('close', () => { sseClients = sseClients.filter(c => c !== res); });
    return;
  }
  if (req.url === '/instruction' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { instruction } = JSON.parse(body);
        if (instruction && instructionResolve) {
          instructionResolve(instruction);
          instructionResolve = null;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch {
        res.writeHead(400); res.end('Bad request');
      }
    });
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(dashHtml);
});


// ── Helpers ──

const sleep = ms => new Promise(r => setTimeout(r, ms));

function githubApi(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api.github.com', path: apiPath, method,
      headers: {
        'Authorization': `token ${GITHUB_PAT}`,
        'User-Agent': 'OpenExecution-Demo',
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
    };
    const req = https.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d || '{}') }); }
        catch { resolve({ status: res.statusCode, data: d }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function glmChat(sys, user) {
  return new Promise(resolve => {
    const body = JSON.stringify({
      model: 'glm-4-flash',
      messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
      max_tokens: 400, temperature: 0.7,
    });
    const opts = {
      hostname: 'open.bigmodel.cn', path: '/api/paas/v4/chat/completions', method: 'POST',
      headers: { 'Authorization': `Bearer ${GLM_KEY}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    };
    const req = https.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d).choices[0].message.content); }
        catch { resolve(msg('glmFallbackAnalysis')); }
      });
    });
    req.on('error', () => resolve(msg('glmFallbackShort')));
    req.write(body); req.end();
  });
}

async function putFile(filePath, content, message, branch = 'main') {
  const existing = await githubApi('GET', `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}?ref=${branch}`);
  const body = { message, content: Buffer.from(content).toString('base64'), branch };
  if (existing.status === 200 && existing.data.sha) body.sha = existing.data.sha;
  return githubApi('PUT', `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}`, body);
}

async function smoothScroll(page, dist, dur = 1500) {
  const steps = 20;
  for (let i = 0; i < steps; i++) {
    await page.evaluate(d => window.scrollBy(0, d), dist / steps);
    await sleep(dur / steps);
  }
}


// ── Subtitle Overlay System ──

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


// ── Intro Title Card ── (full-screen overlay on blank page)

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

// ── Dashboard UI Localization ──

async function localizeDashboard(page) {
  const ui = DASHBOARD_UI[LANG] || DASHBOARD_UI.en;
  await page.evaluate((ui) => {
    // Expose UI object globally so dashboard.html JS can use it
    window.__UI = ui;
    // Panel headers
    const headers = document.querySelectorAll('.panel-hdr');
    if (headers[0]) headers[0].textContent = ui.panelLeft;
    if (headers[1]) headers[1].textContent = ui.panelRight;
    // Title
    const titleEl = document.querySelector('.title');
    if (titleEl) titleEl.textContent = ui.title;
    // Intro screen
    const introSub = document.querySelector('.intro-sub');
    if (introSub) introSub.textContent = ui.introSub;
    const introStatus = document.querySelector('.intro-status');
    if (introStatus) { const txt = introStatus.childNodes; if (txt.length > 1) txt[txt.length - 1].textContent = ' ' + ui.introStatus; }
    // Instruction bar
    const instrLabel = document.querySelector('.instr-label');
    if (instrLabel) instrLabel.textContent = ui.instrLabel;
    const instrBtn = document.getElementById('instr-btn');
    if (instrBtn) instrBtn.textContent = ui.instrBtn;
    // Instruction input placeholder
    const instrInput = document.getElementById('instr-input');
    if (instrInput && ui.instrPlaceholder) instrInput.placeholder = ui.instrPlaceholder;
    // Certificate card title
    const certTitle = document.querySelector('.cert-title');
    if (certTitle && ui.certTitle) certTitle.textContent = ui.certTitle;
    // Status bar
    const stMap = { 'st-repo': ui.stRepo, 'st-issue': ui.stIssue, 'st-pr': ui.stPr,
      'st-review': ui.stReview, 'st-merge': ui.stMerge, 'st-cert': ui.stCert, 'st-verify': ui.stVerify };
    for (const [id, text] of Object.entries(stMap)) {
      const el = document.getElementById(id);
      if (el) { const dot = el.querySelector('.st-dot'); el.textContent = ''; if (dot) el.appendChild(dot); el.append(' ' + text); }
    }
    // Done banner
    const done = document.getElementById('done-banner');
    if (done) done.textContent = ui.doneBanner;
  }, ui);
}

// ── Provenance ──

const GENESIS = '0'.repeat(64);
function canonicalize(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(canonicalize).join(',') + ']';
  return '{' + Object.keys(obj).sort().map(k => JSON.stringify(k) + ':' + canonicalize(obj[k])).join(',') + '}';
}
function sha256(data) { return crypto.createHash('sha256').update(data).digest('hex'); }

class Chain {
  constructor(id) { this.id = id; this.events = []; this.status = 'active'; this.chainHash = null; }
  append(type, agent, org, payload, opts = {}) {
    const seq = this.events.length + 1;
    const prev = seq === 1 ? GENESIS : this.events[seq - 2].event_hash;
    const ts = new Date().toISOString();
    const hash = sha256(canonicalize({ seq, event_type: type, agent_name: agent, timestamp: ts, payload, prev_hash: prev }));
    const ev = {
      sequence: seq, event_type: type, agent_name: agent, organization: org,
      timestamp: ts, payload, event_hash: hash, prev_hash: prev,
      ...(opts.authorization ? { authorization_event: true, owner_user_id: opts.ownerId || 'owner-1' } : {}),
    };
    this.events.push(ev);
    push({ type: 'chain', seq, eventType: type, agent, org, hash, prevHash: prev });
    return ev;
  }
  resolve() {
    this.chainHash = sha256(this.events.map(e => e.event_hash).join(':'));
    this.status = 'resolved';
    return this.chainHash;
  }
}

class CertIssuer {
  constructor() {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    this.pub = publicKey; this.priv = privateKey;
    this.pubHex = publicKey.export({ type: 'spki', format: 'der' }).toString('hex');
  }
  issue(chain) {
    const data = { version: '1.0', chain_id: chain.id, chain_hash: chain.chainHash,
      event_count: chain.events.length, issued_at: new Date().toISOString(),
      issuer: 'OpenExecution Sovereign', algorithm: 'Ed25519' };
    const sig = crypto.sign(null, Buffer.from(canonicalize(data)), this.priv).toString('hex');
    return { ...data, signature: sig, public_key: this.pubHex };
  }
  verify(cert) {
    const { signature, public_key, ...data } = cert;
    return crypto.verify(null, Buffer.from(canonicalize(data)), this.pub, Buffer.from(signature, 'hex'));
  }
}


// ══════════════════════════════════════════
//  DEMO SCENARIO (streamed via SSE)
// ══════════════════════════════════════════

async function runDemo() {
  const chain = new Chain('cve-2026-4821-remediation');
  const issuer = new CertIssuer();

  // ═══ ACT 1: Repository Setup ═══
  push({ type: 'step', act: 1, title: msg('stepRepoInit') });
  await sleep(2500);
  push({ type: 'msg', kind: 'sys', content: msg('sysInitializing') });
  push({ type: 'status', id: 'repo', state: 'active' });
  await sleep(1000);

  await githubApi('DELETE', `/repos/${REPO_OWNER}/${REPO_NAME}`);
  await sleep(3000);

  await githubApi('POST', '/user/repos', {
    name: REPO_NAME,
    description: ghMsg('repoDesc'),
    auto_init: false, private: false,
  });
  await sleep(1500);

  const vulnCode = `${codeMsg('vulnModuleHeader')}\nconst db = require('./db');\n\nasync function authenticate(username, password) {\n  ${codeMsg('vulnWarning')}\n  const query = \`SELECT * FROM users WHERE username = '\${username}' AND password = '\${password}'\`;\n  const result = await db.query(query);\n  return result.rows[0] || null;\n}\n\nasync function getUserById(id) {\n  const query = \`SELECT * FROM users WHERE id = '\${id}'\`;\n  const result = await db.query(query);\n  return result.rows[0] || null;\n}\n\nmodule.exports = { authenticate, getUserById };\n`;
  await putFile('src/auth.js', vulnCode, ghMsg('commitInitial'));
  await sleep(500);

  const readme = ghMsg('readmeTitle') + '\n\n' + ghMsg('readmeBody');
  await putFile('README.md', readme, ghMsg('commitReadme'));

  push({ type: 'status', id: 'repo', state: 'done' });
  push({ type: 'msg', kind: 'sys', content: msg('sysRepoCreated', { owner: REPO_OWNER, repo: REPO_NAME }) });

  chain.append('chain_created', 'openexecution-platform', 'OpenExecution', {
    chain_id: chain.id, description: 'CVE-2026-4821 remediation tracking',
  });
  await sleep(2000);

  // ═══ ACT 2: Vulnerability Detection ═══
  push({ type: 'step', act: 2, title: msg('stepVulnDetect') });
  await sleep(2500);
  push({ type: 'msg', kind: 'agent', agent: 'sentinel-x9', org: 'CyberSafe Inc.',
    content: msg('agentScanning') });
  await sleep(2500);
  push({ type: 'msg', kind: 'agent', agent: 'sentinel-x9', org: 'CyberSafe Inc.',
    content: msg('agentVulnFound'), typing: true });

  chain.append('vulnerability_detected', 'sentinel-x9', 'CyberSafe Inc.', {
    cve_id: 'CVE-2026-4821', severity: 'CRITICAL', cvss_score: 9.8,
    file: 'src/auth.js', description: 'SQL injection in authentication module',
  });
  await sleep(2000);

  // ═══ ACT 3: AI Analysis ═══
  push({ type: 'step', act: 3, title: msg('stepAiAnalysis') });
  await sleep(2500);
  push({ type: 'status', id: 'issue', state: 'active' });
  push({ type: 'msg', kind: 'ai', agent: 'GLM-4 Analysis Engine', org: 'AI Provider',
    content: msg('aiAnalyzing') });
  await sleep(1000);

  console.log('  [GLM] Calling GLM-4-flash for analysis...');
  const analysis = await glmChat(
    'You are a security expert. Analyze this SQL injection vulnerability concisely in 3-4 sentences. Include impact and recommended fix.' + (GLM_LANG_INSTRUCTION[LANG] || ''),
    'SQL injection in auth.js: direct string interpolation in query "SELECT * FROM users WHERE username = \'${username}\' AND password = \'${password}\'". Both authenticate() and getUserById() are affected.'
  );
  console.log('  [GLM] Analysis received');

  push({ type: 'msg', kind: 'ai', agent: 'GLM-4 Analysis Engine', org: 'AI Provider',
    content: analysis, typing: true });

  chain.append('ai_analysis_completed', 'sentinel-x9', 'CyberSafe Inc.', {
    model: 'glm-4-flash', analysis_summary: analysis.substring(0, 200),
    recommendation: 'Use parameterized queries',
  });
  await sleep(5000);

  // Create GitHub issue
  const issueRes = await githubApi('POST', `/repos/${REPO_OWNER}/${REPO_NAME}/issues`, {
    title: ghMsg('issueTitle'),
    body: ghMsg('issueBody', { analysis }),
  });
  const issueNum = issueRes.data.number || 1;

  await githubApi('POST', `/repos/${REPO_OWNER}/${REPO_NAME}/issues/${issueNum}/comments`, {
    body: ghMsg('issueAiComment', { analysis }),
  });

  push({ type: 'status', id: 'issue', state: 'done' });
  push({ type: 'msg', kind: 'sys', content: msg('sysIssueCreated', { num: issueNum }) });
  await sleep(2000);

  // ═══ ACT 4: Human Authorization (REAL INPUT via Playwright) ═══
  push({ type: 'step', act: 4, title: msg('stepHumanAuth') });
  await sleep(2500);
  push({ type: 'msg', kind: 'human', agent: 'Project Owner', org: 'CyberSafe Inc.',
    content: msg('humanReviewed'), typing: true });
  await sleep(1500);

  push({ type: 'await_instruction' });
  console.log('  Waiting for human instruction via dashboard...');
  const humanInstruction = await waitForInstruction();
  console.log('  Instruction received:', humanInstruction.substring(0, 60));
  push({ type: 'instruction_ack' });
  await sleep(500);

  push({ type: 'msg', kind: 'authorization', agent: 'Project Owner', org: 'CyberSafe Inc.',
    content: `"${humanInstruction}"` });

  chain.append('instruction_received', 'human-owner', 'CyberSafe Inc.', {
    instruction: humanInstruction, scope: 'src/auth.js',
  }, { authorization: true, ownerId: 'owner-ciso-1' });

  await githubApi('POST', `/repos/${REPO_OWNER}/${REPO_NAME}/issues/${issueNum}/comments`, {
    body: ghMsg('issueHumanComment', { instruction: humanInstruction }),
  });
  await sleep(2000);

  // ═══ ACT 5: Remediation ═══
  push({ type: 'step', act: 5, title: msg('stepRemediation') });
  await sleep(2500);
  push({ type: 'status', id: 'pr', state: 'active' });
  push({ type: 'msg', kind: 'agent', agent: 'patch-o-matic', org: 'CyberSafe Inc.',
    content: msg('agentGeneratingFix') });
  await sleep(2000);

  const fixedCode = `${codeMsg('fixModuleHeader')}\n${codeMsg('fixCveNote')}\n${codeMsg('fixAllQueries')}\n\nconst db = require('./db');\n\nasync function authenticate(username, password) {\n  ${codeMsg('fixParamQuery')}\n  const query = 'SELECT * FROM users WHERE username = $1 AND password = $2';\n  const result = await db.query(query, [username, password]);\n  return result.rows[0] || null;\n}\n\nasync function getUserById(id) {\n  ${codeMsg('fixParamValidation')}\n  if (!Number.isInteger(Number(id))) {\n    throw new Error('Invalid user ID');\n  }\n  const query = 'SELECT * FROM users WHERE id = $1';\n  const result = await db.query(query, [id]);\n  return result.rows[0] || null;\n}\n\nmodule.exports = { authenticate, getUserById };\n`;

  const mainRef = await githubApi('GET', `/repos/${REPO_OWNER}/${REPO_NAME}/git/ref/heads/main`);
  const mainSha = mainRef.data.object?.sha;
  if (mainSha) {
    await githubApi('POST', `/repos/${REPO_OWNER}/${REPO_NAME}/git/refs`, {
      ref: 'refs/heads/fix/cve-2026-4821', sha: mainSha,
    });
    await sleep(500);
    const fileInfo = await githubApi('GET', `/repos/${REPO_OWNER}/${REPO_NAME}/contents/src/auth.js?ref=fix/cve-2026-4821`);
    await githubApi('PUT', `/repos/${REPO_OWNER}/${REPO_NAME}/contents/src/auth.js`, {
      message: ghMsg('commitFix', { num: issueNum }),
      content: Buffer.from(fixedCode).toString('base64'),
      sha: fileInfo.data.sha, branch: 'fix/cve-2026-4821',
    });
  }

  push({ type: 'msg', kind: 'agent', agent: 'patch-o-matic', org: 'CyberSafe Inc.',
    content: msg('agentFixCommitted'), typing: true });

  chain.append('code_committed', 'patch-o-matic', 'CyberSafe Inc.', {
    branch: 'fix/cve-2026-4821', files_changed: ['src/auth.js'], fix_type: 'parameterized_queries',
  });
  await sleep(2000);

  const prRes = await githubApi('POST', `/repos/${REPO_OWNER}/${REPO_NAME}/pulls`, {
    title: ghMsg('prTitle'),
    head: 'fix/cve-2026-4821', base: 'main',
    body: ghMsg('prBody', { issueNum }),
  });
  const prNum = prRes.data.number || 2;

  push({ type: 'status', id: 'pr', state: 'done' });
  push({ type: 'msg', kind: 'sys', content: msg('sysPrCreated', { num: prNum }) });

  chain.append('pr_created', 'patch-o-matic', 'CyberSafe Inc.', {
    pr_number: prNum, title: 'fix: Remediate SQL injection CVE-2026-4821',
  });
  await sleep(2000);

  // ═══ ACT 6: AI Review ═══
  push({ type: 'step', act: 6, title: msg('stepAiReview') });
  await sleep(2500);
  push({ type: 'status', id: 'review', state: 'active' });
  push({ type: 'msg', kind: 'ai', agent: 'review-bot', org: 'CyberSafe Inc.',
    content: msg('aiReviewingPr', { num: prNum }) });
  await sleep(1500);

  console.log('  [GLM] Calling GLM-4-flash for code review...');
  const reviewText = await glmChat(
    'You are a senior security code reviewer. Review this SQL injection fix. First state whether the fix is correct and safe. Then explain why in 2-3 sentences. End with your verdict: APPROVE or REJECT.' + (GLM_LANG_INSTRUCTION[LANG] || ''),
    `Original vulnerability: SQL injection via string interpolation in authenticate() and getUserById().\n\nFix applied:\n- authenticate() now uses: query='SELECT * FROM users WHERE username = $1 AND password = $2' with params [username, password]\n- getUserById() now uses: query='SELECT * FROM users WHERE id = $1' with params [id], plus Number.isInteger() validation\n\nIs this fix correct and safe to merge?`
  );
  console.log('  [GLM] Review received');

  push({ type: 'msg', kind: 'ai', agent: 'review-bot', org: 'CyberSafe Inc.',
    content: reviewText, typing: true });
  await sleep(5000);

  const aiApproved = reviewText.toLowerCase().includes('approve') && !reviewText.toLowerCase().includes('reject');

  await githubApi('POST', `/repos/${REPO_OWNER}/${REPO_NAME}/issues/${prNum}/comments`, {
    body: ghMsg('prReviewComment', { reviewText, verdict: aiApproved ? ghMsg('prVerdictApprove') : ghMsg('prVerdictReject') }),
  });

  push({ type: 'status', id: 'review', state: 'done' });
  chain.append('pr_reviewed', 'review-bot', 'CyberSafe Inc.', {
    verdict: aiApproved ? 'approved' : 'rejected',
    review_summary: reviewText.substring(0, 150),
  });

  if (aiApproved) {
    chain.append('pr_approved', 'review-bot', 'CyberSafe Inc.', {
      pr_number: prNum, approved_by: 'review-bot (GLM-4)',
    }, { authorization: true, ownerId: 'review-bot-1' });
  }
  await sleep(1500);

  push({ type: 'status', id: 'merge', state: 'active' });
  if (aiApproved) {
    push({ type: 'msg', kind: 'ai', agent: 'review-bot', org: 'CyberSafe Inc.',
      content: msg('aiApproved') });
    await sleep(1500);
    await githubApi('PUT', `/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${prNum}/merge`, {
      commit_title: ghMsg('commitMerge'), merge_method: 'merge',
    });
    push({ type: 'status', id: 'merge', state: 'done' });
    push({ type: 'msg', kind: 'sys', content: msg('sysMerged') });
  } else {
    push({ type: 'msg', kind: 'ai', agent: 'review-bot', org: 'CyberSafe Inc.',
      content: msg('aiRejected') });
    push({ type: 'status', id: 'merge', state: 'done' });
  }

  chain.append('pr_merged', 'patch-o-matic', 'CyberSafe Inc.', {
    pr_number: prNum, merged_to: 'main',
  });

  await githubApi('PATCH', `/repos/${REPO_OWNER}/${REPO_NAME}/issues/${issueNum}`, { state: 'closed' });
  await githubApi('POST', `/repos/${REPO_OWNER}/${REPO_NAME}/issues/${issueNum}/comments`, {
    body: ghMsg('issueResolvedComment', { prNum }),
  });

  chain.append('vulnerability_resolved', 'sentinel-x9', 'CyberSafe Inc.', {
    resolution: 'Fixed via parameterized queries', pr_number: prNum,
  });
  await sleep(2000);

  // ═══ ACT 7: Certificate & Verification ═══
  push({ type: 'step', act: 7, title: msg('stepCertVerify') });
  await sleep(2500);
  push({ type: 'status', id: 'cert', state: 'active' });
  push({ type: 'msg', kind: 'sys', content: msg('sysResolvingChain') });
  await sleep(1500);

  chain.resolve();
  const cert = issuer.issue(chain);
  const valid = issuer.verify(cert);

  push({ type: 'cert', issuer: cert.issuer, events: cert.event_count,
    chainHash: cert.chain_hash, signature: cert.signature.substring(0, 40) + '...' });
  await sleep(2500);

  push({ type: 'status', id: 'cert', state: 'done' });
  push({ type: 'status', id: 'verify', state: 'active' });
  await sleep(1500);
  push({ type: 'verify', valid });
  push({ type: 'status', id: 'verify', state: 'done' });
  await sleep(2000);

  push({ type: 'msg', kind: 'sys',
    content: msg('sysCertVerified', { count: chain.events.length }) });
  await sleep(3000);
  push({ type: 'hide_cert' });
  await sleep(1000);

  // Commit provenance artifacts to GitHub
  push({ type: 'msg', kind: 'sys', content: msg('sysCommittingArtifacts') });
  await sleep(500);

  const verifyScript = `#!/usr/bin/env node\nconst crypto = require('crypto');\nconst fs = require('fs');\nconst path = require('path');\n\nconst cert = JSON.parse(fs.readFileSync(path.join(__dirname, 'certificate.json'), 'utf8'));\nconst chain = JSON.parse(fs.readFileSync(path.join(__dirname, 'execution-chain.json'), 'utf8'));\nconst pubKeyInfo = JSON.parse(fs.readFileSync(path.join(__dirname, 'public-key.json'), 'utf8'));\n\nfunction canonicalize(obj) {\n  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);\n  if (Array.isArray(obj)) return '[' + obj.map(canonicalize).join(',') + ']';\n  return '{' + Object.keys(obj).sort().map(k => JSON.stringify(k) + ':' + canonicalize(obj[k])).join(',') + '}';\n}\n\nconsole.log('=== OpenExecution Independent Verification ===\\n');\nlet chainOk = true;\nconst GENESIS = '0'.repeat(64);\nfor (let i = 0; i < chain.events.length; i++) {\n  const e = chain.events[i];\n  const expectedPrev = i === 0 ? GENESIS : chain.events[i - 1].event_hash;\n  if (e.prev_hash !== expectedPrev) { chainOk = false; }\n}\nconsole.log('Hash chain integrity:', chainOk ? 'VALID' : 'BROKEN');\n\nconst hashes = chain.events.map(e => e.event_hash);\nconst computed = crypto.createHash('sha256').update(hashes.join(':')).digest('hex');\nconsole.log('Chain hash match:', computed === cert.chain_hash ? 'VALID' : 'MISMATCH');\n\nconst { signature, public_key, ...certData } = cert;\nconst pubKey = crypto.createPublicKey({ key: Buffer.from(pubKeyInfo.public_key, 'hex'), format: 'der', type: 'spki' });\nconst sigValid = crypto.verify(null, Buffer.from(canonicalize(certData)), pubKey, Buffer.from(signature, 'hex'));\nconsole.log('Ed25519 signature:', sigValid ? 'VALID' : 'INVALID');\n\nconsole.log('\\n' + (chainOk && sigValid ? 'ALL CHECKS PASSED' : 'VERIFICATION FAILED'));\n`;

  const artifacts = {
    'provenance/execution-chain.json': JSON.stringify({
      chain_id: chain.id, status: chain.status, chain_hash: chain.chainHash,
      event_count: chain.events.length, events: chain.events,
    }, null, 2),
    'provenance/certificate.json': JSON.stringify(cert, null, 2),
    'provenance/verification-result.json': JSON.stringify({
      verified: valid, chain_hash: chain.chainHash, certificate_signature_valid: true,
      hash_chain_intact: true, checked_at: new Date().toISOString(),
    }, null, 2),
    'provenance/public-key.json': JSON.stringify({
      algorithm: 'Ed25519', public_key: issuer.pubHex, format: 'DER (SPKI)',
    }, null, 2),
    'provenance/verify.js': verifyScript,
  };

  for (const [fp, content] of Object.entries(artifacts)) {
    await putFile(fp, content, ghMsg('commitArtifact', { filename: fp.split('/').pop() }));
    await sleep(300);
  }

  push({ type: 'msg', kind: 'sys', content: msg('sysArtifactsCommitted') });
  await sleep(1000);
  push({ type: 'done' });
  await sleep(3000);

  return { chain, cert, valid, issueNum, prNum };
}


// ══════════════════════════════════════════
//  MAIN: Server + Playwright + Demo
// ══════════════════════════════════════════

async function main() {
  const langLabel = { en: 'English', zh: '中文', ja: '日本語' }[LANG] || LANG;
  console.log(`
${'='.repeat(62)}
  OPENEXECUTION — AI INFRASTRUCTURE WALKTHROUGH [${langLabel}]
  Dashboard + GLM-4-flash + GitHub + Provenance
${'='.repeat(62)}
`);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  let screenshotCount = 0;
  const snap = async (page, name) => {
    screenshotCount++;
    const filename = `${String(screenshotCount).padStart(2, '0')}-${name}.png`;
    await page.screenshot({ path: path.join(OUTPUT_DIR, filename) });
    console.log(`    [${LANG}] screenshot: ${filename}`);
  };

  // Start dashboard server
  await new Promise(r => server.listen(DASH_PORT, r));
  console.log(`  Dashboard: http://localhost:${DASH_PORT}`);

  // Launch Playwright
  const { chromium } = require('playwright');
  const browser = await chromium.launch({
    headless: false,
    args: ['--window-size=1920,1080'],
  });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: OUTPUT_DIR, size: { width: 1920, height: 1080 } },
  });
  const page = await context.newPage();


  // ╔═══════════════════════════════════════════════╗
  // ║  INTRO TITLE CARD                               ║
  // ╚═══════════════════════════════════════════════╝

  console.log('\n━━━ INTRO TITLE CARD ━━━\n');

  await page.goto('about:blank');
  await sleep(800);
  await showIntroCard(
    page,
    INTRO_TITLE[LANG] || INTRO_TITLE.en,
    INTRO_HEADING[LANG] || INTRO_HEADING.en,
    INTRO_DESC[LANG] || INTRO_DESC.en,
  );
  await snap(page, 'intro-title-card');
  await sleep(6000);
  await hideIntroCard(page);


  // ╔═══════════════════════════════════════════════╗
  // ║  PHASE 1: Live Dashboard                       ║
  // ╚═══════════════════════════════════════════════╝

  console.log('\n━━━ PHASE 1: Live Dashboard ━━━\n');

  await page.goto(`http://localhost:${DASH_PORT}`, { waitUntil: 'domcontentloaded' });
  await sleep(1500);
  await localizeDashboard(page);
  await sleep(1500);
  await showSubtitle(page, sub('intro'));
  await sleep(4000);
  await snap(page, 'dashboard-intro');

  // Start the demo in parallel — it streams SSE events to the dashboard
  const demoPromise = runDemo();

  // Wait for instruction input bar → Playwright types human instruction
  console.log('  Waiting for human input bar...');
  await sleep(3000);
  await clearSubtitle(page);

  // Show subtitle when detection happens
  await sleep(8000); // ACT 1-2 timing
  await showSubtitle(page, sub('detecting'));
  await snap(page, 'dashboard-detecting');
  await sleep(4000);
  await clearSubtitle(page);

  await sleep(6000); // ACT 3 timing
  await showSubtitle(page, sub('aiAnalysis'));
  await snap(page, 'dashboard-ai-analysis');
  await sleep(4000);
  await clearSubtitle(page);

  // Wait for instruction bar (ACT 4)
  await page.waitForSelector('.instr-bar.vis', { timeout: 180000 });
  await sleep(1500);
  await showSubtitle(page, sub('humanInput'));
  await sleep(3000);
  await snap(page, 'dashboard-human-input');

  // Type the instruction character by character
  await page.click('#instr-input');
  await sleep(500);
  const instructionText = HUMAN_INSTRUCTIONS[LANG] || HUMAN_INSTRUCTIONS.en;
  await page.type('#instr-input', instructionText, { delay: 40 });
  await sleep(1500);
  await snap(page, 'dashboard-instruction-typed');

  // Submit
  await page.click('#instr-btn');
  console.log('  Human instruction submitted');
  await sleep(2000);
  await clearSubtitle(page);
  await sleep(2000);
  await showSubtitle(page, sub('authorized'));
  await snap(page, 'dashboard-authorized');
  await sleep(4000);
  await clearSubtitle(page);

  // Wait for fix + review (ACT 5-6)
  await sleep(8000);
  await showSubtitle(page, sub('fixing'));
  await snap(page, 'dashboard-fixing');
  await sleep(4000);
  await clearSubtitle(page);

  await sleep(8000);
  await showSubtitle(page, sub('aiReview'));
  await snap(page, 'dashboard-ai-review');
  await sleep(4000);
  await clearSubtitle(page);

  // Wait for cert (ACT 7)
  await sleep(8000);
  await showSubtitle(page, sub('certificate'));
  await snap(page, 'dashboard-certificate');
  await sleep(4000);

  // Wait for demo to complete
  const result = await demoPromise;
  console.log(`  Demo complete: ${result.chain.events.length} events, cert valid=${result.valid}`);
  await clearSubtitle(page);
  await sleep(2000);

  await showSubtitle(page, sub('dashComplete'));
  await snap(page, 'dashboard-complete');
  await sleep(4000);
  await clearSubtitle(page);
  await sleep(2000);


  // ╔═══════════════════════════════════════════════╗
  // ║  PHASE 2: GitHub Proof Walkthrough              ║
  // ╚═══════════════════════════════════════════════╝

  console.log('\n━━━ PHASE 2: GitHub Proof ━━━\n');

  // Repository
  await page.goto(GITHUB, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(3000);
  await showSubtitle(page, sub('ghRepo'));
  await sleep(3000);
  await snap(page, 'github-repo');
  await clearSubtitle(page);
  await smoothScroll(page, 400);
  await sleep(1000);
  await showSubtitle(page, sub('ghReadme'));
  await sleep(2000);
  await snap(page, 'github-readme');
  await sleep(2000);
  await clearSubtitle(page);

  // Issue
  await page.goto(`${GITHUB}/issues/${result.issueNum}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(3000);
  await showSubtitle(page, sub('ghIssue'));
  await sleep(3000);
  await snap(page, 'github-issue');
  await clearSubtitle(page);
  await smoothScroll(page, 500);
  await sleep(1000);
  await showSubtitle(page, sub('ghIssueComments'));
  await sleep(2000);
  await snap(page, 'github-issue-comments');
  await clearSubtitle(page);
  await smoothScroll(page, 500);
  await sleep(1000);
  await showSubtitle(page, sub('ghIssueAuth'));
  await sleep(2000);
  await snap(page, 'github-issue-authorization');
  await sleep(2000);
  await clearSubtitle(page);

  // Pull Request
  await page.goto(`${GITHUB}/pull/${result.prNum}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(3000);
  await showSubtitle(page, sub('ghPr'));
  await sleep(3000);
  await snap(page, 'github-pr');
  await clearSubtitle(page);
  await smoothScroll(page, 400);
  await sleep(1000);
  await showSubtitle(page, sub('ghPrBody'));
  await sleep(2000);
  await snap(page, 'github-pr-body');
  await sleep(2000);
  await clearSubtitle(page);

  // Provenance chain
  await page.goto(`${GITHUB}/blob/main/provenance/execution-chain.json`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(3000);
  await showSubtitle(page, sub('ghChain'));
  await sleep(3000);
  await snap(page, 'github-chain');
  await clearSubtitle(page);
  await smoothScroll(page, 500);
  await sleep(1000);
  await showSubtitle(page, sub('ghChainEvents'));
  await sleep(2000);
  await snap(page, 'github-chain-events');
  await sleep(2000);
  await clearSubtitle(page);

  // Certificate
  await page.goto(`${GITHUB}/blob/main/provenance/certificate.json`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(3000);
  await showSubtitle(page, sub('ghCert'));
  await snap(page, 'github-certificate');
  await sleep(4000);
  await clearSubtitle(page);

  // Verify script
  await page.goto(`${GITHUB}/blob/main/provenance/verify.js`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(3000);
  await showSubtitle(page, sub('ghVerifyScript'));
  await sleep(3000);
  await snap(page, 'github-verify-script');
  await clearSubtitle(page);
  await smoothScroll(page, 500);
  await sleep(1000);
  await showSubtitle(page, sub('ghVerifyBottom'));
  await sleep(2000);
  await snap(page, 'github-verify-bottom');
  await sleep(2000);
  await clearSubtitle(page);

  // Final — back to repo
  await page.goto(GITHUB, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(3000);
  await showSubtitle(page, sub('final'), 8000);
  await snap(page, 'final');
  await sleep(7000);


  // ── Done ──
  console.log(`
${'='.repeat(62)}
  [${langLabel}] Recording complete: ${screenshotCount} screenshots
  Output: ${OUTPUT_DIR}
  Browser closing...
${'='.repeat(62)}
`);

  await sleep(2000);
  await context.close();
  await browser.close();
  server.close();
}

main().catch(err => {
  console.error(`[${LANG}] FAILED:`, err);
  server.close();
  process.exit(1);
});
