/**
 * Session-gated shell: Better Auth session → workspace picker → board.
 * Plain state routing (SPA, no RSC). The active workspace owns a Ripple
 * client; switching closes it and connects the next one.
 *
 * Theme: the StyleX theme class goes on `<html>` (not the app root) so the
 * token overrides also reach UI portaled to `document.body` — dialogs and
 * toasts — and `color-scheme` follows it so native controls and scrollbars
 * match. The choice is persisted; first visit follows the OS.
 */

import * as stylex from "@stylexjs/stylex";
import * as Effect from "effect/Effect";
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { authClient, type SessionUser } from "./auth.ts";
import { ensureSelf, provisionWorkspace } from "./mutations.ts";
import { openWorkspace, type Workspace } from "./ripple.ts";
import { AuthScreen } from "./screens/AuthScreen.tsx";
import { BoardScreen } from "./screens/BoardScreen.tsx";
import { WorkspacesScreen } from "./screens/WorkspacesScreen.tsx";
import { colors, type } from "./theme/tokens.stylex";
import { light } from "./theme/themes.stylex";
import { IconButton, Loading, ToastProvider, useToast } from "./ui.tsx";

const app = stylex.create({
  html: {
    backgroundColor: colors.bg,
    color: colors.text,
    fontFamily: type.family,
    fontSize: type.md,
  },
  root: {
    minHeight: "100%",
    display: "flex",
    flexDirection: "column",
    backgroundColor: colors.bg,
    color: colors.text,
  },
});

export type Theme = "dark" | "light";

const THEME_KEY = "reef.theme";

const initialTheme = (): Theme => {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    // storage unavailable — fall through to the OS preference
  }
  return typeof matchMedia === "function" &&
    matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
};

const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({
  theme: "dark",
  toggle: () => {},
});

export const useTheme = () => useContext(ThemeContext);

/** The sun/moon toggle, usable on any screen. */
export const ThemeToggle = () => {
  const { theme, toggle } = useTheme();
  return (
    <IconButton
      icon={theme === "dark" ? "sun" : "moon"}
      label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      onClick={toggle}
    />
  );
};

export const App = () => {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const toggle = useCallback(
    () => setTheme((t) => (t === "dark" ? "light" : "dark")),
    [],
  );

  useLayoutEffect(() => {
    const { className } = stylex.props(app.html, theme === "light" && light);
    const html = document.documentElement;
    html.className = className ?? "";
    html.style.colorScheme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // ignore — the theme still applies for this session
    }
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      <div {...stylex.props(app.root)}>
        <ToastProvider>
          <Root />
        </ToastProvider>
      </div>
    </ThemeContext.Provider>
  );
};

interface Open {
  readonly workspace: Workspace;
  /** Display name (the Better Auth organization name); the slug is the db. */
  readonly name: string;
  /** The caller's `user` eid in this workspace (`undefined` for viewers). */
  readonly myEid: number | undefined;
}

const Root = () => {
  const session = authClient.useSession();
  const toast = useToast();
  const [open, setOpen] = useState<Open | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const current = useRef<Workspace | null>(null);

  const enter = useCallback(
    async (slug: string, name: string, user: SessionUser, provision = false) => {
      setOpening(slug);
      try {
        const workspace = await openWorkspace(slug);
        if (provision) {
          await Effect.runPromise(provisionWorkspace(workspace.db, user));
        }
        const myEid = await Effect.runPromise(
          ensureSelf(workspace.db, user, workspace.cls !== "viewer"),
        );
        await current.current?.close();
        current.current = workspace;
        setOpen({ workspace, name, myEid });
      } catch (err) {
        toast("error", err instanceof Error ? err.message : String(err));
      } finally {
        setOpening(null);
      }
    },
    [toast],
  );

  const leave = useCallback(async () => {
    setOpen(null);
    await current.current?.close();
    current.current = null;
  }, []);

  if (session.isPending) return <Loading />;
  const user = session.data?.user;
  if (user === undefined) return <AuthScreen />;
  const me: SessionUser = { id: user.id, name: user.name, email: user.email };

  if (open !== null) {
    return (
      <BoardScreen
        key={open.workspace.slug}
        workspace={open.workspace}
        name={open.name}
        myEid={open.myEid}
        user={me}
        onLeave={() => void leave()}
      />
    );
  }
  return (
    <WorkspacesScreen
      user={me}
      opening={opening}
      onOpen={(slug, name) => void enter(slug, name, me)}
      onCreate={(slug, name) => void enter(slug, name, me, true)}
    />
  );
};
