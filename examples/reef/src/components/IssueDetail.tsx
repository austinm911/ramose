/**
 * The issue side panel. Status / priority / assignee / labels come straight
 * from the live board row (so they update in place); description and the
 * admin-only note ride a small `db.pull` re-read on every board tick. Every
 * control is enabled regardless of role — the peer's policy is the
 * enforcement, and a denial surfaces as a toast. `privateNote` demonstrates
 * per-attribute rules: read-masked and write-denied below `admin`.
 */

import * as stylex from "@stylexjs/stylex";
import type * as Effect from "effect/Effect";
import { useEffect, useMemo, useState } from "react";
import {
  commentsQuery,
  issueExtraShape,
  type BoardRow,
  type CommentRow,
  type LabelRow,
  type Person,
} from "../../queries.ts";
import type { RippleClass } from "../../shared.ts";
import {
  addComment,
  deleteComment,
  deleteIssue,
  setAssignee,
  setDescription,
  setPriority,
  setPrivateNote,
  setStatus,
  setTitle,
  toggleLabel,
} from "../mutations.ts";
import type { Workspace } from "../ripple.ts";
import { PRIORITIES, STATUSES, STATUS_LABELS, type Status } from "../../schema.ts";
import { colors, radii, space, type } from "../theme/tokens.stylex";
import { Avatar, Button, LabelBadge, Select, TextArea } from "../ui.tsx";
import { useLive } from "../useLive.ts";

type Extra = {
  readonly title: string;
  readonly description?: string | undefined;
  readonly privateNote?: string | undefined;
};

const styles = stylex.create({
  panel: {
    width: "min(400px, 90vw)",
    flexShrink: 0,
    borderLeftWidth: 1,
    borderLeftStyle: "solid",
    borderLeftColor: colors.border,
    backgroundColor: colors.bgRaised,
    display: "flex",
    flexDirection: "column",
    overflowY: "auto",
  },
  head: {
    display: "flex",
    alignItems: "center",
    gap: space.sm,
    padding: space.lg,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
  },
  headId: {
    fontFamily: type.mono,
    fontSize: type.xs,
    color: colors.textFaint,
    flexGrow: 1,
  },
  body: { padding: space.lg, display: "flex", flexDirection: "column", gap: space.lg },
  titleInput: {
    width: "100%",
    background: "none",
    borderWidth: 0,
    fontSize: type.lg,
    fontWeight: 700,
    color: colors.text,
    outline: "none",
    padding: 0,
  },
  sectionLabel: {
    fontSize: type.xs,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: colors.textMuted,
    marginBottom: space.xs,
  },
  metaGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: space.md,
  },
  chips: { display: "flex", flexWrap: "wrap", gap: space.xs },
  chipButton: {
    background: "none",
    borderWidth: 0,
    padding: 0,
    cursor: "pointer",
    opacity: { default: 1, ":hover": 0.8 },
  },
  chipOff: { opacity: 0.35 },
  noteHint: {
    fontSize: type.xs,
    color: colors.textFaint,
    marginTop: space.xs,
  },
  comment: {
    display: "flex",
    gap: space.sm,
    alignItems: "flex-start",
    paddingBlock: space.sm,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
  },
  commentBody: { flexGrow: 1, minWidth: 0 },
  commentMeta: {
    display: "flex",
    gap: space.sm,
    alignItems: "baseline",
    marginBottom: space.xxs,
  },
  commentAuthor: { fontSize: type.sm, fontWeight: 700, color: colors.text },
  commentAt: { fontSize: type.xs, color: colors.textFaint },
  commentText: {
    margin: 0,
    fontSize: type.sm,
    color: colors.text,
    lineHeight: 1.5,
    overflowWrap: "anywhere",
  },
  commentForm: { display: "flex", gap: space.sm, marginTop: space.sm, alignItems: "flex-end" },
  creatorLine: {
    display: "flex",
    alignItems: "center",
    gap: space.sm,
    fontSize: type.sm,
    color: colors.textMuted,
  },
});

export const IssueDetail = ({
  workspace,
  attempt,
  row,
  myEid,
  cls,
  labels,
  people,
  onClose,
}: {
  workspace: Workspace;
  /** Runs a write; policy denials become toasts upstream. */
  attempt: (effect: Effect.Effect<unknown, unknown>) => void;
  /** The live board row — already re-rendering on every basis tick. */
  row: BoardRow;
  myEid: number | undefined;
  cls: RippleClass;
  labels: readonly LabelRow[];
  people: readonly Person[];
  onClose: () => void;
}) => {
  const { db } = workspace;
  const issueId = row.id;
  const [extra, setExtra] = useState<Extra | null>(null);
  const [title, setTitleDraft] = useState("");
  const [description, setDescriptionDraft] = useState("");
  const [note, setNoteDraft] = useState("");
  const [commentDraft, setCommentDraft] = useState("");

  // `row` is new on every live emission, so edits from any tab re-pull.
  useEffect(() => {
    let alive = true;
    void workspace
      .run(db.pull({ id: issueId }, issueExtraShape))
      .then((pulled) => {
        if (!alive || pulled === null) return;
        const e = pulled as Extra;
        setExtra(e);
        setTitleDraft(e.title);
        setDescriptionDraft(e.description ?? "");
        setNoteDraft(e.privateNote ?? "");
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issueId, row]);

  const commentStream = useMemo(
    () => db.live(commentsQuery(issueId)),
    [db, issueId],
  );
  const comments = useLive(commentStream);

  return (
    <aside {...stylex.props(styles.panel)}>
      <div {...stylex.props(styles.head)}>
        <span {...stylex.props(styles.headId)}>issue #{issueId}</span>
        <Button
          size="sm"
          variant="danger"
          onClick={() => attempt(deleteIssue(db, issueId))}
        >
          Delete
        </Button>
        <Button size="sm" variant="subtle" onClick={onClose}>
          ✕
        </Button>
      </div>
      <div {...stylex.props(styles.body)}>
        <input
          {...stylex.props(styles.titleInput)}
          value={extra === null ? row.title : title}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={() => {
            if (title.trim() !== "" && title !== row.title) {
              attempt(setTitle(db, issueId, title.trim()));
            }
          }}
        />

        <div {...stylex.props(styles.creatorLine)}>
          <Avatar name={row.creator.name} />
          opened by {row.creator.name} · {row.createdAt.toLocaleDateString()}
        </div>

        <div {...stylex.props(styles.metaGrid)}>
          <div>
            <div {...stylex.props(styles.sectionLabel)}>Status</div>
            <Select
              value={row.status}
              onChange={(e) =>
                attempt(setStatus(db, issueId, e.target.value as Status))
              }
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <div {...stylex.props(styles.sectionLabel)}>Priority</div>
            <Select
              value={row.priority}
              onChange={(e) =>
                attempt(setPriority(db, issueId, Number(e.target.value)))
              }
            >
              {PRIORITIES.map((p, i) => (
                <option key={p} value={i}>
                  {p}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <div {...stylex.props(styles.sectionLabel)}>Assignee</div>
            <Select
              value={row.assignee?.id ?? ""}
              onChange={(e) =>
                attempt(
                  setAssignee(
                    db,
                    issueId,
                    e.target.value === "" ? undefined : Number(e.target.value),
                  ),
                )
              }
            >
              <option value="">Unassigned</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <div {...stylex.props(styles.sectionLabel)}>Labels</div>
            <div {...stylex.props(styles.chips)}>
              {labels.map((label) => {
                const on = row.labels.some((l) => l.id === label.id);
                return (
                  <button
                    key={label.id}
                    type="button"
                    {...stylex.props(styles.chipButton, !on && styles.chipOff)}
                    title={on ? `remove ${label.name}` : `add ${label.name}`}
                    onClick={() => attempt(toggleLabel(db, issueId, label.id, !on))}
                  >
                    <LabelBadge name={label.name} color={label.color} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div>
          <div {...stylex.props(styles.sectionLabel)}>Description</div>
          <TextArea
            value={description}
            placeholder="add a description…"
            onChange={(e) => setDescriptionDraft(e.target.value)}
            onBlur={() => {
              if (extra !== null && description !== (extra.description ?? "")) {
                attempt(setDescription(db, issueId, description.trim()));
              }
            }}
          />
        </div>

        <div>
          <div {...stylex.props(styles.sectionLabel)}>
            🔒 Admin note{cls !== "admin" && " (admin-only)"}
          </div>
          <TextArea
            value={note}
            placeholder={
              cls === "admin"
                ? "visible to admins only…"
                : "read-masked for your class — writes will be denied by the peer"
            }
            onChange={(e) => setNoteDraft(e.target.value)}
            onBlur={() => {
              if (extra !== null && note !== (extra.privateNote ?? "")) {
                attempt(setPrivateNote(db, issueId, note.trim()));
              }
            }}
          />
          <div {...stylex.props(styles.noteHint)}>
            issue.privateNote has a narrowed read rule — the peer redacts the
            datom itself for non-admins.
          </div>
        </div>

        <div>
          <div {...stylex.props(styles.sectionLabel)}>
            Comments {comments.rows === undefined ? "" : `(${comments.rows.length})`}
          </div>
          {(comments.rows ?? []).map((comment: CommentRow) => (
            <div key={comment.id} {...stylex.props(styles.comment)}>
              <Avatar name={comment.author.name} />
              <div {...stylex.props(styles.commentBody)}>
                <div {...stylex.props(styles.commentMeta)}>
                  <span {...stylex.props(styles.commentAuthor)}>
                    {comment.author.name}
                  </span>
                  <span {...stylex.props(styles.commentAt)}>
                    {comment.at.toLocaleTimeString()}
                  </span>
                </div>
                <p {...stylex.props(styles.commentText)}>{comment.body}</p>
              </div>
              <Button
                size="sm"
                variant="subtle"
                title="delete comment"
                onClick={() => attempt(deleteComment(db, comment.id))}
              >
                ✕
              </Button>
            </div>
          ))}
          <form
            {...stylex.props(styles.commentForm)}
            onSubmit={(e) => {
              e.preventDefault();
              const body = commentDraft.trim();
              if (body === "" || myEid === undefined) return;
              setCommentDraft("");
              attempt(addComment(db, myEid, issueId, body));
            }}
          >
            <TextArea
              value={commentDraft}
              placeholder={
                myEid === undefined ? "viewers cannot comment" : "leave a comment…"
              }
              onChange={(e) => setCommentDraft(e.target.value)}
              rows={2}
            />
            <Button variant="primary" type="submit" size="sm">
              Send
            </Button>
          </form>
        </div>
      </div>
    </aside>
  );
};
