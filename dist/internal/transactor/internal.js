export const INTERNAL_HEADER = "x-ramose-internal";
export function internalHeaders(env) {
    const secret = env.RAMOSE_INTERNAL_SECRET;
    return secret ? { [INTERNAL_HEADER]: secret } : {};
}
function same(a, b) {
    if (a.length !== b.length)
        return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++)
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}
export function isInternal(env, request) {
    const secret = env.RAMOSE_INTERNAL_SECRET;
    if (!secret)
        return false;
    return same(request.headers.get(INTERNAL_HEADER) ?? "", secret);
}
export function internalGate(env, request) {
    if (isInternal(env, request))
        return undefined;
    return new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
    });
}
//# sourceMappingURL=internal.js.map