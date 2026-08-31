import * as Data from "effect/Data";
export const SERVER_IDENTITY_ROOT_VERSION = 1;
export const SERVER_IDENTITY_KEY_ID = /^[A-Za-z0-9_-]{22}$/;
const SERVER_IDENTITY_KEY_MATERIAL = /^[A-Za-z0-9_-]{43}$/;
export class ServerIdentityUnavailable extends Data.TaggedError("ServerIdentityUnavailable") {
}
export class ServerIdentityIncompatible extends Data.TaggedError("ServerIdentityIncompatible") {
}
export const base64Url = (bytes) => {
    let binary = "";
    for (const byte of bytes)
        binary += String.fromCharCode(byte);
    return btoa(binary)
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replace(/=+$/, "");
};
const randomBase64Url = (byteLength) => {
    const bytes = new Uint8Array(byteLength);
    crypto.getRandomValues(bytes);
    return base64Url(bytes);
};
export const generateServerIdentityRoot = (createdAt) => Object.freeze({
    version: SERVER_IDENTITY_ROOT_VERSION,
    keyId: randomBase64Url(16),
    key: randomBase64Url(32),
    createdAt,
});
export const decodeServerIdentityRoot = (value) => {
    if (typeof value !== "object" || value === null)
        return undefined;
    const record = value;
    if (record.version !== SERVER_IDENTITY_ROOT_VERSION)
        return undefined;
    if (typeof record.keyId !== "string" ||
        !SERVER_IDENTITY_KEY_ID.test(record.keyId))
        return undefined;
    if (typeof record.key !== "string" ||
        !SERVER_IDENTITY_KEY_MATERIAL.test(record.key))
        return undefined;
    if (typeof record.createdAt !== "number" ||
        !Number.isSafeInteger(record.createdAt) ||
        record.createdAt < 0)
        return undefined;
    return Object.freeze({
        version: SERVER_IDENTITY_ROOT_VERSION,
        keyId: record.keyId,
        key: record.key,
        createdAt: record.createdAt,
    });
};
export const readServerIdentityRootRecord = (stored) => {
    if (stored === undefined)
        return { type: "absent" };
    const root = decodeServerIdentityRoot(stored);
    return root === undefined ? { type: "unreadable" } : { type: "existing", root };
};
export const sealingKeyOf = (root) => Object.freeze({ keyId: root.keyId, material: root.key });
export const decideServerIdentityBinding = (persistedKeyId, currentKeyId) => {
    if (persistedKeyId === undefined)
        return { type: "adopt" };
    if (persistedKeyId === currentKeyId)
        return { type: "compatible" };
    return { type: "incompatible", persisted: persistedKeyId };
};
export const SERVER_IDENTITY_INCOMPATIBLE = "server-identity-incompatible";
export const SERVER_IDENTITY_UNREADABLE = "server-identity-unreadable";
//# sourceMappingURL=server-identity.js.map