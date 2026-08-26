import { type Read, type ReadOptions } from "./read.ts";
export declare const useOneShot: <A, E>(run: () => Promise<A>, basis: () => number | undefined, deps: readonly unknown[], options?: ReadOptions<A> & {
    readonly suspendKey?: string;
}) => Read<A, E>;
//# sourceMappingURL=useOneShot.d.ts.map