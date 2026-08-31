import { localDigest } from "./digest.js";
const ROOT_DOMAIN = "ramose:replication:route-slot:root:v1";
const LINEAGE_DOMAIN = "ramose:replication:route-slot:lineage:v1";
const PROVISIONAL_DOMAIN = "ramose:replication:route-slot:provisional-path:v1";
const SCOPE_DOMAIN = "ramose:replication:route-scope:v1";
const PATH_DOMAIN = "ramose:replication:route-path:v1";
export const rootReplicaRouteSlot = () => localDigest({ domain: ROOT_DOMAIN });
export const stableReplicaRouteSlot = async (lineage) => {
    let slot = await rootReplicaRouteSlot();
    for (const entity of lineage) {
        slot = await localDigest({ domain: LINEAGE_DOMAIN, parent: slot, entity });
    }
    return slot;
};
export const provisionalReplicaRouteSlot = (graphPath) => localDigest({ domain: PROVISIONAL_DOMAIN, graphPath });
export const replicaRouteScope = (scope) => localDigest({ domain: SCOPE_DOMAIN, origin: scope.origin, root: scope.root });
export const replicaRoutePathKey = (graphPath) => localDigest({ domain: PATH_DOMAIN, graphPath });
export const replicaRouteSlotFor = (input) => {
    if (input.lineage !== undefined) {
        if (input.lineage.length !== input.graphPath.length) {
            throw new Error("graph lineage does not describe every path segment");
        }
        return stableReplicaRouteSlot(input.lineage);
    }
    return input.graphPath.length === 0
        ? rootReplicaRouteSlot()
        : provisionalReplicaRouteSlot(input.graphPath);
};
//# sourceMappingURL=route-slot.js.map