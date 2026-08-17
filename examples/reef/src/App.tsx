/**
 * Session-gated shell: Better Auth session → workspace picker → board.
 * Plain state routing (SPA, no RSC). The active workspace owns a Ripple
 * runtime; switching disposes it and builds the next one.
 */

import * as stylex from "@stylexjs/stylex";
import { useCallback, useRef, useState } from "react";
import { authClient, type SessionUser } from "./auth.ts";
import { ensureSelf, provisionWorkspace } from "./mutations.ts";
import { openWorkspace, type Workspace } from "./ripple.ts";
import { AuthScreen } from "./screens/AuthScreen.tsx";
import { BoardScreen } from "./screens/BoardScreen.tsx";
import { WorkspacesScreen } from "./screens/WorkspacesScreen.tsx";
import { colors, type } from "./theme/tokens.stylex";
import { light } from "./theme/themes.stylex";
import { Loading, ToastProvider, useToast } from "./ui.tsx";

const app = stylex.create({
  root: {
    minHeight: "100%",
    backgroundColor: colors.bg,
    color: colors.text,
    fontFamily: type.family,
    fontSize: type.md,
    display: "flex",
    flexDirection: "column",
  },
});

export type Theme = "dark" | "light";

export const App = () => {
  const [theme, setTheme] = useState<Theme>("dark");
  return (
    <div {...stylex.props(app.root, theme === "light" && light)}>
      <ToastProvider>
        <Root theme={theme} setTheme={setTheme} />
      </ToastProvider>
    </div>
  );
};

interface Open {
  readonly workspace: Workspace;
  /** The caller's `user` eid in this workspace (`undefined` for viewers). */
  readonly myEid: number | undefined;
}

const Root = ({
  theme,
  setTheme,
}: {
  theme: Theme;
  setTheme: (t: Theme) => void;
}) => {
  const session = authClient.useSession();
  const toast = useToast();
  const [open, setOpen] = useState<Open | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const current = useRef<Workspace | null>(null);

  const enter = useCallback(
    async (slug: string, user: SessionUser, provision = false) => {
      setOpening(slug);
      try {
        const workspace = await openWorkspace(slug);
        if (provision) {
          await workspace.run(provisionWorkspace(workspace.db, user));
        }
        const myEid = await workspace.run(
          ensureSelf(workspace.db, user, workspace.cls !== "viewer"),
        );
        await current.current?.dispose();
        current.current = workspace;
        setOpen({ workspace, myEid });
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
    await current.current?.dispose();
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
        myEid={open.myEid}
        user={me}
        theme={theme}
        setTheme={setTheme}
        onLeave={() => void leave()}
      />
    );
  }
  return (
    <WorkspacesScreen
      user={me}
      opening={opening}
      onOpen={(slug) => void enter(slug, me)}
      onCreate={(slug) => void enter(slug, me, true)}
    />
  );
};
