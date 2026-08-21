/**
 * Refresh must not wait on get-session or the first `useLive` emission.
 * A slug mounts the Provider / board tree immediately; `rows === undefined`
 * paints the shell, not `opening ${slug}`. `/` can still wait on session.
 */

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";

if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register();
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
afterAll(() => {
  if (GlobalRegistrator.isRegistered) GlobalRegistrator.unregister();
});

let liveRows: unknown = undefined;
let minted = 0;

mock.module("ramose/react", () => ({
  RamoseProvider: ({ children }: { children?: ReactNode }) =>
    createElement("div", { "data-ramose-provider": "" }, children),
  useDb: () => ({}),
  useLive: () => ({ rows: liveRows, error: undefined, ticks: 0 }),
  useTransact: () => ({ run: async () => {} }),
  useBasis: () => undefined,
  useQuery: () => ({ data: undefined }),
  usePull: () => ({ data: undefined, error: undefined, ticks: 0 }),
  errorMessage: (err: unknown) =>
    err instanceof Error ? err.message : String(err),
}));

type SessionUser = { id: string; name: string; email: string };
type SessionSnap = {
  isPending: boolean;
  data: { user: SessionUser } | null;
};

let sessionSnap: SessionSnap = { isPending: true, data: null };

const ada: SessionUser = { id: "ada", name: "Ada", email: "ada@reef.test" };

let render: typeof import("@testing-library/react").render;
let App: typeof import("../src/app/App.tsx").App;
let BoardScreen: typeof import("../src/app/screens/BoardScreen.tsx").BoardScreen;
let ToastProvider: typeof import("../src/app/ui.tsx").ToastProvider;
let RouteProvider: typeof import("../src/app/route.tsx").RouteProvider;
let mintWorkspace: typeof import("../src/app/ramose.ts").mintWorkspace;
let authClient: typeof import("../src/app/auth.ts").authClient;

beforeAll(async () => {
  ({ render } = await import("@testing-library/react"));
  ({ authClient } = await import("../src/app/auth.ts"));
  authClient.useSession = () =>
    ({
      data: sessionSnap.data,
      isPending: sessionSnap.isPending,
      error: null,
      isRefetching: false,
      refetch: () => {},
    }) as ReturnType<typeof authClient.useSession>;
  const origToken = authClient.ramose.token.bind(authClient.ramose);
  authClient.ramose.token = (async (args) => {
    minted += 1;
    return origToken(args);
  }) as typeof authClient.ramose.token;
  ({ App } = await import("../src/app/App.tsx"));
  ({ BoardScreen } = await import("../src/app/screens/BoardScreen.tsx"));
  ({ ToastProvider } = await import("../src/app/ui.tsx"));
  ({ RouteProvider } = await import("../src/app/route.tsx"));
  ({ mintWorkspace } = await import("../src/app/ramose.ts"));
});

const go = (path: string) => {
  window.history.replaceState(null, "", path);
};

describe("refresh does not wait on session or the first live emission", () => {
  test("a slug mounts the Provider / board tree without awaiting get-session", () => {
    minted = 0;
    liveRows = undefined;
    sessionSnap = { isPending: true, data: null };
    go("/coral-team");
    const { container, unmount } = render(createElement(App));
    try {
      expect(container.querySelector("[data-ramose-provider]")).not.toBeNull();
      expect(container.querySelector("[data-reef-column='backlog']")).not.toBeNull();
      expect(container.textContent).toContain("Backlog");
      expect(container.textContent).not.toContain("opening coral-team");
      expect(container.textContent).not.toContain("loading…");
      expect(minted).toBe(0);
    } finally {
      unmount();
    }
  });

  test("BoardScreen with rows === undefined does not render opening ${slug}", () => {
    liveRows = undefined;
    go("/coral-team");
    const { container, unmount } = render(
      createElement(
        ToastProvider,
        null,
        createElement(
          RouteProvider,
          null,
          createElement(BoardScreen, {
            workspace: mintWorkspace("coral-team"),
            name: "Coral",
            user: ada,
            onLeave: () => {},
          }),
        ),
      ),
    );
    try {
      expect(container.textContent).not.toContain("opening coral-team");
      expect(container.querySelector("[data-reef-column='backlog']")).not.toBeNull();
      expect(container.querySelector("[data-reef-column='todo']")).not.toBeNull();
      expect(container.querySelector("[data-reef-column='doing']")).not.toBeNull();
      expect(container.querySelector("[data-reef-column='done']")).not.toBeNull();
      expect(container.textContent).toContain("Coral");
      expect(container.textContent).not.toContain("This board is empty");
    } finally {
      unmount();
    }
  });

  test("[] after emission is an empty board, not a loader", () => {
    liveRows = [];
    go("/coral-team");
    const { container, unmount } = render(
      createElement(
        ToastProvider,
        null,
        createElement(
          RouteProvider,
          null,
          createElement(BoardScreen, {
            workspace: mintWorkspace("coral-team"),
            name: "Coral",
            user: ada,
            onLeave: () => {},
          }),
        ),
      ),
    );
    try {
      expect(container.textContent).not.toContain("opening coral-team");
      expect(container.textContent).toContain("This board is empty");
      expect(container.querySelector("[data-reef-column='backlog']")).not.toBeNull();
    } finally {
      unmount();
    }
  });

  test("a first visit to / still waits on session", () => {
    sessionSnap = { isPending: true, data: null };
    go("/");
    const { container, unmount } = render(createElement(App));
    try {
      expect(container.querySelector("[data-ramose-provider]")).toBeNull();
      expect(container.textContent).toContain("loading…");
    } finally {
      unmount();
    }
  });

  test("a slug with no user bounces to Auth once get-session settles", () => {
    sessionSnap = { isPending: false, data: null };
    go("/coral-team");
    const { container, unmount } = render(createElement(App));
    try {
      expect(container.querySelector("[data-ramose-provider]")).toBeNull();
      expect(container.textContent).toMatch(/Create your account|Welcome back/);
    } finally {
      unmount();
    }
  });
});
