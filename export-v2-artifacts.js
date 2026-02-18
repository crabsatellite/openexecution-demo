#!/usr/bin/env node
/**
 * Export v2 demo artifacts from live PostgreSQL database.
 * Produces the same artifact structure as demo-live/artifacts/ but for the
 * new "platform activity recording" demo (no agents, user-owned connections).
 *
 * Usage: node export-v2-artifacts.js
 * Requires: API server + PostgreSQL running
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Connect to DB directly
const DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/openexecution';

const { Pool } = require(path.join(
  __dirname, '..', 'openexecution-platform', 'api', 'node_modules', 'pg'
));
const pool = new Pool({ connectionString: DATABASE_URL });

const OUT = path.join(__dirname, 'artifacts-v2', 'provenance');

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

function write(filename, data) {
  const fp = path.join(OUT, filename);
  fs.writeFileSync(fp, JSON.stringify(data, null, 2) + '\n');
  console.log(`  ✓ ${filename}`);
}

async function main() {
  console.log('\nExporting v2 demo artifacts...\n');

  // ── 1. Get all chains ──
  const { rows: chains } = await pool.query(
    'SELECT * FROM execution_chains ORDER BY created_at'
  );
  console.log(`Found ${chains.length} chains\n`);

  // ── 2. Get all events ──
  const { rows: allEvents } = await pool.query(
    'SELECT * FROM chain_events ORDER BY chain_id, seq'
  );

  // ── 3. Get connections ──
  const { rows: connections } = await pool.query(
    'SELECT * FROM workspace_connections ORDER BY created_at'
  );

  // ── 4. Get project + bindings ──
  const { rows: projects } = await pool.query('SELECT * FROM projects LIMIT 10');
  const { rows: bindings } = await pool.query(
    `SELECT pwb.*, wc.platform, wc.platform_account_name
     FROM project_workspace_bindings pwb
     JOIN workspace_connections wc ON wc.id = pwb.workspace_connection_id
     ORDER BY pwb.created_at`
  );

  // ── 5. Get users (just names, no passwords) ──
  const { rows: users } = await pool.query(
    'SELECT id, display_name, email, created_at FROM users ORDER BY created_at'
  );

  // ── Build execution chain artifacts (one per chain) ──
  const chainArtifacts = [];
  for (const chain of chains) {
    const events = allEvents.filter(e => e.chain_id === chain.id);
    const binding = bindings.find(b => b.chain_id === chain.id);

    const chainArtifact = {
      id: chain.id,
      chain_type: chain.chain_type,
      origin_type: chain.origin_type,
      origin_id: chain.origin_id,
      status: chain.status,
      event_count: chain.event_count,
      participant_ids: chain.participant_ids,
      platform: binding?.platform || null,
      platform_account: binding?.platform_account_name || null,
      binding_label: binding?.label || null,
      events: events.map(e => ({
        seq: e.seq,
        event_type: e.event_type,
        sentiment: e.sentiment,
        is_liability_event: e.is_liability_event,
        payload: e.payload,
        prev_hash: e.prev_hash,
        event_hash: e.event_hash,
        payload_canonical_hash: e.payload_canonical_hash,
        created_at: e.created_at,
      })),
      created_at: chain.created_at,
      updated_at: chain.updated_at,
    };
    chainArtifacts.push(chainArtifact);
  }

  // Write combined execution chain
  write('execution-chains.json', chainArtifacts);

  // Write the primary chain (Vercel — has the most events + liability event)
  const primaryChain = chainArtifacts.reduce((a, b) =>
    (a.events.length >= b.events.length ? a : b)
  );
  write('execution-chain-primary.json', primaryChain);

  // ── 6. Chain integrity verification ──
  const integrityResults = [];
  for (const chain of chainArtifacts) {
    let prevHash = '0'.repeat(64);
    let errors = [];
    for (const event of chain.events) {
      if (event.prev_hash !== prevHash) {
        errors.push(`Event seq=${event.seq}: prev_hash mismatch`);
      }
      prevHash = event.event_hash;
    }
    integrityResults.push({
      chain_id: chain.id,
      platform: chain.platform,
      event_count: chain.event_count,
      is_valid: errors.length === 0,
      errors,
    });
  }
  write('chain-integrity.json', {
    verified_at: new Date().toISOString(),
    chains: integrityResults,
    all_valid: integrityResults.every(r => r.is_valid),
  });

  // ── 7. Full audit trail (flat event list) ──
  const auditTrail = allEvents.map(e => {
    const chain = chains.find(c => c.id === e.chain_id);
    const binding = bindings.find(b => b.chain_id === e.chain_id);
    return {
      chain_id: e.chain_id,
      platform: binding?.platform || null,
      seq: e.seq,
      event_type: e.event_type,
      is_liability_event: e.is_liability_event,
      payload_summary: summarizePayload(e.event_type, e.payload),
      event_hash: e.event_hash,
      created_at: e.created_at,
    };
  });
  write('audit-trail.json', auditTrail);

  // ── 8. Demo summary ──
  const liabilityCount = allEvents.filter(e => e.is_liability_event).length;
  write('demo-summary.json', {
    demo_type: 'platform_activity_recording',
    version: 'v2',
    scenario: 'CVE-2026-4821 — Cross-platform incident response',
    companies: users.map(u => ({
      display_name: u.display_name,
      email: u.email,
    })),
    connections: connections.map(c => ({
      platform: c.platform,
      account_name: c.platform_account_name,
      status: c.status,
      has_webhook_secret: !!c.webhook_secret,
    })),
    project: projects[0] ? {
      title: projects[0].title,
      description: projects[0].description,
    } : null,
    chains: chainArtifacts.map(c => ({
      id: c.id,
      platform: c.platform,
      event_count: c.event_count,
      status: c.status,
    })),
    totals: {
      chains: chains.length,
      events: allEvents.length,
      liability_events: liabilityCount,
      platforms: [...new Set(connections.map(c => c.platform))],
      webhook_verified_events: allEvents.filter(e =>
        ['deploy_triggered', 'build_succeeded', 'file_updated', 'version_published'].includes(e.event_type)
      ).length,
    },
    integrity: {
      all_chains_valid: integrityResults.every(r => r.is_valid),
      verified_at: new Date().toISOString(),
    },
    completed_at: new Date().toISOString(),
  });

  // ── 9. Workspace connections ──
  write('connections.json', connections.map(c => ({
    id: c.id,
    platform: c.platform,
    platform_account_id: c.platform_account_id,
    platform_account_name: c.platform_account_name,
    status: c.status,
    has_webhook_secret: !!c.webhook_secret,
    scopes: c.scopes,
    created_at: c.created_at,
  })));

  // ── 10. Project bindings ──
  write('project-bindings.json', {
    project: projects[0] ? {
      id: projects[0].id,
      title: projects[0].title,
      description: projects[0].description,
      tags: projects[0].tags,
      repo: projects[0].github_repo_full_name,
    } : null,
    bindings: bindings.map(b => ({
      platform: b.platform,
      account: b.platform_account_name,
      label: b.label,
      chain_id: b.chain_id,
      status: b.status,
    })),
  });

  // ── Done ──
  console.log('\nAll artifacts exported to:', OUT);

  await pool.end();
}

function summarizePayload(eventType, payload) {
  if (!payload) return null;
  switch (eventType) {
    case 'deploy_triggered':
      return `Vercel: ${payload.payload?.name || 'deployment'} on ${payload.payload?.meta?.gitBranch || 'unknown'}`;
    case 'build_succeeded':
      return `Vercel: ${payload.payload?.name || 'build'} ready (${payload.payload?.meta?.gitBranch || 'unknown'})`;
    case 'instruction_received':
      return `HUMAN: ${(payload.instruction_summary || '').substring(0, 80)}...`;
    case 'file_updated':
      return `Figma: ${payload.payload?.file_name || 'file'} updated`;
    case 'version_published':
      return `Figma: ${payload.payload?.file_name || 'file'} version published`;
    default:
      return eventType;
  }
}

main().catch(err => {
  console.error('Export failed:', err.message);
  process.exit(1);
});
