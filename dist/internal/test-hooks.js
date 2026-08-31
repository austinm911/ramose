export const TEST_HOOKS_ENV_KEY = "RAMOSE_TEST_HOOKS";
export const MAX_CHECKPOINT_RELEASE_DELAY_MS = 30_000;
export const isCheckpointReleaseDelay = (value) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 &&
    value <= MAX_CHECKPOINT_RELEASE_DELAY_MS;
const arms = new Map();
let enabled = false;
export const testHooksEnabled = (env) => {
    if (env?.RAMOSE_STAGE === "prod")
        return false;
    return env?.RAMOSE_TEST_HOOKS === "1";
};
export const enableTestHooks = () => {
    enabled = true;
};
export const testHooksArmed = () => enabled;
export const resetTestHooks = () => {
    enabled = false;
    for (const arm of arms.values()) {
        if (arm.timer !== undefined)
            clearTimeout(arm.timer);
    }
    arms.clear();
};
export const armCheckpointThrow = (name, options = {}) => {
    enableTestHooks();
    arms.set(name, {
        action: "throw",
        error: options.error,
        errorName: options.errorName,
        remaining: options.times ?? 1,
        pending: false,
    });
};
const checkpointFailure = (name, arm) => {
    const message = arm.error ?? `test checkpoint ${name}`;
    return arm.errorName === undefined
        ? new Error(message)
        : new DOMException(message, arm.errorName);
};
export const armCheckpoint = (name, action, error, releaseAfterMs) => {
    enableTestHooks();
    if (action === "wait") {
        if (releaseAfterMs !== undefined && !isCheckpointReleaseDelay(releaseAfterMs)) {
            throw new RangeError(`checkpoint releaseAfterMs must be between 0 and ${MAX_CHECKPOINT_RELEASE_DELAY_MS}`);
        }
        arms.set(name, {
            action,
            error,
            remaining: 1,
            ...(releaseAfterMs === undefined ? {} : { releaseAfterMs }),
            pending: false,
        });
        return;
    }
    armCheckpointThrow(name, { error });
};
export const releaseCheckpoint = (name) => {
    const arm = arms.get(name);
    if (arm?.timer !== undefined)
        clearTimeout(arm.timer);
    arm?.release?.();
    arms.delete(name);
};
export const checkpointStatus = () => {
    const out = {};
    for (const [name, arm] of arms) {
        out[name] = {
            action: arm.action,
            ...(arm.error !== undefined ? { error: arm.error } : {}),
            pending: arm.pending,
        };
    }
    return out;
};
export const checkpointReached = (name) => {
    if (!enabled)
        return;
    const arm = arms.get(name);
    if (arm !== undefined)
        arm.pending = true;
};
export const checkpoint = async (name) => {
    if (!enabled)
        return;
    const arm = arms.get(name);
    if (arm === undefined)
        return;
    if (arm.action === "throw") {
        arm.remaining--;
        if (arm.remaining <= 0)
            arms.delete(name);
        throw checkpointFailure(name, arm);
    }
    if (arm.action === "wait") {
        arm.pending = true;
        if (arm.wait === undefined) {
            arm.wait = new Promise((resolve) => {
                arm.release = resolve;
            });
        }
        if (arm.releaseAfterMs !== undefined) {
            arm.timer = setTimeout(() => releaseCheckpoint(name), arm.releaseAfterMs);
        }
        await arm.wait;
    }
};
export const checkpointSync = (name) => {
    if (!enabled)
        return;
    const arm = arms.get(name);
    if (arm?.action !== "throw")
        return;
    arm.remaining--;
    if (arm.remaining <= 0)
        arms.delete(name);
    throw checkpointFailure(name, arm);
};
export const testRuntimeBoundaries = Object.freeze({
    checkpoint,
    checkpointSync,
    checkpointReached,
    checkpointCancel: releaseCheckpoint,
});
const json = (body, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
});
export const handleIsolateTestAdmin = async (request, path, abort, inspect) => {
    if (!path.startsWith("/admin/test/"))
        return undefined;
    enableTestHooks();
    if (path === "/admin/test/abort" && request.method === "POST") {
        resetTestHooks();
        if (abort !== undefined)
            queueMicrotask(() => abort("test abort"));
        return json({ ok: true, aborted: true });
    }
    if (path === "/admin/test/checkpoint" && request.method === "POST") {
        const body = (await request.json());
        const action = typeof body.action === "string" ? body.action : "";
        const name = typeof body.name === "string" ? body.name : "";
        if (action === "status")
            return json({ ok: true, checkpoints: checkpointStatus() });
        if (name.length === 0) {
            return json({ error: "checkpoint needs name" }, 400);
        }
        if (action === "arm-wait") {
            const releaseAfterMs = body.releaseAfterMs;
            if (releaseAfterMs !== undefined &&
                !isCheckpointReleaseDelay(releaseAfterMs)) {
                return json({
                    error: `checkpoint releaseAfterMs must be between 0 and ${MAX_CHECKPOINT_RELEASE_DELAY_MS}`,
                }, 400);
            }
            armCheckpoint(name, "wait", undefined, releaseAfterMs);
            return json({ ok: true, name, action: "wait" });
        }
        if (action === "arm-throw") {
            armCheckpoint(name, "throw", typeof body.error === "string" ? body.error : undefined);
            return json({ ok: true, name, action: "throw" });
        }
        if (action === "release") {
            releaseCheckpoint(name);
            return json({ ok: true, name, action: "release" });
        }
        return json({ error: "checkpoint action must be arm-wait|arm-throw|release|status" }, 400);
    }
    if (path === "/admin/test/operation-receipts" &&
        request.method === "POST" && inspect !== undefined) {
        return json({ count: inspect.operationReceiptCount() });
    }
    return json({ error: "unknown test admin path" }, 404);
};
//# sourceMappingURL=test-hooks.js.map