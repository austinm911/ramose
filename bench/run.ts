/**
 * Run all in-process benches (M1 + M2) in sequence:  bun run bench/run.ts
 * Individual: bun run bench/seek.bench.ts | bench/join.bench.ts | bench/write.bench.ts
 */
import { $ } from "bun";

const here = import.meta.dir;
for (const f of ["seek.bench.ts", "join.bench.ts", "write.bench.ts", "transactor.bench.ts"]) {
  console.log(`\n=== ${f} ===`);
  await $`bun run ${here}/${f}`;
}
