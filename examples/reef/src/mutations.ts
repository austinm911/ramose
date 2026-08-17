/**
 * Every write the app makes. Each is one `db.transact` generator — the
 * whole body commits atomically or the peer's policy rejects it with
 * `Unauthorized`, which the UI surfaces as a toast (enforcement is
 * server-side; the buttons are merely polite).
 */

import * as Effect from "effect/Effect";
import * as Ripple from "@ripple/alchemy/db";
import type { ReefDb } from "../queries.ts";
import { rankAfter } from "../rank.ts";
import { Comment, Issue, Label, User, type Status } from "../schema.ts";

/** The labels every new workspace starts with. */
export const SEED_LABELS: readonly { name: string; color: string }[] = [
  { name: "bug", color: "#ef5f6b" },
  { name: "feature", color: "#5b8cff" },
  { name: "design", color: "#b17aff" },
  { name: "infra", color: "#3fb970" },
];

/**
 * Workspace provisioning, from the browser, under the creator's admin-class
 * JWT: install the catalog on the fresh name, then seed labels and the
 * creator's own `user` row. This *is* the multi-tenancy demo — no resource,
 * no deploy, one `install()` and one transaction.
 */
export const provisionWorkspace = (
  db: ReefDb,
  me: { id: string; name: string; email: string },
) =>
  Effect.gen(function* () {
    yield* db.install();
    yield* db.transact(function* (tx) {
      const user = yield* tx.entity();
      yield* user.add(User.sub, me.id);
      yield* user.add(User.name, me.name);
      yield* user.add(User.email, me.email);
      for (const seed of SEED_LABELS) {
        const label = yield* tx.entity();
        yield* label.add(Label.name, seed.name);
        yield* label.add(Label.color, seed.color);
      }
    });
  });

/**
 * First entry by a member: write your own `user` row if it is not there.
 * `:user/sub` is a preset attribute, so supplying your own sub is a no-op
 * check and supplying anyone else's is `Unauthorized`. Viewers skip the
 * write — they never need an entity (reads are class-scoped).
 *
 * Returns the caller's user eid, or `undefined` for a viewer who has none.
 */
export const ensureSelf = (
  db: ReefDb,
  me: { id: string; name: string; email: string },
  canWrite: boolean,
) =>
  Effect.gen(function* () {
    const mineQuery = Ripple.query(User)
      .where(User.sub.eq(me.id))
      .select({ id: User.id });
    const existing = yield* db.q(mineQuery);
    if (existing.length > 0) return existing[0]!.id;
    if (!canWrite) return undefined;
    const report = yield* db.transact(function* (tx) {
      const user = yield* tx.entity();
      yield* user.add(User.sub, me.id);
      yield* user.add(User.name, me.name);
      yield* user.add(User.email, me.email);
    });
    const after = yield* report.dbAfter.q(mineQuery);
    return after[0]?.id;
  });

export interface NewIssue {
  readonly title: string;
  readonly description?: string;
  readonly status: Status;
  readonly priority: number;
  readonly assigneeId?: number | undefined;
  readonly labelIds?: readonly number[];
}

/** `creator` is preset by the peer; writing it explicitly is the same datom. */
export const createIssue = (
  db: ReefDb,
  myEid: number,
  lastRankInColumn: number | undefined,
  draft: NewIssue,
) =>
  db.transact(function* (tx) {
    const issue = yield* tx.entity();
    yield* issue.add(Issue.title, draft.title);
    if (draft.description !== undefined && draft.description !== "") {
      yield* issue.add(Issue.description, draft.description);
    }
    yield* issue.add(Issue.status, draft.status);
    yield* issue.add(Issue.priority, draft.priority);
    yield* issue.add(Issue.rank, rankAfter(lastRankInColumn));
    yield* issue.add(Issue.createdAt, new Date());
    yield* issue.add(Issue.creator, myEid);
    if (draft.assigneeId !== undefined) {
      yield* issue.add(Issue.assignee, draft.assigneeId);
    }
    for (const labelId of draft.labelIds ?? []) {
      yield* issue.add(Issue.labels, labelId);
    }
  });

/** Drag-and-drop: one status datom + one rank datom. */
export const moveIssue = (
  db: ReefDb,
  issueId: number,
  status: Status,
  rank: number,
) =>
  db.transact(function* (tx) {
    yield* tx.add(issueId, Issue.status, status);
    yield* tx.add(issueId, Issue.rank, rank);
  });

/** Status change from the detail panel — keeps the rank (column position). */
export const setStatus = (db: ReefDb, issueId: number, status: Status) =>
  db.transact(function* (tx) {
    yield* tx.add(issueId, Issue.status, status);
  });

export const setTitle = (db: ReefDb, issueId: number, title: string) =>
  db.transact(function* (tx) {
    yield* tx.add(issueId, Issue.title, title);
  });

export const setDescription = (db: ReefDb, issueId: number, text: string) =>
  db.transact(function* (tx) {
    if (text === "") yield* tx.retract(issueId, Issue.description);
    else yield* tx.add(issueId, Issue.description, text);
  });

export const setPriority = (db: ReefDb, issueId: number, priority: number) =>
  db.transact(function* (tx) {
    yield* tx.add(issueId, Issue.priority, priority);
  });

export const setAssignee = (
  db: ReefDb,
  issueId: number,
  assigneeId: number | undefined,
) =>
  db.transact(function* (tx) {
    if (assigneeId === undefined) yield* tx.retract(issueId, Issue.assignee);
    else yield* tx.add(issueId, Issue.assignee, assigneeId);
  });

export const toggleLabel = (
  db: ReefDb,
  issueId: number,
  labelId: number,
  on: boolean,
) =>
  db.transact(function* (tx) {
    if (on) yield* tx.add(issueId, Issue.labels, labelId);
    else yield* tx.retract(issueId, Issue.labels, labelId);
  });

/** Admin-only by policy: everyone else gets `Unauthorized` from the peer. */
export const setPrivateNote = (db: ReefDb, issueId: number, note: string) =>
  db.transact(function* (tx) {
    if (note === "") yield* tx.retract(issueId, Issue.privateNote);
    else yield* tx.add(issueId, Issue.privateNote, note);
  });

export const deleteIssue = (db: ReefDb, issueId: number) =>
  db.transact(function* (tx) {
    yield* tx.retractEntity(issueId);
  });

export const addComment = (
  db: ReefDb,
  myEid: number,
  issueId: number,
  body: string,
) =>
  db.transact(function* (tx) {
    const comment = yield* tx.entity();
    yield* comment.add(Comment.body, body);
    yield* comment.add(Comment.at, new Date());
    yield* comment.add(Comment.author, myEid);
    yield* comment.add(Comment.issue, issueId);
  });

export const deleteComment = (db: ReefDb, commentId: number) =>
  db.transact(function* (tx) {
    yield* tx.retractEntity(commentId);
  });
