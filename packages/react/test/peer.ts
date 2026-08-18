/**
 * A minimal fake peer for the provider tests — a `WebSocket` factory that
 * records every socket and whether the client closed it, plus a recording
 * `fetch`. Just enough of the session protocol to answer a `q` frame
 * (`{ id, body: { t, root, result } }`), because a close is only observable
 * through a session socket, and a session only opens on the first read.
 *
 * The full-protocol fake lives in `packages/alchemy/test/peer.ts`; this one
 * stays local so the react package's tests do not reach into another
 * package's test tree.
 */

export interface FakeSocket {
  /** The handshake url — which peer, which database. */
  readonly url: string;
  /** `true` once the client closed it. */
  readonly closed: boolean;
}

export interface FakePeer {
  readonly fetch: typeof fetch;
  readonly webSocket: typeof WebSocket;
  /** Every socket handed out, oldest first. */
  readonly sockets: FakeSocket[];
  /** Every HTTPS request, as `"METHOD url"`. */
  readonly calls: string[];
}

export const fakePeer = (): FakePeer => {
  const sockets: FakeSocket[] = [];
  const calls: string[] = [];

  class Socket {
    readonly url: string;
    private readonly listeners = new Map<string, ((ev: unknown) => void)[]>();
    private dead = false;

    constructor(url: string) {
      this.url = url;
      // a real socket is CONNECTING until its open event
      queueMicrotask(() => {
        if (!this.dead) this.emit("open", {});
      });
    }

    readonly readyState = 0;

    get closed(): boolean {
      return this.dead;
    }

    private emit(type: string, ev: unknown): void {
      for (const cb of this.listeners.get(type) ?? []) cb(ev);
    }

    addEventListener(type: string, cb: (ev: unknown) => void): void {
      this.listeners.set(type, [...(this.listeners.get(type) ?? []), cb]);
    }

    send(data: string): void {
      if (this.dead) throw new Error("socket is closed");
      const frame = JSON.parse(data) as { id: number };
      queueMicrotask(() => {
        if (this.dead) return;
        this.emit("message", {
          data: JSON.stringify({
            id: frame.id,
            body: { t: 1, root: 1, result: [] },
          }),
        });
      });
    }

    close(): void {
      if (this.dead) return;
      this.dead = true;
      this.emit("close", {});
    }
  }

  function WebSocketImpl(this: unknown, url: string) {
    const socket = new Socket(url);
    sockets.push(socket);
    return socket;
  }

  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${String(url)}`);
    return new Response(
      JSON.stringify({ t: 1, txEid: 1, tempids: {}, datoms: 0 }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as unknown as typeof fetch;

  return {
    fetch: fetchImpl,
    webSocket: WebSocketImpl as unknown as typeof WebSocket,
    sockets,
    calls,
  };
};
