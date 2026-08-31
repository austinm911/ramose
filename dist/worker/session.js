import { WRITES_HEADER } from "../writes.js";
export { WRITES_HEADER };
export const META_HEADERS = [
    "x-ramose-ms",
    "x-ramose-r2-gets",
    "x-ramose-cache-hits",
    "x-ramose-basis-t",
    "x-ramose-basis-hit",
    "x-ramose-basis-reason",
    "x-ramose-basis-calls",
    "x-ramose-basis-behind",
    "x-ramose-replica-hint",
    "x-ramose-cache-basis",
    "x-ramose-cache-mode",
    "x-ramose-colo",
];
export const PRINCIPAL_HEADER = "x-ramose-principal";
export const TEST_SESSION_TOKEN_HEADER = "x-ramose-test-session-token";
const JSON_CT = { "content-type": "application/json" };
const minTHeader = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 ? { "x-ramose-min-t": String(v) } : {};
const isPlanError = (p) => p.error !== undefined;
export const sessionPrincipalExpired = (principal, nowMs = Date.now()) => principal.claims.exp !== undefined && principal.claims.exp * 1000 <= nowMs;
export function planOf(frame) {
    if (typeof frame !== "object" || frame === null || Array.isArray(frame))
        return { id: undefined, error: "frame must be an object" };
    const f = frame;
    if (typeof f.id !== "number" || !Number.isFinite(f.id))
        return { id: undefined, error: "frame.id must be a number" };
    const id = f.id;
    switch (f.op) {
        case "transact": {
            if (!Array.isArray(f.tx))
                return { id, error: "transact frame needs tx: unknown[]" };
            const body = { tx: f.tx };
            if (typeof f.clientTxId === "string" && f.clientTxId.length > 0)
                body.clientTxId = f.clientTxId;
            return { id, op: "transact", rest: "/transact", method: "POST", headers: { ...JSON_CT }, body: JSON.stringify(body) };
        }
        case "operation": {
            if (typeof f.name !== "string" || f.name.length === 0)
                return { id, error: "operation frame needs name" };
            const body = { name: f.name, input: f.input };
            if (f.entity !== undefined)
                body.entity = f.entity;
            if (typeof f.clientOpId === "string" && f.clientOpId.length > 0)
                body.clientOpId = f.clientOpId;
            return { id, op: "operation", rest: "/op", method: "POST", headers: { ...JSON_CT }, body: JSON.stringify(body) };
        }
        case "q": {
            if (f.query === undefined || f.query === null)
                return { id, error: "q frame needs query" };
            if (f.inputs !== undefined && !Array.isArray(f.inputs))
                return { id, error: "q frame inputs must be an array" };
            const body = { query: f.query };
            if (f.inputs !== undefined)
                body.inputs = f.inputs;
            if (typeof f.asOf === "number")
                body.asOf = f.asOf;
            if (f.history !== undefined)
                body.history = !!f.history;
            if (f.explain !== undefined)
                body.explain = !!f.explain;
            return { id, op: "q", rest: "/query", method: "POST", headers: { ...JSON_CT, ...minTHeader(f.minT) }, body: JSON.stringify(body) };
        }
        case "pull": {
            if (f.eid === undefined || f.eid === null)
                return { id, error: "pull frame needs eid" };
            if (f.pattern === undefined || f.pattern === null)
                return { id, error: "pull frame needs pattern" };
            const body = { eid: f.eid, pattern: f.pattern };
            if (typeof f.asOf === "number")
                body.asOf = f.asOf;
            if (f.history !== undefined)
                body.history = !!f.history;
            return { id, op: "pull", rest: "/pull", method: "POST", headers: { ...JSON_CT, ...minTHeader(f.minT) }, body: JSON.stringify(body) };
        }
        case "entity": {
            if (typeof f.eid !== "number" || !Number.isInteger(f.eid) || f.eid < 0)
                return { id, error: "entity frame needs eid: number" };
            const asOf = typeof f.asOf === "number" ? `?asOf=${encodeURIComponent(String(f.asOf))}` : "";
            return { id, op: "entity", rest: `/entity/${f.eid}${asOf}`, method: "GET", headers: {} };
        }
        case "info":
            return { id, op: "info", rest: "/info", method: "GET", headers: {} };
        default:
            return { id, error: `unknown op: ${typeof f.op === "string" ? f.op : String(f.op)}` };
    }
}
export function parsePrincipalHeader(raw) {
    if (raw === null || raw === "")
        return undefined;
    try {
        const p = JSON.parse(raw);
        if (typeof p !== "object" || p === null || p.kind !== "user" || typeof p.class !== "string")
            return undefined;
        return p;
    }
    catch {
        return undefined;
    }
}
export function openSession(socket, options) {
    const seed = options.seed;
    let lastT = seed?.lastT ?? 0;
    let watermark = seed?.watermark ?? 0;
    let dead = false;
    let principal = seed?.principal ?? options.principal;
    let writerEcho = seed?.writerEcho;
    let expiring = false;
    let resolveClosed;
    const closed = new Promise((resolve) => {
        resolveClosed = resolve;
    });
    const die = () => {
        if (dead)
            return;
        dead = true;
        resolveClosed();
    };
    const shutdown = () => {
        const wasDead = dead;
        die();
        if (!wasDead)
            socket.close(1008, "unauthorized");
    };
    const send = (frame) => {
        if (dead)
            return;
        try {
            socket.send(JSON.stringify(frame));
        }
        catch {
            die();
            try {
                socket.close(1011, "session send failed");
            }
            catch {
            }
        }
    };
    const seenT = (t) => {
        if (typeof t === "number" && Number.isFinite(t) && t > lastT)
            lastT = t;
    };
    const pushResync = async (t) => {
        if (options.snapshot) {
            const snap = await options.snapshot(principal);
            send({ op: "resync", t: snap.t, datoms: snap.datoms });
            seenT(snap.t);
            watermark = snap.t;
            return;
        }
        send({ op: "resync", t });
        seenT(t);
        watermark = t;
    };
    const consider = async (log, from) => {
        if (dead)
            return;
        if (from < log.rootT) {
            await pushResync(log.t);
            return;
        }
        const filter = options.filterEntry;
        if (!filter) {
            for (const e of log.entries) {
                if (e.t <= from)
                    continue;
                if (e.t > from + 1 && e.t > log.rootT) {
                    if (options.snapshot)
                        await pushResync(log.t);
                    return;
                }
                watermark = e.t;
                send({ op: "tx", t: e.t, datoms: e.datoms });
                seenT(e.t);
                from = e.t;
            }
            return;
        }
        const pending = log.entries.filter((e) => e.t > from).sort((a, b) => a.t - b.t);
        let cursor = from;
        const torn = async () => {
            if (options.snapshot)
                await pushResync(log.t);
        };
        for (const e of pending) {
            if (e.t > cursor + 1) {
                await torn();
                return;
            }
            const decision = await filter(e, principal);
            if (decision.kind === "skip") {
                cursor = e.t;
                watermark = e.t;
                continue;
            }
            if (decision.kind === "resync") {
                await pushResync(e.t);
                return;
            }
            if (decision.datoms === undefined)
                throw new Error("session filter returned tx without datoms");
            cursor = e.t;
            watermark = e.t;
            const echo = writerEcho !== undefined && writerEcho.t === e.t ? writerEcho.clientTxId : undefined;
            if (echo !== undefined)
                writerEcho = undefined;
            send({
                op: "tx",
                t: e.t,
                datoms: decision.datoms,
                ...(echo !== undefined ? { clientTxId: echo } : {}),
            });
            seenT(e.t);
        }
        if (cursor < log.t)
            await torn();
    };
    const failSieve = () => {
        if (dead)
            return;
        die();
        try {
            socket.close(1011, "session filter failed");
        }
        catch {
        }
    };
    let considering = Promise.resolve();
    const enqueueConsider = (log) => {
        const run = considering.then(() => consider(log, watermark));
        considering = run.catch(() => undefined);
        return run;
    };
    const applyEntry = (entry, rootT) => enqueueConsider({ t: entry.t, rootT, entries: [entry] }).catch((err) => {
        failSieve();
        throw err;
    });
    const refresh = async (f) => {
        const id = typeof f.id === "number" && Number.isFinite(f.id) ? f.id : 0;
        if (!options.authenticate) {
            send({ id, status: 400, body: { error: "this session cannot re-authenticate" } });
            return;
        }
        try {
            principal = await options.authenticate(typeof f.token === "string" ? f.token : "");
            if (options.provision !== undefined) {
                try {
                    principal = await options.provision(principal);
                }
                catch {
                }
            }
            let who;
            if (options.describe !== undefined) {
                try {
                    who = await options.describe(principal);
                }
                catch {
                    who = { eid: null, class: principal.class };
                }
            }
            send({ id, ok: true, ...(who === undefined ? {} : { principal: who }) });
        }
        catch (err) {
            const e = err;
            send({ id, status: typeof e?.status === "number" ? e.status : 401, body: { error: e?.message || "unauthorized", ...(typeof e?.code === "string" ? { code: e.code } : {}) } });
        }
    };
    const onMessage = async (data) => {
        if (dead)
            return;
        let frame;
        try {
            frame = JSON.parse(typeof data === "string" ? data : new TextDecoder().decode(data));
        }
        catch {
            send({ id: 0, status: 400, body: { error: "frame must be JSON" } });
            return;
        }
        if (typeof frame === "object" && frame !== null && frame.op === "auth") {
            return refresh(frame);
        }
        if (typeof frame === "object" && frame !== null && frame.op === "sync") {
            const f = frame;
            const id = typeof f.id === "number" && Number.isFinite(f.id) ? f.id : 0;
            const from = typeof f.from === "number" && Number.isFinite(f.from) && f.from >= 0 ? f.from : 0;
            if (!options.readLog) {
                send({ id, status: 400, body: { error: "this session cannot sync a log" } });
                return;
            }
            try {
                const log = await options.readLog();
                watermark = from;
                await enqueueConsider(log);
                send({ id, status: 200, body: { t: watermark, from } });
            }
            catch (err) {
                send({ id, status: 500, body: { error: err instanceof Error ? err.message : String(err) } });
                failSieve();
            }
            return;
        }
        const plan = planOf(frame);
        if (isPlanError(plan)) {
            send({ id: plan.id ?? 0, status: 400, body: { error: plan.error } });
            return;
        }
        const bound = principal;
        if (bound !== undefined && sessionPrincipalExpired(bound)) {
            send({ id: plan.id, status: 401, body: { error: "token expired" } });
            if (!expiring) {
                expiring = true;
                setTimeout(shutdown, 0);
            }
            return;
        }
        let res;
        try {
            res = await options.dispatch(plan.rest, { method: plan.method, headers: plan.headers, ...(plan.body === undefined ? {} : { body: plan.body }) }, bound);
        }
        catch (err) {
            send({ id: plan.id, status: 500, body: { error: err instanceof Error ? err.message : String(err) } });
            return;
        }
        let body;
        try {
            const text = await res.text();
            try {
                body = JSON.parse(text);
            }
            catch {
                body = text;
            }
        }
        catch (err) {
            send({ id: plan.id, status: 500, body: { error: err instanceof Error ? err.message : String(err) } });
            return;
        }
        const headers = {};
        for (const h of META_HEADERS) {
            const v = res.headers.get(h);
            if (v !== null)
                headers[h] = v;
        }
        send({ id: plan.id, status: res.status, body, ...(Object.keys(headers).length > 0 ? { headers } : {}) });
        if ((plan.op === "transact" || plan.op === "operation") && res.ok) {
            const ack = body;
            const echoT = typeof ack?.t === "number" ? ack.t : undefined;
            let echoId = typeof ack?.clientTxId === "string" && ack.clientTxId.length > 0
                ? ack.clientTxId
                : typeof ack?.clientOpId === "string" && ack.clientOpId.length > 0
                    ? ack.clientOpId
                    : undefined;
            if (echoId === undefined && plan.body !== undefined) {
                try {
                    const req = JSON.parse(plan.body);
                    if (typeof req.clientTxId === "string" && req.clientTxId.length > 0)
                        echoId = req.clientTxId;
                    else if (typeof req.clientOpId === "string" && req.clientOpId.length > 0)
                        echoId = req.clientOpId;
                }
                catch {
                }
            }
            if (echoT !== undefined && echoId !== undefined)
                writerEcho = { t: echoT, clientTxId: echoId };
        }
    };
    if (options.listen !== false) {
        socket.addEventListener("message", (ev) => void onMessage(ev.data));
        socket.addEventListener("close", die);
        socket.addEventListener("error", die);
    }
    return {
        onMessage,
        applyEntry,
        close() {
            const wasDead = dead;
            die();
            if (!wasDead)
                socket.close();
        },
        get lastT() {
            return lastT;
        },
        get watermark() {
            return watermark;
        },
        get principal() {
            return principal;
        },
        state: () => ({
            ...(principal !== undefined ? { principal } : {}),
            lastT,
            watermark,
            ...(writerEcho !== undefined ? { writerEcho } : {}),
            ...(seed?.writes !== undefined ? { writes: seed.writes } : {}),
        }),
        closed,
    };
}
export async function pushApplied(sessions, entry, rootT) {
    for (const s of sessions)
        await s.applyEntry(entry, rootT);
}
//# sourceMappingURL=session.js.map