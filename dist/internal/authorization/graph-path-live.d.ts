import * as Stream from "effect/Stream";
import { Unauthorized } from "../../db/Errors.ts";
import { type ExecuteAuthorizedGraphPathInput, type GraphPathLeaseDependency, type GraphPathLeaseIdentity } from "./graph-path.ts";
import { type AuthorizedLiveControls, type LiveQueryDiff } from "./live.ts";
import type { OneShotRead, OneShotReadError, OneShotReadOptions } from "./reads.ts";
export type AuthorizedGraphPathLiveInput<R = never, EDb = unknown, EProvision = unknown> = ExecuteAuthorizedGraphPathInput<R, EDb, EProvision> & Omit<AuthorizedLiveControls<R>, "invalidations"> & {
    readonly expectedLeaseIdentity: GraphPathLeaseIdentity;
    readonly dependencyInvalidations?: Stream.Stream<GraphPathLeaseDependency, Unauthorized, R>;
};
export declare const executeAuthorizedGraphPathLive: <R, EDb = unknown, EProvision = unknown>(input: AuthorizedGraphPathLiveInput<R, EDb, EProvision>, read: OneShotRead, opts?: OneShotReadOptions) => Stream.Stream<LiveQueryDiff, Unauthorized | OneShotReadError | EDb | EProvision, R>;
//# sourceMappingURL=graph-path-live.d.ts.map