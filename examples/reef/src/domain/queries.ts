/**
 * Every read the app asks, as hoisted navigational query values — stable
 * dependencies for `useLive`, runnable one-shot (`db.q`), live (`db.live`) or
 * in the past (`db.asOf(t).q`) unchanged. The pull shapes are also fed to
 * `Ripple.Policy.compile({ pulls })` so a read-masked attribute pulled as
 * required is a deploy-time error, not a silently dropped row.
 */

import type { Db } from "@ripplegraph/alchemy/db";
import * as Ripple from "@ripplegraph/alchemy/db";
import { Comment, Issue, Label, Reef, User } from "./schema.ts";

export type ReefDb = Db<typeof Reef>;

// ── shapes ───────────────────────────────────────────────────────────────────

export const personShape = { id: User.id, name: User.name } as const;
export const labelShape = {
  id: Label.id,
  name: Label.name,
  color: Label.color,
} as const;

export const boardShape = {
  id: Issue.id,
  title: Issue.title,
  status: Issue.status,
  priority: Issue.priority,
  rank: Issue.rank,
  createdAt: Issue.createdAt,
  creator: Issue.creator.select(personShape),
  assignee: Issue.assignee.select(personShape).optional,
  labels: Issue.labels.select(labelShape),
} as const;

/**
 * What the detail panel `db.pull`s on top of its live board row (the row
 * already carries status/priority/assignee/labels/creator).
 */
export const issueExtraShape = {
  title: Issue.title,
  description: Issue.description.optional,
  // Read-masked for member/viewer (policy.ts): must be `.optional`, so for
  // them the row survives and the field is simply absent.
  privateNote: Issue.privateNote.optional,
} as const;

export const commentShape = {
  id: Comment.id,
  body: Comment.body,
  at: Comment.at,
  author: Comment.author.select(personShape),
} as const;

/** Everything `compile({ pulls })` should vet. */
export const allShapes: readonly unknown[] = [
  boardShape,
  issueExtraShape,
  commentShape,
  personShape,
  labelShape,
];

// ── queries ──────────────────────────────────────────────────────────────────

export const boardQuery = Ripple.query(Issue)
  .orderBy(Issue.rank, "asc")
  .select(boardShape);

export const peopleQuery = Ripple.query(User)
  .orderBy(User.name, "asc")
  .select({ id: User.id, name: User.name, email: User.email });

export const labelsQuery = Ripple.query(Label)
  .orderBy(Label.name, "asc")
  .select(labelShape);

export const commentsQuery = (issueId: number) =>
  Ripple.query(Comment)
    .where(Comment.issue.eq(issueId))
    .orderBy(Comment.at, "asc")
    .select(commentShape);

/** Over `db.history` this also returns issues that no longer exist. */
export const everyIssueEverQuery = Ripple.query(Issue).select({
  id: Issue.id,
  title: Issue.title,
});

/** One row of {@link boardQuery}. */
export type BoardRow = {
  readonly id: number;
  readonly title: string;
  readonly status: string;
  readonly priority: number;
  readonly rank: number;
  readonly createdAt: Date;
  readonly creator: Person;
  readonly assignee?: Person | undefined;
  readonly labels: readonly LabelRow[];
};

export type Person = { readonly id: number; readonly name: string };
export type LabelRow = {
  readonly id: number;
  readonly name: string;
  readonly color: string;
};

export type CommentRow = {
  readonly id: number;
  readonly body: string;
  readonly at: Date;
  readonly author: Person;
};
