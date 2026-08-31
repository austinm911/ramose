import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import { Unauthorized } from "../../db/Errors.js";
import { graphPathLeaseDependsOn, graphPathLeaseIdentity, opaqueGraphPathDenial, resolveAuthorizedGraphPath, sameGraphPathLeaseIdentity, } from "./graph-path.js";
import { executeAuthorizedLiveLease, } from "./live.js";
const deny = () => new Unauthorized({ status: 403 });
export const executeAuthorizedGraphPathLive = (input, read, opts = {}) => {
    const invalidations = input.dependencyInvalidations?.pipe(Stream.filter((dependency) => graphPathLeaseDependsOn(input.expectedLeaseIdentity, dependency)));
    return executeAuthorizedLiveLease({
        ...input,
        reauthorizeOnIdle: true,
        ...(invalidations === undefined ? {} : { invalidations }),
        authorize: (caller) => resolveAuthorizedGraphPath(input, caller).pipe(Effect.mapError(opaqueGraphPathDenial), Effect.flatMap((target) => sameGraphPathLeaseIdentity(input.expectedLeaseIdentity, graphPathLeaseIdentity(target, input.path))
            ? Effect.succeed(target.context.filteredDb)
            : Effect.fail(deny()))),
    }, read, opts);
};
//# sourceMappingURL=graph-path-live.js.map