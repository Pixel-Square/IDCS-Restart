#!/usr/bin/env node
import { performance } from 'node:perf_hooks';

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      out[key] = true;
      continue;
    }
    out[key] = next;
    i++;
  }
  return out;
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

const args = parseArgs(process.argv);
const base = String(args.base || 'http://127.0.0.1:8000').replace(/\/+$/, '');
const endpoint = String(args.endpoint || '/api/accounts/token/');
const identifier = String(args.identifier || process.env.LOGIN_IDENTIFIER || '');
const password = String(args.password || process.env.LOGIN_PASSWORD || '');
const concurrency = Math.max(1, Number(args.concurrency || 50));
const requests = Math.max(1, Number(args.requests || 500));
const timeoutMs = Math.max(1000, Number(args.timeout || 15000));
const okStatuses = new Set(
  String(args.okStatuses || args.okStatus || '200')
    .split(',')
    .map((v) => Number(String(v).trim()))
    .filter((n) => Number.isFinite(n) && n > 0)
);

if (!identifier || !password) {
  console.error('Missing credentials. Provide --identifier and --password (or LOGIN_IDENTIFIER / LOGIN_PASSWORD env vars).');
  process.exit(2);
}

const url = `${base}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
let nextIndex = 0;
let success = 0;
let failed = 0;
const byStatus = new Map();
const latencies = [];

async function doOneRequest(index) {
  const started = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password }),
      signal: controller.signal,
    });
    const elapsed = performance.now() - started;
    latencies.push(elapsed);

    const statusKey = String(res.status);
    byStatus.set(statusKey, (byStatus.get(statusKey) || 0) + 1);

    if (res.ok || okStatuses.has(res.status)) {
      success++;
    } else {
      failed++;
      const txt = await res.text().catch(() => '');
      if (index < 5) {
        console.error(`[sample error #${index + 1}] status=${res.status} body=${txt.slice(0, 300)}`);
      }
    }
  } catch (e) {
    const elapsed = performance.now() - started;
    latencies.push(elapsed);
    failed++;
    byStatus.set('ERR', (byStatus.get('ERR') || 0) + 1);
    if (index < 5) {
      console.error(`[sample error #${index + 1}] ${e?.name || 'Error'}: ${e?.message || e}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function worker() {
  while (true) {
    const idx = nextIndex;
    nextIndex += 1;
    if (idx >= requests) return;
    await doOneRequest(idx);
  }
}

const testStart = performance.now();
await Promise.all(Array.from({ length: concurrency }, () => worker()));
const testElapsedMs = performance.now() - testStart;

latencies.sort((a, b) => a - b);
const rps = requests / (testElapsedMs / 1000);
const p50 = percentile(latencies, 50);
const p95 = percentile(latencies, 95);
const p99 = percentile(latencies, 99);

console.log('\n=== Login Load Test Summary ===');
console.log(`URL           : ${url}`);
console.log(`Requests      : ${requests}`);
console.log(`Concurrency   : ${concurrency}`);
console.log(`OK Statuses   : ${[...okStatuses].sort((a, b) => a - b).join(',')}`);
console.log(`Duration      : ${(testElapsedMs / 1000).toFixed(2)}s`);
console.log(`Throughput    : ${rps.toFixed(2)} req/s`);
console.log(`Success       : ${success}`);
console.log(`Failed        : ${failed}`);
console.log(`Success Rate  : ${((success / requests) * 100).toFixed(2)}%`);
console.log(`Latency p50   : ${p50.toFixed(1)} ms`);
console.log(`Latency p95   : ${p95.toFixed(1)} ms`);
console.log(`Latency p99   : ${p99.toFixed(1)} ms`);

console.log('\nStatus counts:');
for (const [k, v] of [...byStatus.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  console.log(`  ${k}: ${v}`);
}

if (success < requests) process.exitCode = 1;
