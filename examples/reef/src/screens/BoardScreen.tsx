/**
 * One open workspace: header, live kanban, issue panel, time travel.
 *
 * Everything on screen is derived from three hoisted `db.live` streams; every
 * write is a `db.transact` that the peer's policy may deny — denials become
 * toasts, because enforcement is server-side and the UI is only a hint.
 */

import * as stylex from "@stylexjs/stylex";
import * as Effect from "effect/Effect";
import { useCallback, useMemo, useState } from "react";
import {
  boardQuery,
  everyIssueEverQuery,
  labelsQuery,
  peopleQuery,
  type BoardRow,
} from "../../queries.ts";
import { STATUS_LABELS, type Status } from "../../schema.ts";
import type { Theme } from "../App.tsx";
import { authClient, inviteMember, listWorkspaces, type SessionUser } from "../auth.ts";
import { Board } from "../components/Board.tsx";
import { IssueDetail } from "../components/IssueDetail.tsx";
import { TimeTravelBar } from "../components/TimeTravel.tsx";
import { createIssue, moveIssue, type NewIssue } from "../mutations.ts";
import type { Workspace } from "../ripple.ts";
import { INVITABLE_ROLES } from "../../roles.ts";
import { colors, radii, space, type } from "../theme/tokens.stylex";
import {
  Button,
  Dialog,
  Field,
  Input,
  Loading,
  Select,
  TextArea,
  useEscape,
  useToast,
} from "../ui.tsx";
import { useLive } from "../useLive.ts";

const styles = stylex.create({
  screen: { display: "flex", flexDirection: "column", flexGrow: 1, minHeight: 0, height: "100vh" },
  header: {
    display: "flex",
    alignItems: "center",
    gap: space.md,
    paddingBlock: space.sm,
    paddingInline: space.lg,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
    backgroundColor: colors.bgRaised,
  },
  wsName: { fontWeight: 700, fontSize: type.md },
  wsSlug: { fontFamily: type.mono, fontSize: type.xs, color: colors.textFaint },
  classBadge: {
    fontSize: type.xs,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    borderRadius: radii.full,
    paddingBlock: "2px",
    paddingInline: space.sm,
    backgroundColor: colors.accentSoft,
    color: colors.accent,
  },
  spacer: { flexGrow: 1 },
  main: { display: "flex", flexGrow: 1, minHeight: 0 },
  boardWrap: { display: "flex", flexDirection: "column", flexGrow: 1, minWidth: 0 },
  pastNotice: {
    marginInline: space.lg,
    marginTop: space.sm,
    fontSize: type.xs,
    color: colors.textMuted,
  },
});

export const BoardScreen = ({
  workspace,
  myEid,
  user,
  theme,
  setTheme,
  onLeave,
}: {
  workspace: Workspace;
  myEid: number | undefined;
  user: SessionUser;
  theme: Theme;
  setTheme: (t: Theme) => void;
  onLeave: () => void;
}) => {
  const { db, cls, slug } = workspace;
  const toast = useToast();

  const streams = useMemo(
    () => ({
      board: db.live(boardQuery),
      people: db.live(peopleQuery),
      labels: db.live(labelsQuery),
    }),
    [db],
  );
  const board = useLive(streams.board);
  const people = useLive(streams.people);
  const labels = useLive(streams.labels);

  const [selected, setSelected] = useState<number | null>(null);
  const [draftStatus, setDraftStatus] = useState<Status | null>(null);
  const [invite, setInvite] = useState(false);
  const [past, setPast] = useState<{
    t: number;
    maxT: number;
    rows: readonly BoardRow[];
    deleted: readonly { id: number; title: string }[];
  } | null>(null);

  /** Run a write; a policy denial (or any DbError) becomes a toast. */
  const attempt = useCallback(
    (effect: Effect.Effect<unknown, unknown>) => {
      void workspace.run(
        Effect.catch(effect, (error: unknown) =>
          Effect.sync(() => {
            const e = error as { _tag?: string; message?: string };
            toast("error", e.message ?? e._tag ?? String(error));
          }),
        ),
      );
    },
    [workspace, toast],
  );

  const scrub = useCallback(
    (t: number) => {
      setPast((p) => (p === null ? p : { ...p, t }));
      void workspace
        .run(db.asOf(t).q(boardQuery))
        .then((rows) =>
          setPast((p) => (p === null || p.t !== t ? p : { ...p, rows: rows as readonly BoardRow[] })),
        )
        .catch(() => {});
    },
    [db, workspace],
  );

  const enterTimeTravel = useCallback(() => {
    void (async () => {
      try {
        const { t } = await workspace.info();
        const [rows, everything] = await Promise.all([
          workspace.run(db.asOf(t).q(boardQuery)),
          workspace.run(db.history.q(everyIssueEverQuery)),
        ]);
        const live = new Set((board.rows ?? []).map((r) => r.id));
        const deleted = (everything as readonly { id: number; title: string }[]).filter(
          (r) => !live.has(r.id),
        );
        setSelected(null);
        setPast({ t, maxT: t, rows: rows as readonly BoardRow[], deleted });
      } catch (err) {
        toast("error", err instanceof Error ? err.message : String(err));
      }
    })();
  }, [workspace, db, board.rows, toast]);

  useEscape(
    useCallback(() => {
      setSelected(null);
      setDraftStatus(null);
      setInvite(false);
    }, []),
  );

  if (board.error !== undefined) {
    return (
      <div {...stylex.props(styles.screen)}>
        <Loading text="connection lost — retrying on reload…" />
      </div>
    );
  }
  if (board.rows === undefined) return <Loading text={`opening ${slug}…`} />;

  const rows = past?.rows ?? (board.rows as readonly BoardRow[]);
  const timeTraveling = past !== null;
  // Derived from the live rows, so a deleted issue closes its own panel.
  const selectedRow =
    selected === null
      ? undefined
      : (board.rows as readonly BoardRow[]).find((r) => r.id === selected);

  return (
    <div {...stylex.props(styles.screen)}>
      <header {...stylex.props(styles.header)}>
        <Button size="sm" variant="subtle" onClick={onLeave} title="switch workspace">
          ‹ Workspaces
        </Button>
        <span {...stylex.props(styles.wsName)}>{slug}</span>
        <span {...stylex.props(styles.wsSlug)}>db/{slug}</span>
        <span {...stylex.props(styles.classBadge)} title="your ripple.class in this workspace">
          {cls}
        </span>
        <span {...stylex.props(styles.spacer)} />
        {!timeTraveling && (
          <Button size="sm" onClick={enterTimeTravel}>
            ⏪ Time travel
          </Button>
        )}
        {cls === "admin" && (
          <Button size="sm" onClick={() => setInvite(true)}>
            Invite
          </Button>
        )}
        <Button
          size="sm"
          variant="subtle"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          title="toggle theme"
        >
          {theme === "dark" ? "☀️" : "🌙"}
        </Button>
        <Button size="sm" variant="subtle" onClick={() => void authClient.signOut()}>
          Sign out
        </Button>
      </header>

      {timeTraveling && (
        <>
          <TimeTravelBar
            t={past.t}
            maxT={past.maxT}
            deleted={past.deleted}
            onScrub={scrub}
            onExit={() => setPast(null)}
          />
          <div {...stylex.props(styles.pastNotice)}>
            Read-only view as of transaction {past.t}. Same queries, pinned
            basis — nothing was copied.
          </div>
        </>
      )}

      <div {...stylex.props(styles.main)}>
        <div {...stylex.props(styles.boardWrap)}>
          <Board
            rows={rows}
            readOnly={timeTraveling}
            selectedId={selected}
            onSelect={(id) => setSelected(id)}
            onNew={(status) => setDraftStatus(status)}
            onMove={(id, status, rank) => attempt(moveIssue(db, id, status, rank))}
          />
        </div>
        {selectedRow !== undefined && !timeTraveling && (
          <IssueDetail
            workspace={workspace}
            attempt={attempt}
            row={selectedRow}
            myEid={myEid}
            cls={cls}
            labels={labels.rows ?? []}
            people={people.rows ?? []}
            onClose={() => setSelected(null)}
          />
        )}
      </div>

      {draftStatus !== null && (
        <NewIssueDialog
          status={draftStatus}
          people={people.rows ?? []}
          onClose={() => setDraftStatus(null)}
          onSubmit={(draft) => {
            if (myEid === undefined) {
              toast("error", "viewers cannot create issues");
              return;
            }
            const column = (board.rows as readonly BoardRow[]).filter(
              (r) => r.status === draft.status,
            );
            attempt(createIssue(db, myEid, column[column.length - 1]?.rank, draft));
            setDraftStatus(null);
          }}
        />
      )}

      {invite && (
        <InviteDialog slug={slug} user={user} onClose={() => setInvite(false)} />
      )}
    </div>
  );
};

// ── new issue ────────────────────────────────────────────────────────────────

const NewIssueDialog = ({
  status,
  people,
  onClose,
  onSubmit,
}: {
  status: Status;
  people: readonly { id: number; name: string }[];
  onClose: () => void;
  onSubmit: (draft: NewIssue) => void;
}) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState(0);
  const [assignee, setAssignee] = useState("");
  return (
    <Dialog title={`New issue — ${STATUS_LABELS[status]}`} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim() === "") return;
          onSubmit({
            title: title.trim(),
            description: description.trim(),
            status,
            priority,
            assigneeId: assignee === "" ? undefined : Number(assignee),
          });
        }}
      >
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus required />
        </Field>
        <Field label="Description">
          <TextArea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="optional"
          />
        </Field>
        <Field label="Priority">
          <Select value={priority} onChange={(e) => setPriority(Number(e.target.value))}>
            {["No priority", "Low", "Medium", "High", "Urgent"].map((p, i) => (
              <option key={p} value={i}>
                {p}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Assignee">
          <Select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">Unassigned</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Button variant="primary" type="submit">
          Create issue
        </Button>
      </form>
    </Dialog>
  );
};

// ── invite ───────────────────────────────────────────────────────────────────

const InviteDialog = ({
  slug,
  user,
  onClose,
}: {
  slug: string;
  user: SessionUser;
  onClose: () => void;
}) => {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("member");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const orgs = await listWorkspaces();
      const org = orgs.find((o) => o.slug === slug);
      if (org === undefined) throw new Error(`no organization for ${slug}`);
      await inviteMember(org.id, email.trim(), role);
      toast("info", `invited ${email.trim()} as ${role} — they accept from their workspace screen`);
      onClose();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title="Invite to this workspace" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label="Email">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teammate@example.com"
            autoFocus
            required
          />
        </Field>
        <Field label="Role">
          <Select value={role} onChange={(e) => setRole(e.target.value)}>
            {INVITABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {r} {r === "viewer" ? "— read-only by policy" : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Button variant="primary" type="submit" disabled={busy}>
          Send invite
        </Button>
      </form>
    </Dialog>
  );
};
