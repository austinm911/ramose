/**
 * Reef — the catalog one workspace runs on.
 *
 * Every workspace is its own Ripple database (`ripple.db(slug, Reef)`), so
 * this catalog is installed once per workspace at creation time, from the
 * browser, under the creator's admin-class JWT. Refs are targeted
 * (`Ripple.Ref(() => User)`) so navigational queries can join through them
 * (`Issue.assignee.name`).
 */

import * as Ripple from "@ripplegraph/alchemy/db";
import * as Schema from "effect/Schema";

/** One row per human who has entered the workspace. `sub` is the JWT subject. */
export const User = Ripple.Namespace("user", {
  sub: Ripple.Attr(Schema.String, {
    unique: "identity",
    doc: "Better Auth user id — the JWT `sub`; the policy resolves principals through it",
  }),
  name: Ripple.Attr(Schema.String),
  email: Ripple.Attr(Schema.String),
});

export const Label = Ripple.Namespace("label", {
  name: Ripple.Attr(Schema.String, { unique: "identity" }),
  color: Ripple.Attr(Schema.String),
});

export const Issue = Ripple.Namespace("issue", {
  title: Ripple.Attr(Schema.String),
  description: Ripple.Attr(Schema.String),
  /** One of {@link STATUSES}. */
  status: Ripple.Attr(Schema.String),
  /** 0 none · 1 low · 2 medium · 3 high · 4 urgent. */
  priority: Ripple.Attr(Ripple.Long),
  /** Fractional order inside a column; drag-and-drop writes midpoints. */
  rank: Ripple.Attr(Schema.Number),
  createdAt: Ripple.Attr(Ripple.Instant),
  creator: Ripple.Attr(Ripple.Ref(() => User)),
  assignee: Ripple.Attr(Ripple.Ref(() => User)),
  labels: Ripple.Attr(Ripple.Ref(() => Label), { cardinality: "many" }),
  /** Admin-only field — the policy narrows its `read` (see policy.ts). */
  privateNote: Ripple.Attr(Schema.String, {
    doc: "visible to the admin class only",
  }),
});

export const Comment = Ripple.Namespace("comment", {
  body: Ripple.Attr(Schema.String),
  at: Ripple.Attr(Ripple.Instant),
  author: Ripple.Attr(Ripple.Ref(() => User)),
  issue: Ripple.Attr(Ripple.Ref(() => Issue)),
});

export const Reef = Ripple.Catalog({
  user: User,
  label: Label,
  issue: Issue,
  comment: Comment,
});

export type Reef = typeof Reef;

// ── shared vocabulary ────────────────────────────────────────────────────────

export const STATUSES = ["backlog", "todo", "doing", "done"] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABELS: Record<Status, string> = {
  backlog: "Backlog",
  todo: "Todo",
  doing: "In Progress",
  done: "Done",
};

export const PRIORITIES = ["No priority", "Low", "Medium", "High", "Urgent"] as const;
