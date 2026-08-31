export const MAX_TRAVERSAL_DEPTH = 3;
export const DEFAULT_AUTHORIZATION_BUDGET = 10_000;
export const MAX_READ_LEASE_MS = 5_000;
export const MAX_JSON_DEPTH = 64;
export const MAX_COLLECTION_SIZE = 1_024;
export const MAX_STRING_LENGTH = 4_096;
export const MAX_JSON_NODES = 4_096;
export const MAX_JSON_ENCODED_BYTES = 65_536;
/**
 * The same ceilings for a deployed catalog unit.
 *
 * `MAX_JSON_NODES` and `MAX_JSON_ENCODED_BYTES` bound documents that arrive over
 * the wire — an operation's input, a remote JWKS — where the sender is not
 * trusted and 4k nodes is already generous. A catalog unit is not that: it is
 * the encoded form of a schema the application compiled and shipped, and its
 * size is set by how many entities and operations that application declares.
 *
 * Charging it against the wire ceiling made schema size a security limit. A
 * schema of nine entities and five operations encodes to roughly 4.7k nodes and
 * could not deploy, while sitting at 47% of the byte ceiling — the two were
 * never calibrated for the same kind of document. These are sized so that no
 * plausible schema reaches them and a runaway or tampered unit is still refused.
 */
export const MAX_CATALOG_JSON_NODES = 262_144;
export const MAX_CATALOG_JSON_ENCODED_BYTES = 4_194_304;
//# sourceMappingURL=bounds.js.map