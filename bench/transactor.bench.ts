/**
 * M2 bench: sustained write throughput through the Transactor write path
 * (validate → resolve → assign t → GROUP COMMIT to a real SQLite file →
 * ack → novelty broadcast) with N concurrent clients, no Cloudflare.
 * Target: ≥ 500 tx/s sustained on small txs with group commit.
 *
 *   bun run bench/transactor.bench.ts [concurrency=64] [seconds=5]
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Harness, attribute } from "../packages/transactor/test/harness.ts";
import { fmt, percentile } from "./lib.ts";

const conc = Number(process.argv[2] ?? 64);
const seconds = Number(process.argv[3] ?? 5);

const dir = mkdtempSync(join(tmpdir(), "ripple-tx-"));
const file = join(dir, "transactor.sqlite");

async function run(label: string, groupCommit: boolean) {
  const h = new Harness({ file: `${file}-${label}`, config: { maxBatch: groupCommit ? 0 : 1, indexTxThreshold: 1_000_000, indexIntervalMs: 1_000_000 } });
  const tx = h.transactor;
  await tx.init();
  await tx.transact([attribute(":k/id", "long", { ":db/unique": ":db.unique/identity" }), attribute(":k/v", "string")]);
  const sub = h.subscribe(tx.t); // one novelty subscriber receiving every frame

  let done = 0, errors = 0;
  const lat: number[] = [];
  const deadline = Date.now() + seconds * 1000;
  async function client(id: number) {
    let i = 0;
    while (Date.now() < deadline) {
      const t0 = performance.now();
      try {
        await tx.transact([{ ":k/id": id * 1_000_000 + i++, ":k/v": "x" }]);
        done++;
      } catch {
        errors++;
      }
      lat.push(performance.now() - t0);
    }
  }
  const t0 = performance.now();
  await Promise.all(Array.from({ length: conc }, (_, i) => client(i)));
  const ms = performance.now() - t0;
  lat.sort((a, b) => a - b);
  const tps = (done / ms) * 1000;
  console.log(`${label.padEnd(16)} concurrency=${conc}: ${done} tx in ${fmt(ms, 0)} ms → ${fmt(tps, 0)} tx/s, errors=${errors}`);
  console.log(`  ack latency p50 ${fmt(percentile(lat, 50))} ms  p95 ${fmt(percentile(lat, 95))} ms  p99 ${fmt(percentile(lat, 99))} ms`);
  console.log(`  storage writes=${h.writes} batches=${tx.stats.batches} maxBatch=${tx.stats.maxBatch} avgBatch=${fmt(tx.stats.txs / Math.max(1, tx.stats.batches), 1)} frames=${sub.ofKind("tx").length}`);
  // sanity: durable log is contiguous
  const ts = h.logTs();
  for (let i = 0; i < ts.length; i++) if (ts[i] !== i + 1) throw new Error(`log gap at ${i}: ${ts[i]}`);
  if (ts.length !== tx.t) throw new Error(`log length ${ts.length} != t ${tx.t}`);
  h.db.close();
  return tps;
}

const grouped = await run("group-commit", true);
const single = await run("one-tx-per-write", false);
rmSync(dir, { recursive: true, force: true });

console.log(`\nM2 gate: ≥ 500 tx/s sustained with group commit → ${grouped >= 500 ? "PASS" : "FAIL"} (${fmt(grouped, 0)} tx/s; without group commit ${fmt(single, 0)} tx/s)`);
console.log(JSON.stringify({ concurrency: conc, seconds, results: { "group-commit tx/s": grouped, "single-write tx/s": single } }, null, 2));
