/**
 * Write bench for the client-held write WebSocket vs. the HTTP control.
 *
 *   RIPPLE_URL=http://localhost:8787 [RIPPLE_TOKEN=…] \
 *     bun run bench/write-ws.bench.ts <mode: http|ws> [concurrency=64] [seconds=10] [txsPerFrame=1]
 *
 * Same DB setup / schema / tx shape / metrics as bench/write-do.bench.ts.
 *   http  — control: one `POST /db/:name/transact` per tx (identical to write-do).
 *   ws    — one `db.writeSocket()` per worker; each frame carries `txsPerFrame` txs.
 *
 * Latency is measured per FRAME (a multi-tx frame's ack latency covers all of its
 * txs), so p50/p95/p99 are frame latencies — with txsPerFrame>1 the per-tx latency
 * is the same number, not frameLatency/N.
 */
import { RippleClient, attribute } from "../packages/client/src/index.ts";
import type { RippleWriteSocket, TxAck } from "../packages/client/src/index.ts";
import { fmt, percentile } from "./lib.ts";

const url = process.env.RIPPLE_URL;
if (!url) {
  console.error("set RIPPLE_URL");
  console.error("usage: RIPPLE_URL=… [RIPPLE_TOKEN=…] bun run bench/write-ws.bench.ts <mode: http|ws> [concurrency=64] [seconds=10] [txsPerFrame=1]");
  process.exit(1);
}
const mode = String(process.argv[2] ?? "http");
if (mode !== "http" && mode !== "ws") {
  console.error(`unknown mode ${mode} (expected http|ws)`);
  process.exit(1);
}
const conc = Number(process.argv[3] ?? 64);
const seconds = Number(process.argv[4] ?? 10);
const txsPerFrame = mode === "ws" ? Number(process.argv[5] ?? 1) : 1;

const client = new RippleClient(url, { token: process.env.RIPPLE_TOKEN });
const db = client.db(`bench-${Date.now().toString(36)}`);
await db.transact([attribute(":k/id", "long", { unique: "identity" }), attribute(":k/v", "string")]);

const BENCH_SLOW_MS = 2000;
const runStart = performance.now();

let done = 0; // txs acked
let frames = 0; // frames / requests acked
let errors = 0; // failed frames (a failed multi frame counts once)
let slowFrames = 0;
let pastDeadline = 0;
const lat: number[] = []; // per-frame ack latency, ms
const seenT = new Set<number>();
let minT = Number.POSITIVE_INFINITY;
let maxT = Number.NEGATIVE_INFINITY;

function recordT(t: number): void {
  if (typeof t !== "number" || !Number.isFinite(t)) return;
  seenT.add(t);
  if (t < minT) minT = t;
  if (t > maxT) maxT = t;
}

/** tMax ≪ maxTseen ⇒ committed on time, ack late ⇒ transport; tMax ≈ maxTseen ⇒ commit-loop/queue */
function noteFrame(worker: number, frame: number, sentAt: number, dt: number, tMin: number | undefined, tMaxFrame: number | undefined, pending: number): void {
  lat.push(dt);
  if (Date.now() >= deadline) pastDeadline++;
  if (dt <= BENCH_SLOW_MS) return;
  slowFrames++;
  console.error(
    `SLOW-FRAME worker=${worker} frame=${frame} at=+${(sentAt - runStart).toFixed(0)}ms lat=${dt.toFixed(0)} tMin=${tMin ?? "-"} tMax=${tMaxFrame ?? "-"} maxTseen=${Number.isFinite(maxT) ? maxT : "-"} pending=${pending}`,
  );
}

const tx = (id: number) => [{ ":k/id": id, ":k/v": "x" }];

const deadline = Date.now() + seconds * 1000;

async function httpWorker(id: number): Promise<void> {
  let i = 0;
  let frame = 0;
  while (Date.now() < deadline) {
    const t0 = performance.now();
    let tMin: number | undefined;
    let tMaxFrame: number | undefined;
    try {
      const ack = await db.transact(tx(id * 1_000_000 + i++));
      done++;
      recordT(ack.t);
      tMin = tMaxFrame = ack.t;
    } catch {
      errors++;
    }
    frames++;
    frame++;
    noteFrame(id, frame, t0, performance.now() - t0, tMin, tMaxFrame, 0);
  }
}

const sockets: RippleWriteSocket[] = [];

async function wsWorker(id: number): Promise<void> {
  const sock = db.writeSocket();
  sockets.push(sock);
  const readyT0 = performance.now();
  await sock.ready;
  const readyDt = performance.now() - readyT0;
  if (readyDt > BENCH_SLOW_MS) console.error(`SLOW-READY worker=${id} lat=${readyDt.toFixed(0)}`);
  let i = 0;
  let frame = 0;
  while (Date.now() < deadline) {
    const t0 = performance.now();
    let tMin: number | undefined;
    let tMaxFrame: number | undefined;
    try {
      if (txsPerFrame === 1) {
        const ack = await sock.transact(tx(id * 1_000_000 + i++));
        done++;
        recordT(ack.t);
        tMin = tMaxFrame = ack.t;
      } else {
        const batch = Array.from({ length: txsPerFrame }, () => tx(id * 1_000_000 + i++));
        const acks: TxAck[] = await sock.transactMany(batch);
        done += acks.length;
        for (const a of acks) {
          recordT(a.t);
          if (tMin === undefined || a.t < tMin) tMin = a.t;
          if (tMaxFrame === undefined || a.t > tMaxFrame) tMaxFrame = a.t;
        }
      }
    } catch {
      errors++;
    }
    frames++;
    frame++;
    noteFrame(id, frame, t0, performance.now() - t0, tMin, tMaxFrame, sock.pending);
  }
}

const t0 = performance.now();
await Promise.all(Array.from({ length: conc }, (_, i) => (mode === "ws" ? wsWorker(i) : httpWorker(i))));
const ms = performance.now() - t0;
for (const s of sockets) s.close();

lat.sort((a, b) => a - b);
const info = await db.info();
const expected = seenT.size === 0 ? 0 : maxT - minT + 1;
const gapFree = seenT.size > 0 && expected === seenT.size && seenT.size === done;

console.log(`mode=${mode} txsPerFrame=${txsPerFrame} concurrency=${conc}: ${done} tx in ${fmt(ms, 0)} ms → ${fmt((done / ms) * 1000, 0)} tx/s, errors=${errors}, frames=${frames}`);
console.log(`ack latency (per frame${txsPerFrame > 1 ? `, ${txsPerFrame} tx per frame — per-tx latency = frame latency` : ""}) p50 ${fmt(percentile(lat, 50))} ms  p95 ${fmt(percentile(lat, 95))} ms  p99 ${fmt(percentile(lat, 99))} ms`);
console.log(`transactor batches=${info.transactor?.stats?.batches} maxBatch=${info.transactor?.stats?.maxBatch} avgBatch=${fmt((info.transactor?.stats?.txs ?? 0) / Math.max(1, info.transactor?.stats?.batches ?? 1))}`);
console.log(`t range [${seenT.size ? minT : "-"}..${seenT.size ? maxT : "-"}] acked=${seenT.size} expected=${expected} gapFree=${gapFree}`);
console.log(`colo=${info.meta?.colo ?? "-"}  db=${db.name}`);
console.log(`slow frames=${slowFrames} maxFrameLat=${fmt(lat.length ? lat[lat.length - 1] : 0)} pastDeadline=${pastDeadline}`);
const m = info.transactor?.metrics;
console.log(`metrics batchLoopMs=${JSON.stringify(m?.batchLoopMs)} batchResolveMs=${JSON.stringify(m?.batchResolveMs)} batchCommitMs=${JSON.stringify(m?.batchCommitMs)} batchQueueWaitMs=${JSON.stringify(m?.batchQueueWaitMs)} gapMs=${JSON.stringify(m?.gapMs)} queueDepth=${m?.queueDepth}`);
console.log(`store r2Gets=${info.transactor?.store?.r2Gets} ${JSON.stringify(info.transactor?.store)}`);
console.log(`indexer runs=${info.transactor?.indexer?.runs} lastRun=${JSON.stringify(info.transactor?.indexer?.lastRun)}`);
