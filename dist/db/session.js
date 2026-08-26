/**
 * @internal One reconnecting WebSocket to `GET /db/:name/session`.
 *
 * The client speaks exactly one socket route (`GET /db/:name/session`). The
 * Worker verifies the caller and upgrades onto the replica that session
 * already queries — no Durable Object is reachable or nameable from here.
 * Reads (`q`, `pull`) and unsolicited `{ op: "tx" }` / `{ op: "resync" }`
 * frames ride it. A visible commit is one frame: `{ op: "tx", t, datoms }`
 * — that `t` is the basis bump, same as a read reply. Writes never ride
 * the socket (`transact` is HTTPS, so `processTx` is untouched).
 *
 * Unlike the socket this replaces, a drop is **not** terminal. The socket is
 * opened lazily by the first read, and after a close / error the next request
 * opens a fresh one — re-reading the token, because a token is
 * `Effect<Redacted<string>>` and is re-read on every (re)connect. A standing
 * `db.live` therefore survives the network: it is woken by
 * {@link Session.onWake} on paint (`nudge`) and on a drop, and its next
 * pass reconnects.
 *
 * `Unauthorized` is handled in place: the frame's 401/403 makes the session
 * re-read the token, send `{ op: "auth", token }` on the *same* socket, and
 * re-issue the frame once. Nothing standing is torn down by that swap — which
 * is the whole point of the peer having an `auth` op.
 *
 * A handshake that never opens is different. The browser (and this
 * `WebSocketLike` seam) hide the upgrade's HTTP status, so a close/error
 * before `open` would otherwise become `SocketGone` → `NetworkError`. When
 * {@link SessionOptions.classifyHandshake} is set, the session asks it with
 * the handshake's token before surfacing that; a 401/403 probe becomes the
 * same tagged `Unauthorized` the HTTP path uses. True transport failures
 * stay `SocketGone`.
 */
import * as Redacted from "effect/Redacted";
import { trimSlashes } from "./http.js";
/** The ambient `WebSocket`, if this runtime has one. */
export const globalWebSocket = () => typeof WebSocket === "undefined"
    ? undefined
    : (url) => new WebSocket(url);
/** The ack's / `/info` `principal` field, parsed; `undefined` when the peer sent none. */
export const parsePrincipal = (raw) => {
    if (typeof raw !== "object" || raw === null)
        return undefined;
    const p = raw;
    if (typeof p.class !== "string")
        return undefined;
    return { eid: typeof p.eid === "number" ? p.eid : null, class: p.class };
};
const STATUS_RANK = {
    live: 0,
    connecting: 1,
    reconnecting: 2,
    offline: 3,
    closed: 4,
};
/** The more concerning of two statuses — used to roll up a multi-db client. */
export const worseConnection = (a, b) => (STATUS_RANK[a] >= STATUS_RANK[b] ? a : b);
/** Browser network is gone. Absent `navigator` (Node, Workers) is online. */
export const browserOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;
const OPEN = 1;
const tokenValue = (token) => {
    if (token === undefined)
        return undefined;
    const value = Redacted.value(token);
    return value.length > 0 ? value : undefined;
};
/** `https://peer/…` → `wss://peer/db/:name/session[?token=…]`. */
export const sessionUrl = (url, name, token) => `${trimSlashes(url).replace(/^http/, "ws")}/db/${encodeURIComponent(name)}/session${token === undefined ? "" : `?token=${encodeURIComponent(token)}`}`;
const asRecord = (value) => (typeof value === "object" && value !== null ? value : {});
/** The transport failure a socket that went away produces. */
export class SocketGone extends Error {
}
export const openSession = (options) => {
    const pending = new Map();
    const wakers = new Set();
    const pushers = new Set();
    let socket;
    let opening;
    let nextId = 1;
    let basisT = 0;
    let epoch = 0;
    let generation = 0;
    let connects = 0;
    let closed = false;
    let opened = false;
    let everOpened = false;
    let principal;
    const statusOf = () => {
        if (closed)
            return "closed";
        if (opened)
            return "live";
        if (!everOpened)
            return "connecting";
        return "reconnecting";
    };
    const wake = () => {
        // copy: a waker may unsubscribe itself while being notified
        for (const cb of [...wakers])
            cb();
    };
    const bump = (value) => {
        if (typeof value !== "number" || !Number.isFinite(value))
            return;
        if (value <= basisT)
            return;
        basisT = value;
        wake();
    };
    const nudge = () => {
        epoch += 1;
        wake();
    };
    const pushFrame = (frame) => {
        const cbs = [...pushers];
        if (options.onPush !== undefined)
            cbs.unshift(options.onPush);
        for (const cb of cbs)
            void cb(frame);
    };
    /** This socket is gone. Everything waiting on it fails; the next request reopens. */
    const drop = (message) => {
        if (socket === undefined && pending.size === 0)
            return;
        socket = undefined;
        opened = false;
        principal = undefined; // the next socket authenticates afresh on its upgrade
        const waiting = [...pending.values()];
        pending.clear();
        for (const p of waiting)
            p.reject(new SocketGone(message));
        generation += 1;
        wake();
    };
    const onMessage = (ev) => {
        const data = typeof ev?.data === "string" ? ev.data : undefined;
        if (data === undefined)
            return;
        let frame;
        try {
            frame = asRecord(JSON.parse(data));
        }
        catch {
            return;
        }
        if (typeof frame.id === "number") {
            const p = pending.get(frame.id);
            if (p === undefined)
                return;
            pending.delete(frame.id);
            bump(asRecord(frame.body).t);
            // an `auth` ack is `{ id, ok: true, principal? }` — no status, and not a
            // refusal; the principal it names supersedes anything read before it
            if (frame.ok === true) {
                const who = parsePrincipal(frame.principal);
                if (who !== undefined)
                    principal = who;
            }
            p.resolve({
                status: typeof frame.status === "number" ? frame.status : 200,
                body: frame.body,
                headers: frame.headers,
            });
            return;
        }
        // One unsolicited op per visible commit: `{ op: tx, t, datoms }` bumps
        // the basis. Overlay apply is the notify (`handlePush` paints then
        // `onChange`); live does not treat this bump as a wake.
        if (frame.op === "tx" || frame.op === "resync") {
            bump(frame.t);
            pushFrame(frame);
        }
    };
    const connect = () => {
        if (closed) {
            return Promise.reject(new SocketGone("ramose: the client is closed"));
        }
        if (socket !== undefined)
            return Promise.resolve();
        if (opening !== undefined)
            return opening;
        const started = (async () => {
            // the token is re-read here: every (re)connect authenticates afresh
            const token = tokenValue(options.token === undefined ? undefined : await options.token());
            const target = sessionUrl(await options.url(), options.name, token);
            // a close that landed while the token/url resolved wins: a socket
            // opened for a closed session would leak, because `close()` has no
            // handle on it yet
            if (closed)
                throw new SocketGone("ramose: the client is closed");
            const ws = options.connect(target);
            connects += 1;
            let settle;
            const handshake = new Promise((resolve, reject) => {
                settle = (e) => (e === undefined ? resolve() : reject(e));
            });
            let didOpen = false;
            const markOpen = () => {
                didOpen = true;
                opened = true;
                everOpened = true;
                settle();
                wake();
            };
            ws.addEventListener("open", markOpen);
            ws.addEventListener("close", () => {
                settle(new SocketGone("ramose: session socket closed"));
                if (socket === ws)
                    drop("ramose: session socket closed");
            });
            ws.addEventListener("error", () => {
                settle(new SocketGone("ramose: session socket failed"));
                if (socket === ws)
                    drop("ramose: session socket failed");
            });
            ws.addEventListener("message", onMessage);
            socket = ws;
            generation += 1;
            if (ws.readyState === undefined || ws.readyState === OPEN) {
                markOpen();
            }
            try {
                await handshake;
            }
            catch (cause) {
                // the browser socket API does not expose the upgrade status; a
                // probe can recover 401/403. Do not invent a status when it cannot.
                if (!didOpen && !closed && options.classifyHandshake !== undefined) {
                    const classified = await options.classifyHandshake(token);
                    if (classified !== undefined)
                        throw classified;
                }
                throw cause;
            }
        })();
        const tracked = started.finally(() => {
            if (opening === tracked)
                opening = undefined;
        });
        opening = tracked;
        return tracked;
    };
    const dispatch = (frame) => {
        const ws = socket;
        if (ws === undefined) {
            return Promise.reject(new SocketGone("ramose: session socket closed"));
        }
        const id = nextId++;
        return new Promise((resolve, reject) => {
            pending.set(id, { resolve, reject });
            try {
                ws.send(JSON.stringify({ id, ...frame }));
            }
            catch (cause) {
                pending.delete(id);
                reject(new SocketGone(String(cause)));
            }
        });
    };
    /** 401/403: re-read the token, swap the principal in place, re-issue once. */
    const reauth = async () => {
        if (options.token === undefined)
            return false;
        const token = tokenValue(await options.token());
        const ack = await dispatch({ op: "auth", token: token ?? "" });
        return ack.status < 400;
    };
    const request = async (frame) => {
        await connect();
        const reply = await dispatch(frame);
        if (reply.status !== 401 && reply.status !== 403)
            return reply;
        return (await reauth()) ? dispatch(frame) : reply;
    };
    return {
        request,
        get t() {
            return basisT;
        },
        get epoch() {
            return epoch;
        },
        get generation() {
            return generation;
        },
        get principal() {
            return principal;
        },
        get connects() {
            return connects;
        },
        get closed() {
            return closed;
        },
        get status() {
            return statusOf();
        },
        bump: (t) => bump(t),
        nudge,
        onWake: (cb) => {
            wakers.add(cb);
            return () => {
                wakers.delete(cb);
            };
        },
        onPush: (cb) => {
            pushers.add(cb);
            return () => {
                pushers.delete(cb);
            };
        },
        close: () => {
            if (closed)
                return;
            closed = true;
            const ws = socket;
            drop("ramose: the client is closed");
            generation += 1;
            wake();
            try {
                ws?.close();
            }
            catch {
                // closing a socket that never opened is not an error worth raising
            }
        },
    };
};
//# sourceMappingURL=session.js.map