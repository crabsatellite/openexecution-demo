#!/usr/bin/env node
/**
 * Temporary script to set up demo GitHub repo + Vercel project.
 * Run once, then delete.
 */

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const OWNER = 'openexecution-coder';
const REPO = 'shared-auth-lib';

async function ghApi(method, path, body) {
  const res = await fetch('https://api.github.com' + path, {
    method,
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'OpenExecution-Demo',
      Accept: 'application/vnd.github.v3+json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function vcApi(method, path, body) {
  const res = await fetch('https://api.vercel.com' + path, {
    method,
    headers: {
      Authorization: `Bearer ${VERCEL_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function main() {
  console.log('=== Setting up demo repos ===\n');

  // 1. Populate GitHub repo with realistic content
  console.log('[GitHub] Populating shared-auth-lib repo...');

  // Update README
  const readmeContent = [
    '# shared-auth-lib',
    '',
    'Cross-company authentication library for microservice federation.',
    '',
    '## Overview',
    '',
    '`shared-auth-lib` provides JWT-based authentication, RBAC authorization, and token validation',
    'for distributed agent systems. Used by 12+ production services across 3 organizations.',
    '',
    '## Features',
    '',
    '- **JWT Validation** - Ed25519 + RS256 signature verification',
    '- **RBAC Middleware** - Role-based access control with scope inheritance',
    '- **Token Rotation** - Automatic key rotation with zero-downtime',
    '- **Audit Logging** - Every auth decision is traceable',
    '',
    '## Installation',
    '',
    '```bash',
    'npm install @nexuscorp/shared-auth-lib',
    '```',
    '',
    '## Usage',
    '',
    '```javascript',
    "const { validateToken, requireRole } = require('@nexuscorp/shared-auth-lib');",
    '',
    "app.use(validateToken({ issuer: 'nexuscorp.io' }));",
    "app.get('/admin', requireRole('admin'), handler);",
    '```',
    '',
    '## Security',
    '',
    'Report vulnerabilities to security@nexuscorp.io',
    '',
    '## License',
    '',
    'Apache 2.0',
  ].join('\n');

  // Get current README SHA
  const currentReadme = await ghApi('GET', `/repos/${OWNER}/${REPO}/contents/README.md`);
  const readmeSha = currentReadme.data?.sha;

  const r1 = await ghApi('PUT', `/repos/${OWNER}/${REPO}/contents/README.md`, {
    message: 'docs: comprehensive README for shared-auth-lib',
    content: Buffer.from(readmeContent).toString('base64'),
    ...(readmeSha ? { sha: readmeSha } : {}),
  });
  console.log(`  README: ${r1.status === 200 || r1.status === 201 ? 'OK' : 'FAILED ' + r1.status}`);

  // Create package.json
  const pkgContent = JSON.stringify({
    name: '@nexuscorp/shared-auth-lib',
    version: '3.2.4',
    description: 'Cross-company authentication library for microservice federation',
    main: 'src/index.js',
    scripts: { test: 'jest', lint: 'eslint src/', build: 'tsc' },
    keywords: ['auth', 'jwt', 'rbac', 'security'],
    license: 'Apache-2.0',
    dependencies: { jsonwebtoken: '^9.0.0', 'node-forge': '^1.3.1' },
    devDependencies: { jest: '^30.0.0', eslint: '^9.0.0', typescript: '^5.6.0' },
  }, null, 2);

  const r2 = await ghApi('PUT', `/repos/${OWNER}/${REPO}/contents/package.json`, {
    message: 'chore: add package.json v3.2.4',
    content: Buffer.from(pkgContent).toString('base64'),
  });
  console.log(`  package.json: ${r2.status === 201 ? 'OK' : r2.status === 422 ? 'exists' : 'FAILED ' + r2.status}`);

  // Create src/index.js
  const srcContent = [
    '/**',
    ' * shared-auth-lib - Cross-company authentication library',
    ' * @version 3.2.4',
    ' */',
    "const jwt = require('jsonwebtoken');",
    '',
    'class TokenValidator {',
    '  constructor(options = {}) {',
    "    this.issuer = options.issuer || 'nexuscorp.io';",
    "    this.algorithms = options.algorithms || ['EdDSA', 'RS256'];",
    '    this.clockTolerance = options.clockTolerance || 30;',
    '  }',
    '',
    '  validate(token, publicKey) {',
    '    return jwt.verify(token, publicKey, {',
    '      issuer: this.issuer,',
    '      algorithms: this.algorithms,',
    '      clockTolerance: this.clockTolerance,',
    '    });',
    '  }',
    '}',
    '',
    'class RBACMiddleware {',
    '  constructor(roleHierarchy) {',
    "    this.hierarchy = roleHierarchy || { admin: ['write', 'read'], write: ['read'] };",
    '  }',
    '',
    '  requireRole(role) {',
    '    return (req, res, next) => {',
    '      const userRoles = req.auth?.roles || [];',
    '      if (userRoles.some(r => r === role || (this.hierarchy[r] || []).includes(role))) {',
    '        return next();',
    '      }',
    "      res.status(403).json({ error: 'Insufficient permissions' });",
    '    };',
    '  }',
    '}',
    '',
    'module.exports = { TokenValidator, RBACMiddleware };',
  ].join('\n');

  const r3 = await ghApi('PUT', `/repos/${OWNER}/${REPO}/contents/src/index.js`, {
    message: 'feat: token validation and RBAC middleware',
    content: Buffer.from(srcContent).toString('base64'),
  });
  console.log(`  src/index.js: ${r3.status === 201 ? 'OK' : r3.status === 422 ? 'exists' : 'FAILED ' + r3.status}`);

  console.log('[GitHub] Repo populated.\n');


  // 2. Create Vercel project
  console.log('[Vercel] Creating project...');

  // First check if we need to link the GitHub account
  // Try creating a simple project (no git link — just a standalone project)
  const vcProject = await vcApi('POST', '/v10/projects', {
    name: 'shared-auth-lib',
    framework: 'nextjs',
  });

  if (vcProject.status === 200 || vcProject.status === 201) {
    console.log(`  Project created: ${vcProject.data.name} (id: ${vcProject.data.id})`);
  } else if (vcProject.data?.error?.code === 'project_already_exists') {
    console.log('  Project already exists');
    // Get existing project
    const existing = await vcApi('GET', '/v9/projects/shared-auth-lib');
    console.log(`  Project id: ${existing.data.id}`);
  } else {
    console.log(`  FAILED: ${vcProject.status} ${JSON.stringify(vcProject.data).substring(0, 200)}`);
  }

  console.log('\n=== Setup complete ===');
  console.log(`\nGITHUB_OWNER=${OWNER}`);
  console.log(`GITHUB_REPO=${REPO}`);
  console.log('VERCEL_PROJECT=shared-auth-lib');
}

main().catch(console.error);
