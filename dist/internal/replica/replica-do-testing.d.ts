import { DurableObject } from "cloudflare:workers";
import type { RuntimeBoundaries } from "../runtime-boundaries.ts";
import { type RamoseEnv } from "../transactor/index.ts";
export interface ReplicaTesting {
    readonly boundaries: RuntimeBoundaries;
    readonly enabled: (env: RamoseEnv) => boolean;
    readonly reset: () => void;
    readonly handleAdmin: (request: Request, path: string, abort: (reason: string) => void) => Promise<Response | undefined>;
}
export declare const createTestingQueryReplicaDO: (testing: ReplicaTesting) => (new (ctx: DurableObjectState, env: RamoseEnv) => DurableObject<RamoseEnv>);
//# sourceMappingURL=replica-do-testing.d.ts.map