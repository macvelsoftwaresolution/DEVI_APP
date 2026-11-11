#!/usr/bin/env node
/**
 * SOS load test: many SOS at once, then "I am safe" on each, with latency percentiles.
 *
 *   node scripts/load-test.js --total 300 --concurrency 50
 *   node scripts/load-test.js --url http://localhost:5005/api --total 1000 --concurrency 100
 *
 * Run it against a LOCAL server on the DEVELOPMENT database, started with no WhatsApp, call or
 * Google Maps keys, so nothing is sent and nothing is billed (see docs/DEVI_PSR_ANALYSIS.md,
 * "Load test"). It refuses the production API.
 *
 * Every SOS is a guest SOS with its own guest id and idempotency key, so none is a duplicate,
 * and its guardians are made-up +91 90000 numbers. Every alert is resolved at the end, so the
 * retry worker drops its jobs.
 */
import { randomUUID, randomBytes } from 'node:crypto';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, a, i, all) => {
    if (a.startsWith('--')) pairs.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']);
    return pairs;
  }, []),
);
const URL_BASE = String(args.url || 'http://localhost:5005/api').replace(/\/+$/, '');
const TOTAL = Number(args.total || 100);
const CONCURRENCY = Number(args.concurrency || 20);
const CONTACTS = Number(args.contacts ?? 2);
const RESOLVE = args.resolve !== 'false';
const TIMEOUT_MS = Number(args.timeout || 30_000);

if (/macvelsoftware\.com/i.test(URL_BASE)) {
  console.error('Refused: this is the production API. Run against a local server on the development database.');
  process.exit(1);
}

const guestId = () => `GUEST_${randomBytes(16).toString('hex').toUpperCase()}`;
const fakeGuardian = () => `+9190000${String(Math.floor(Math.random() * 100000)).padStart(5, '0')}`;

const percentile = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] : null);

const timed = async (fn) => {
  const t = performance.now();
  try {
    const res = await fn();
    return { ms: performance.now() - t, ...res };
  } catch (e) {
    return { ms: performance.now() - t, status: 0, error: e.name === 'TimeoutError' ? 'timeout' : e.message };
  }
};

const triggerOne = () => timed(async () => {
  const contacts = Array.from({ length: CONTACTS }, fakeGuardian);
  const res = await fetch(`${URL_BASE}/sos/trigger`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userPhone: guestId(),
      userName: 'Load Test',
      location: 'GPS',
      latitude: 13.0827 + (Math.random() - 0.5) * 0.2,
      longitude: 80.2707 + (Math.random() - 0.5) * 0.2,
      accuracy: 12,
      idempotency_key: randomUUID(),
      captured_at: new Date().toISOString(),
      contactsAlerted: contacts,
      emergencyContacts: contacts,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = await res.json().catch(() => ({}));
  return {
    status: res.status,
    alertId: body?.data?.id,
    controlToken: body?.data?.controlToken,
    degraded: !!body?.data?.degraded,
    duplicate: !!body?.duplicate,
  };
});

const resolveOne = (alertId, controlToken) => timed(async () => {
  const res = await fetch(`${URL_BASE}/sos/resolve/${alertId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-sos-token': controlToken },
    body: '{}',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return { status: res.status };
});

// Runs `count` jobs with at most `limit` in flight
const pool = async (count, limit, job) => {
  const results = [];
  let next = 0;
  const worker = async () => {
    while (next < count) {
      const i = next++;
      results[i] = await job(i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, count) }, worker));
  return results;
};

const report = (label, results, wallMs) => {
  const ms = results.map((r) => r.ms).sort((a, b) => a - b);
  const codes = {};
  for (const r of results) codes[r.error || r.status] = (codes[r.error || r.status] || 0) + 1;
  const ok = results.filter((r) => r.status >= 200 && r.status < 300).length;
  const f = (v) => (v == null ? '-' : `${Math.round(v)} ms`);
  console.log(`\n${label}`);
  console.log(`  requests   ${results.length} in ${(wallMs / 1000).toFixed(1)} s (${(results.length / (wallMs / 1000)).toFixed(1)}/s)`);
  console.log(`  ok         ${ok} (${((ok / results.length) * 100).toFixed(1)}%)`);
  console.log(`  answers    ${JSON.stringify(codes)}`);
  console.log(`  latency    p50 ${f(percentile(ms, 50))}  p90 ${f(percentile(ms, 90))}  p95 ${f(percentile(ms, 95))}  p99 ${f(percentile(ms, 99))}  max ${f(ms.at(-1))}`);
};

console.log(`SOS load test: ${TOTAL} SOS, ${CONCURRENCY} at once, ${CONTACTS} made-up guardian(s) each, against ${URL_BASE}`);

const t0 = performance.now();
const sos = await pool(TOTAL, CONCURRENCY, () => triggerOne());
report('SOS /trigger', sos, performance.now() - t0);
const degraded = sos.filter((r) => r.degraded).length;
const duplicates = sos.filter((r) => r.duplicate).length;
console.log(`  saved without the database (degraded) ${degraded}, answered as duplicate ${duplicates}`);

if (RESOLVE) {
  const open = sos.filter((r) => r.alertId && r.controlToken);
  const t1 = performance.now();
  const resolved = await pool(open.length, CONCURRENCY, (i) => resolveOne(open[i].alertId, open[i].controlToken));
  report('"I am safe" /resolve', resolved, performance.now() - t1);
  const missing = sos.length - open.length;
  if (missing) console.log(`  ${missing} SOS gave no alert id or control token, so they were not resolved`);
}
