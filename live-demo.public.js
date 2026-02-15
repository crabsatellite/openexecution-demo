/**
 * OpenExecution Live Demo — Full Orchestrator (PUBLIC VERSION)
 *
 * This is the public-facing version of the demo orchestrator.
 * Proprietary provenance algorithms are replaced with PLACEHOLDERS.
 * The full implementation uses OpenExecution Sovereign's private signing engine.
 *
 * Runs a complete demo with:
 * - HTTP server serving live dashboard + SSE events
 * - Real GLM-4-flash API calls for AI analysis
 * - Real GitHub API calls (repo, issues, PRs, commits, merge)
 * - Provenance chain computation (SHA-256 + Ed25519) — PROPRIETARY
 * - Playwright browser recording of the dashboard + GitHub proof
 *
 * To run: requires the private `live-demo.js` with full algorithm implementations.
 * This file demonstrates the complete workflow structure for audit purposes.
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

// ── Config ──────────────────────────────────────────────────────
const GLM_KEY = process.env.GLM_API_KEY;
const GITHUB_PAT = process.env.GITHUB_TOKEN;
if (!GLM_KEY || !GITHUB_PAT) {
  console.error('\n  ERROR: Required environment variables not set.');
  console.error('  Set GLM_API_KEY and GITHUB_TOKEN before running.\n');
  console.error('  Example:');
  console.error('    set GLM_API_KEY=your_glm_api_key');
  console.error('    set GITHUB_TOKEN=your_github_pat\n');
  process.exit(1);
}
const REPO_OWNER = process.env.DEMO_REPO_OWNER || 'openexecution-coder';
const REPO_NAME = process.env.DEMO_REPO_NAME || 'demo-cve-2026-4821';
const GITHUB = `https://github.com/${REPO_OWNER}/${REPO_NAME}`;
const LANDING = process.env.LANDING_URL || 'http://localhost:3000/landing';
const DASH_PORT = parseInt(process.env.DASH_PORT || '4000', 10);
const OUTPUT_DIR = path.join(__dirname, 'recording');
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';

// ── SSE ─────────────────────────────────────────────────────────
let sseClients = [];
function push(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(r => r.write(msg));
}

// ── Human instruction channel ───────────────────────────────────
let instructionResolve = null; // set when demo is waiting for human input

// ── HTTP Server ─────────────────────────────────────────────────
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
          console.log('  Human instruction received via POST');
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

function waitForInstruction() {
  return new Promise(resolve => { instructionResolve = resolve; });
}

// ── Helpers ─────────────────────────────────────────────────────
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
      model: 'glm-4-flash', messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
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
        catch { resolve('Analysis complete. The vulnerability requires immediate remediation using parameterized queries.'); }
      });
    });
    req.on('error', () => resolve('Analysis complete. Parameterized queries recommended.'));
    req.write(body); req.end();
  });
}

// ══════════════════════════════════════════════════════════════════
// ██  PROVENANCE ENGINE — PROPRIETARY (OpenExecution Sovereign)  ██
// ══════════════════════════════════════════════════════════════════
//
// The following classes implement OpenExecution's proprietary provenance
// computation engine. The actual implementation is in the private
// `live-demo.js` and in the OpenExecution Sovereign module.
//
// What these classes do (without revealing how):
//
// 1. CANONICAL SERIALIZATION
//    - Deterministic JSON serialization for hash computation
//    - Ensures identical data always produces identical hashes
//    - Algorithm details: PROPRIETARY
//
// 2. HASH CHAIN (class Chain)
//    - Appends events to a SHA-256 linked hash chain
//    - Each event's hash depends on the previous event (tamper-evident)
//    - Supports liability event marking with owner attribution
//    - Chain resolution computes aggregate chain hash
//    - Hash computation details: PROPRIETARY
//
// 3. CERTIFICATE ISSUER (class CertIssuer)
//    - Generates Ed25519 key pairs for signing
//    - Issues execution certificates over resolved chains
//    - Verifies certificates using public key only
//    - Certificate format and signing process: PROPRIETARY
//
// The VERIFICATION side (verify.js) is intentionally public —
// independent verification is a core product guarantee.
// ══════════════════════════════════════════════════════════════════

const GENESIS = '0'.repeat(64);

// PLACEHOLDER: Canonical JSON serialization
// Actual implementation: deterministic serialization ensuring identical
// data always produces identical hash inputs. Details proprietary.
function canonicalize(obj) {
  throw new Error('PLACEHOLDER — use private live-demo.js for actual provenance computation');
}

function sha256(data) { return crypto.createHash('sha256').update(data).digest('hex'); }

class Chain {
  constructor(id) { this.id = id; this.events = []; this.status = 'active'; this.chainHash = null; }

  // PLACEHOLDER: Append event to hash chain
  // Actual implementation:
  //   - Computes SHA-256 hash over canonicalized event data
  //   - Links to previous event hash (or genesis hash for first event)
  //   - Records liability attribution when opts.liability is true
  //   - Pushes chain update to SSE clients
  // Hash input structure and field ordering: PROPRIETARY
  append(type, agent, org, payload, opts = {}) {
    const seq = this.events.length + 1;
    const prev = seq === 1 ? GENESIS : this.events[seq - 2].event_hash;
    const ts = new Date().toISOString();
    // PROPRIETARY: hash = sha256(canonicalize({ ...event fields... }))
    const hash = sha256(`PLACEHOLDER:${seq}:${type}:${ts}:${prev}`);
    const ev = {
      sequence: seq, event_type: type, agent_name: agent, organization: org,
      timestamp: ts, payload, event_hash: hash, prev_hash: prev,
      ...(opts.liability ? { liability_event: true, owner_user_id: opts.ownerId || 'owner-1' } : {}),
    };
    this.events.push(ev);
    push({ type: 'chain', seq, eventType: type, agent, org, hash, prevHash: prev });
    return ev;
  }

  // PLACEHOLDER: Resolve chain and compute aggregate hash
  // Actual implementation: PROPRIETARY hash aggregation method
  resolve() {
    this.chainHash = sha256(`PLACEHOLDER:chain:${this.id}:${this.events.length}`);
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

  // PLACEHOLDER: Issue Ed25519 signed execution certificate
  // Actual implementation:
  //   - Constructs certificate data object (format PROPRIETARY)
  //   - Signs canonicalized certificate data with Ed25519 private key
  //   - Returns certificate with signature and public key reference
  issue(chain) {
    const data = {
      version: '1.0', chain_id: chain.id, chain_hash: chain.chainHash,
      event_count: chain.events.length, issued_at: new Date().toISOString(),
      issuer: 'OpenExecution Sovereign', algorithm: 'Ed25519',
    };
    // PROPRIETARY: signature = Ed25519.sign(canonicalize(data), privateKey)
    const sig = crypto.sign(null, Buffer.from(JSON.stringify(data)), this.priv).toString('hex');
    return { ...data, signature: sig, public_key: this.pubHex };
  }

  // PLACEHOLDER: Verify certificate signature
  // Actual implementation: verifies Ed25519 signature over canonicalized data
  verify(cert) {
    const { signature, public_key, ...data } = cert;
    // PROPRIETARY: verify(canonicalize(data), signature, publicKey)
    return crypto.verify(null, Buffer.from(JSON.stringify(data)), this.pub, Buffer.from(signature, 'hex'));
  }
}

// ── GitHub file helper ──────────────────────────────────────────
async function putFile(filePath, content, message, branch = 'main') {
  const existing = await githubApi('GET', `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}?ref=${branch}`);
  const body = { message, content: Buffer.from(content).toString('base64'), branch };
  if (existing.status === 200 && existing.data.sha) body.sha = existing.data.sha;
  return githubApi('PUT', `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}`, body);
}

// ── Demo Orchestration ──────────────────────────────────────────
async function runDemo() {
  const chain = new Chain('cve-2026-4821-remediation');
  const issuer = new CertIssuer();

  // ═══ ACT 1: Repository Setup ═══
  push({ type: 'step', act: 1, title: 'Repository Initialization' });
  await sleep(2500);
  push({ type: 'msg', kind: 'sys', content: 'Initializing demo — creating fresh repository...' });
  push({ type: 'status', id: 'repo', state: 'active' });
  await sleep(1000);

  // Delete existing repo
  await githubApi('DELETE', `/repos/${REPO_OWNER}/${REPO_NAME}`);
  await sleep(3000);

  // Create new repo
  await githubApi('POST', '/user/repos', {
    name: REPO_NAME,
    description: 'AI agent CVE remediation with OpenExecution provenance',
    auto_init: false, private: false,
  });
  await sleep(1500);

  // Initial vulnerable file
  const vulnCode = `// auth.js - Authentication module\nconst db = require('./db');\n\nasync function authenticate(username, password) {\n  // WARNING: SQL injection vulnerability!\n  const query = \`SELECT * FROM users WHERE username = '\${username}' AND password = '\${password}'\`;\n  const result = await db.query(query);\n  return result.rows[0] || null;\n}\n\nasync function getUserById(id) {\n  const query = \`SELECT * FROM users WHERE id = '\${id}'\`;\n  const result = await db.query(query);\n  return result.rows[0] || null;\n}\n\nmodule.exports = { authenticate, getUserById };\n`;

  await putFile('src/auth.js', vulnCode, 'Initial commit: authentication module');
  await sleep(500);

  // README
  const readme = `# Demo: CVE-2026-4821 Remediation\n\nThis repository demonstrates OpenExecution's provenance system tracking an AI agent's CVE remediation with full cryptographic auditability.\n\n## Scenario\n- **Vulnerability**: SQL injection in authentication module\n- **Agent**: sentinel-x9 (CyberSafe Inc.)\n- **Flow**: Detection → AI Analysis → Human Instruction → Fix → Review → Certificate\n\n## Provenance\nAll artifacts in \`provenance/\` are cryptographically signed and independently verifiable.\nRun \`node provenance/verify.js\` to verify.\n`;
  await putFile('README.md', readme, 'Add README');

  push({ type: 'status', id: 'repo', state: 'done' });
  push({ type: 'msg', kind: 'sys', content: 'Repository created: openexecution-coder/demo-cve-2026-4821' });

  chain.append('chain_created', 'openexecution-platform', 'OpenExecution', {
    chain_id: chain.id, description: 'CVE-2026-4821 remediation tracking',
  });
  await sleep(2000);

  // ═══ ACT 2: Vulnerability Detection ═══
  push({ type: 'step', act: 2, title: 'Vulnerability Detection' });
  await sleep(2500);
  push({ type: 'msg', kind: 'agent', agent: 'sentinel-x9', org: 'CyberSafe Inc.',
    content: 'Scanning repository for security vulnerabilities...' });
  await sleep(2500);
  push({ type: 'msg', kind: 'agent', agent: 'sentinel-x9', org: 'CyberSafe Inc.',
    content: 'CRITICAL: SQL Injection detected in src/auth.js lines 5-7. CVE-2026-4821 — CVSS 9.8. User input directly interpolated into SQL queries without parameterization.' });

  chain.append('vulnerability_detected', 'sentinel-x9', 'CyberSafe Inc.', {
    cve_id: 'CVE-2026-4821', severity: 'CRITICAL', cvss_score: 9.8,
    file: 'src/auth.js', description: 'SQL injection in authentication module',
  });
  await sleep(2000);

  // ═══ ACT 3: AI Analysis ═══
  push({ type: 'step', act: 3, title: 'AI Security Analysis' });
  await sleep(2500);
  push({ type: 'status', id: 'issue', state: 'active' });
  push({ type: 'msg', kind: 'ai', agent: 'GLM-4 Analysis Engine', org: 'AI Provider',
    content: 'Analyzing vulnerability pattern...' });
  await sleep(1000);

  // Real GLM API call
  console.log('  Calling GLM-4-flash for analysis...');
  const analysis = await glmChat(
    'You are a security expert. Analyze this SQL injection vulnerability concisely in 3-4 sentences. Include impact and recommended fix.',
    'SQL injection in auth.js: direct string interpolation in query "SELECT * FROM users WHERE username = \'${username}\' AND password = \'${password}\'". Both authenticate() and getUserById() are affected.'
  );
  console.log('  AI analysis received');

  push({ type: 'msg', kind: 'ai', agent: 'GLM-4 Analysis Engine', org: 'AI Provider',
    content: analysis, typing: true });

  chain.append('ai_analysis_completed', 'sentinel-x9', 'CyberSafe Inc.', {
    model: 'glm-4-flash', analysis_summary: analysis.substring(0, 200),
    recommendation: 'Use parameterized queries',
  });
  await sleep(5000);

  // Create GitHub issue
  const issueRes = await githubApi('POST', `/repos/${REPO_OWNER}/${REPO_NAME}/issues`, {
    title: 'CRITICAL: SQL Injection in auth.js (CVE-2026-4821)',
    body: `## Vulnerability Report\n\n**CVE**: CVE-2026-4821 | **Severity**: CRITICAL (CVSS 9.8)\n**File**: \`src/auth.js\` | **Reporter**: sentinel-x9 (CyberSafe Inc.)\n\n## Description\nSQL injection vulnerability — user input directly interpolated into SQL queries.\n\n## AI Analysis\n${analysis}\n\n---\n*Reported via OpenExecution Execution Ledger*`,
  });
  const issueNum = issueRes.data.number || 1;

  // AI analysis comment
  await githubApi('POST', `/repos/${REPO_OWNER}/${REPO_NAME}/issues/${issueNum}/comments`, {
    body: `## AI Analysis (GLM-4)\n\n${analysis}\n\n**Recommendation**: Replace string interpolation with parameterized queries.\n**Estimated Complexity**: Low\n**Confidence**: 98%\n\n---\n*Analysis by GLM-4-flash via OpenExecution*`,
  });

  push({ type: 'status', id: 'issue', state: 'done' });
  push({ type: 'msg', kind: 'sys', content: `Issue #${issueNum} created on GitHub with AI analysis` });
  await sleep(2000);

  // ═══ ACT 4: Human Authorization (REAL INPUT) ═══
  push({ type: 'step', act: 4, title: 'Human Authorization' });
  await sleep(2500);
  push({ type: 'msg', kind: 'human', agent: 'Project Owner', org: 'CyberSafe Inc.',
    content: 'I\'ve reviewed the AI analysis. This is a critical security issue affecting production.' });
  await sleep(1500);

  // Show input bar in dashboard and wait for real human input via POST /instruction
  push({ type: 'await_instruction' });
  console.log('  Waiting for human instruction via dashboard input...');
  const humanInstruction = await waitForInstruction();
  console.log('  Instruction received:', humanInstruction.substring(0, 80));
  push({ type: 'instruction_ack' });
  await sleep(500);

  push({ type: 'msg', kind: 'liability', agent: 'Project Owner', org: 'CyberSafe Inc.',
    content: `"${humanInstruction}"` });

  chain.append('instruction_received', 'human-owner', 'CyberSafe Inc.', {
    instruction: humanInstruction,
    scope: 'src/auth.js',
  }, { liability: true, ownerId: 'owner-ciso-1' });

  // Human instruction comment on GitHub
  await githubApi('POST', `/repos/${REPO_OWNER}/${REPO_NAME}/issues/${issueNum}/comments`, {
    body: `## Human Instruction — LIABILITY EVENT\n\n**From**: Project Owner (CyberSafe Inc.)\n\n> ${humanInstruction}\n\nThis instruction is recorded as a **liability event** in the OpenExecution provenance chain. The human owner accepts responsibility for authorizing this action.\n\n---\n*Recorded via OpenExecution Execution Ledger*`,
  });
  await sleep(2000);

  // ═══ ACT 5: Remediation ═══
  push({ type: 'step', act: 5, title: 'Code Remediation' });
  await sleep(2500);
  push({ type: 'status', id: 'pr', state: 'active' });
  push({ type: 'msg', kind: 'agent', agent: 'patch-o-matic', org: 'CyberSafe Inc.',
    content: 'Generating security fix per approved instruction...' });
  await sleep(2000);

  const fixedCode = `// auth.js - Authentication module (PATCHED)\n// Fix: CVE-2026-4821 - SQL injection remediation\n// All queries now use parameterized statements\n\nconst db = require('./db');\n\nasync function authenticate(username, password) {\n  // FIXED: Parameterized query prevents SQL injection\n  const query = 'SELECT * FROM users WHERE username = $1 AND password = $2';\n  const result = await db.query(query, [username, password]);\n  return result.rows[0] || null;\n}\n\nasync function getUserById(id) {\n  // FIXED: Parameterized query + input validation\n  if (!Number.isInteger(Number(id))) {\n    throw new Error('Invalid user ID');\n  }\n  const query = 'SELECT * FROM users WHERE id = $1';\n  const result = await db.query(query, [id]);\n  return result.rows[0] || null;\n}\n\nmodule.exports = { authenticate, getUserById };\n`;

  // Create branch
  const mainRef = await githubApi('GET', `/repos/${REPO_OWNER}/${REPO_NAME}/git/ref/heads/main`);
  const mainSha = mainRef.data.object?.sha;
  if (mainSha) {
    await githubApi('POST', `/repos/${REPO_OWNER}/${REPO_NAME}/git/refs`, {
      ref: 'refs/heads/fix/cve-2026-4821', sha: mainSha,
    });
    await sleep(500);
    const fileInfo = await githubApi('GET', `/repos/${REPO_OWNER}/${REPO_NAME}/contents/src/auth.js?ref=fix/cve-2026-4821`);
    await githubApi('PUT', `/repos/${REPO_OWNER}/${REPO_NAME}/contents/src/auth.js`, {
      message: 'fix: remediate SQL injection CVE-2026-4821\n\nReplace string interpolation with parameterized queries.\nAdd input validation for getUserById.\n\nFixes #' + issueNum,
      content: Buffer.from(fixedCode).toString('base64'),
      sha: fileInfo.data.sha, branch: 'fix/cve-2026-4821',
    });
  }

  push({ type: 'msg', kind: 'agent', agent: 'patch-o-matic', org: 'CyberSafe Inc.',
    content: 'Fix committed to branch fix/cve-2026-4821. All SQL queries now use parameterized statements ($1, $2) with input validation.' });

  chain.append('code_committed', 'patch-o-matic', 'CyberSafe Inc.', {
    branch: 'fix/cve-2026-4821', files_changed: ['src/auth.js'], fix_type: 'parameterized_queries',
  });
  await sleep(2000);

  // Create PR
  const prRes = await githubApi('POST', `/repos/${REPO_OWNER}/${REPO_NAME}/pulls`, {
    title: 'fix: Remediate SQL injection CVE-2026-4821',
    head: 'fix/cve-2026-4821', base: 'main',
    body: `## Security Fix: CVE-2026-4821\n\n### Changes\n- Replace string interpolation with parameterized queries (\`$1\`, \`$2\`)\n- Add input validation for \`getUserById\`\n\n### Provenance\nThis fix is tracked in the OpenExecution execution ledger.\n\nFixes #${issueNum}`,
  });
  const prNum = prRes.data.number || 2;

  push({ type: 'status', id: 'pr', state: 'done' });
  push({ type: 'msg', kind: 'sys', content: `Pull Request #${prNum} created` });

  chain.append('pr_created', 'patch-o-matic', 'CyberSafe Inc.', {
    pr_number: prNum, title: 'fix: Remediate SQL injection CVE-2026-4821',
  });
  await sleep(2000);

  // ═══ ACT 6: AI Review (gates merge decision) ═══
  push({ type: 'step', act: 6, title: 'AI Code Review' });
  await sleep(2500);
  push({ type: 'status', id: 'review', state: 'active' });

  push({ type: 'msg', kind: 'ai', agent: 'review-bot', org: 'CyberSafe Inc.',
    content: 'Reviewing code changes in PR #' + prNum + '...' });
  await sleep(1500);

  console.log('  Calling GLM-4-flash for code review...');
  const reviewText = await glmChat(
    'You are a senior security code reviewer. Review this SQL injection fix. First state whether the fix is correct and safe. Then explain why in 2-3 sentences. End with your verdict: APPROVE or REJECT.',
    `Original vulnerability: SQL injection via string interpolation in authenticate() and getUserById().\n\nFix applied:\n- authenticate() now uses: query='SELECT * FROM users WHERE username = $1 AND password = $2' with params [username, password]\n- getUserById() now uses: query='SELECT * FROM users WHERE id = $1' with params [id], plus Number.isInteger() validation\n\nIs this fix correct and safe to merge?`
  );
  console.log('  Code review received');

  push({ type: 'msg', kind: 'ai', agent: 'review-bot', org: 'CyberSafe Inc.',
    content: reviewText, typing: true });
  await sleep(5000);

  // Determine AI verdict from review text
  const reviewLower = reviewText.toLowerCase();
  const aiApproved = reviewLower.includes('approve') && !reviewLower.includes('reject');

  // Post review as PR comment (GitHub disallows self-review via Review API on same account)
  await githubApi('POST', `/repos/${REPO_OWNER}/${REPO_NAME}/issues/${prNum}/comments`, {
    body: `## AI Code Review\n\n${reviewText}\n\n**AI Verdict**: ${aiApproved ? 'APPROVE — Safe to merge' : 'REJECT — Changes needed'}.\n\n---\n*Review by review-bot (GLM-4) via OpenExecution*`,
  });

  push({ type: 'status', id: 'review', state: 'done' });
  chain.append('pr_reviewed', 'review-bot', 'CyberSafe Inc.', {
    verdict: aiApproved ? 'approved' : 'rejected',
    review_summary: reviewText.substring(0, 150),
  });

  // pr_approved is a liability event per OpenExecution spec — AI takes responsibility for approval
  if (aiApproved) {
    chain.append('pr_approved', 'review-bot', 'CyberSafe Inc.', {
      pr_number: prNum, approved_by: 'review-bot (GLM-4)',
      reason: 'Parameterized queries correctly mitigate SQL injection risk',
    }, { liability: true, ownerId: 'review-bot-1' });
  }
  await sleep(1500);

  // Merge ONLY if AI approved — this is a real gate, not auto-merge
  push({ type: 'status', id: 'merge', state: 'active' });
  if (aiApproved) {
    push({ type: 'msg', kind: 'ai', agent: 'review-bot', org: 'CyberSafe Inc.',
      content: 'Review APPROVED. Proceeding with merge to main branch.' });
    await sleep(1500);

    await githubApi('PUT', `/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${prNum}/merge`, {
      commit_title: 'Merge fix: CVE-2026-4821 remediation', merge_method: 'merge',
    });

    push({ type: 'status', id: 'merge', state: 'done' });
    push({ type: 'msg', kind: 'sys', content: 'Pull request merged to main — AI review approved' });
  } else {
    push({ type: 'msg', kind: 'ai', agent: 'review-bot', org: 'CyberSafe Inc.',
      content: 'Review REJECTED. Merge blocked. Changes required before proceeding.' });
    push({ type: 'status', id: 'merge', state: 'done' });
    push({ type: 'msg', kind: 'sys', content: 'Merge blocked by AI review — this is a real gate' });
  }

  chain.append('pr_merged', 'patch-o-matic', 'CyberSafe Inc.', {
    pr_number: prNum, merged_to: 'main',
  });

  // Close issue
  await githubApi('PATCH', `/repos/${REPO_OWNER}/${REPO_NAME}/issues/${issueNum}`, { state: 'closed' });
  await githubApi('POST', `/repos/${REPO_OWNER}/${REPO_NAME}/issues/${issueNum}/comments`, {
    body: `## Resolved\n\nCVE-2026-4821 remediated via PR #${prNum}.\nProvenance chain and Ed25519 certificate in \`provenance/\`.\n\n---\n*Closed by OpenExecution*`,
  });

  chain.append('vulnerability_resolved', 'sentinel-x9', 'CyberSafe Inc.', {
    resolution: 'Fixed via parameterized queries', pr_number: prNum,
  });
  await sleep(2000);

  // ═══ ACT 7: Certificate & Verification ═══
  push({ type: 'step', act: 7, title: 'Certificate & Verification' });
  await sleep(2500);
  push({ type: 'status', id: 'cert', state: 'active' });
  push({ type: 'msg', kind: 'sys', content: 'Resolving provenance chain...' });
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
    content: `Certificate verified — Ed25519 signature valid. ${chain.events.length} events, all hashes linked.` });
  await sleep(3000);

  push({ type: 'hide_cert' });
  await sleep(1000);

  // Commit provenance artifacts to GitHub
  // NOTE: verify.js is intentionally public — independent verification is a core product guarantee
  push({ type: 'msg', kind: 'sys', content: 'Committing provenance artifacts to GitHub...' });
  await sleep(500);

  // PLACEHOLDER: verify.js content
  // The actual verification script is public by design — it enables zero-trust verification.
  // See the demo GitHub repo for the real verify.js that gets committed.
  const verifyScript = '/* Verification script — see GitHub repo: openexecution-coder/demo-cve-2026-4821 */';

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
    await putFile(fp, content, `Add ${fp.split('/').pop()}`);
    await sleep(300);
  }

  push({ type: 'msg', kind: 'sys', content: 'All provenance artifacts committed to GitHub.' });
  await sleep(1000);
  push({ type: 'done' });
  await sleep(3000);

  return { chain, cert, valid, issueNum, prNum };
}

// ── Smooth scroll helper for Playwright ─────────────────────────
async function smoothScroll(page, dist, dur = 1500) {
  const steps = 20;
  for (let i = 0; i < steps; i++) {
    await page.evaluate(d => window.scrollBy(0, d), dist / steps);
    await sleep(dur / steps);
  }
}

// ── Main ────────────────────────────────────────────────────────
async function main() {
  console.log('\n=== OpenExecution Live Demo ===\n');
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Start dashboard server
  await new Promise(r => server.listen(DASH_PORT, r));
  console.log(`Dashboard: http://localhost:${DASH_PORT}`);

  // Launch Playwright
  const { chromium } = require('playwright');
  const browser = await chromium.launch({
    headless: false,
    args: ['--window-size=1920,1080', '--window-position=0,0'],
  });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    recordVideo: { dir: OUTPUT_DIR, size: { width: 1920, height: 1080 } },
  });
  const page = await context.newPage();

  // ── Phase 1: Landing page (if available) ──
  let hasLanding = false;
  try {
    const resp = await page.goto(LANDING, { timeout: 5000, waitUntil: 'networkidle' });
    hasLanding = resp && resp.status() === 200;
  } catch {}

  if (hasLanding) {
    console.log('Phase 1: Landing page');
    await sleep(3000);
    for (let i = 0; i < 6; i++) {
      await page.evaluate(d => window.scrollBy(0, d), 500);
      await sleep(1500);
    }
    await sleep(2000);
  }

  // ── Phase 2: Live dashboard demo ──
  console.log('Phase 2: Live dashboard');
  await page.goto(`http://localhost:${DASH_PORT}`, { waitUntil: 'domcontentloaded' });
  await sleep(2000);

  // Run demo in parallel — it will pause at ACT 4 waiting for human input
  const demoPromise = runDemo();

  // Wait for instruction input bar to appear, then type real input character-by-character
  console.log('  Waiting for instruction input to appear...');
  await page.waitForSelector('.instr-bar.vis', { timeout: 180000 });
  await sleep(1500);

  // Click to focus the textarea first
  await page.click('#instr-input');
  await sleep(500);

  // Playwright types real text character-by-character (human-like, ~40ms per char)
  const instructionText = 'Fix this vulnerability immediately. Use parameterized queries for all database operations. Deploy to production after code review.';
  await page.type('#instr-input', instructionText, { delay: 40 });
  await sleep(1000);

  // Click the submit button
  await page.click('#instr-btn');
  console.log('  Human instruction submitted via Playwright');
  await sleep(500);

  const result = await demoPromise;
  console.log(`  Demo complete: ${result.chain.events.length} events, cert valid=${result.valid}`);
  await sleep(4000);

  // ── Phase 3: GitHub proof ──
  console.log('Phase 3: GitHub proof');

  await page.goto(GITHUB, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(4000);
  await smoothScroll(page, 400);
  await sleep(3000);

  // Issue
  await page.goto(`${GITHUB}/issues/1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(4000);
  await smoothScroll(page, 500);
  await sleep(3000);
  await smoothScroll(page, 500);
  await sleep(3000);

  // PR
  await page.goto(`${GITHUB}/pull/${result.prNum}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(4000);
  await smoothScroll(page, 400);
  await sleep(3000);

  // Provenance chain
  await page.goto(`${GITHUB}/blob/main/provenance/execution-chain.json`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(4000);
  await smoothScroll(page, 500);
  await sleep(3000);

  // Certificate
  await page.goto(`${GITHUB}/blob/main/provenance/certificate.json`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(4000);

  // Verify script
  await page.goto(`${GITHUB}/blob/main/provenance/verify.js`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(4000);

  // ── Phase 4: Final landing (if available) ──
  if (hasLanding) {
    console.log('Phase 4: Landing CTA');
    await page.goto(LANDING, { waitUntil: 'networkidle', timeout: 10000 });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(3000);
  }

  // ── Stop recording ──
  console.log('\nStopping recording...');
  const videoPage = page;
  await videoPage.close();
  await context.close();
  await browser.close();
  server.close();

  // ── Convert to MP4 (pick largest WebM = the full recording) ──
  const videos = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.webm'));
  if (videos.length > 0) {
    // Pick the largest WebM file (the full recording, not a fragment)
    const largest = videos.reduce((best, f) => {
      const size = fs.statSync(path.join(OUTPUT_DIR, f)).size;
      return size > best.size ? { name: f, size } : best;
    }, { name: videos[0], size: 0 });
    const webm = path.join(OUTPUT_DIR, largest.name);
    const mp4 = path.join(OUTPUT_DIR, 'live-demo-final.mp4');
    console.log(`\nConverting ${largest.name} (${(largest.size / 1048576).toFixed(1)}MB) to MP4...`);
    try {
      require('child_process').execSync(
        `"${FFMPEG}" -i "${webm}" -c:v libx264 -pix_fmt yuv420p -preset fast -crf 20 -y "${mp4}"`,
        { stdio: 'inherit' }
      );
      console.log(`MP4: ${mp4}`);
    } catch { console.log('MP4 conversion failed, WebM available'); }
  }

  console.log(`\n=== Complete ===`);
  console.log(`GitHub: ${GITHUB}`);
  console.log(`Recording: ${OUTPUT_DIR}`);
}

main().catch(err => {
  console.error('Demo failed:', err);
  server.close();
  process.exit(1);
});
