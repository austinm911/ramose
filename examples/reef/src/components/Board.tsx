/**
 * The kanban board. Rows come straight from one `db.live(boardQuery)` stream
 * (already rank-sorted); a drag writes exactly two datoms (status + rank) and
 * the board re-renders when the peer's basis tick comes back — there is no
 * local reordering state to reconcile.
 */

import * as stylex from "@stylexjs/stylex";
import { useState } from "react";
import type { BoardRow } from "../../queries.ts";
import { rankAfter, rankBetween } from "../../rank.ts";
import { PRIORITIES, STATUSES, STATUS_LABELS, type Status } from "../../schema.ts";
import { colors, radii, space, type } from "../theme/tokens.stylex";
import { Avatar, Icon, IconButton, LabelBadge, PriorityIcon } from "../ui.tsx";

export const COLUMN_TINTS: Record<Status, string> = {
  backlog: "#8b93a3",
  todo: "#5b8cff",
  doing: "#f5a524",
  done: "#3fb970",
};

const styles = stylex.create({
  board: {
    display: "flex",
    gap: space.md,
    alignItems: "stretch",
    flexGrow: 1,
    minHeight: 0,
    overflowX: "auto",
    padding: space.lg,
  },
  column: {
    display: "flex",
    flexDirection: "column",
    flexBasis: 0,
    flexGrow: 1,
    flexShrink: 0,
    minWidth: "236px",
    maxWidth: "380px",
    minHeight: 0,
    backgroundColor: colors.bgRaised,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
    borderRadius: radii.lg,
    transition: "border-color 120ms ease, background-color 120ms ease",
  },
  columnOver: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  columnHead: {
    display: "flex",
    alignItems: "center",
    gap: space.sm,
    paddingBlock: "10px",
    paddingInline: space.md,
    paddingRight: space.sm,
  },
  columnDot: {
    width: "8px",
    height: "8px",
    borderRadius: radii.full,
    flexShrink: 0,
    boxShadow: "0 0 0 3px color-mix(in srgb, currentColor 18%, transparent)",
  },
  columnTitle: {
    fontSize: type.sm,
    fontWeight: 700,
    color: colors.text,
    letterSpacing: "0.01em",
  },
  columnCount: {
    fontSize: type.xs,
    fontWeight: 600,
    color: colors.textMuted,
    fontFamily: type.mono,
    backgroundColor: colors.surfaceActive,
    borderRadius: radii.full,
    paddingInline: "7px",
    paddingBlock: "1px",
    lineHeight: 1.6,
    minWidth: "22px",
    textAlign: "center",
  },
  spacer: { flexGrow: 1 },
  cards: {
    display: "flex",
    flexDirection: "column",
    gap: space.sm,
    paddingBlock: space.xs,
    paddingInline: space.sm,
    paddingBottom: space.sm,
    overflowY: "auto",
    flexGrow: 1,
    minHeight: "80px",
  },
  card: {
    position: "relative",
    backgroundColor: { default: colors.surface, ":hover": colors.surfaceHover },
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: { default: colors.border, ":hover": colors.borderStrong },
    borderRadius: radii.md,
    paddingBlock: "10px",
    paddingInline: space.md,
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    boxShadow: colors.shadowSm,
    transition: "border-color 120ms ease, background-color 120ms ease, box-shadow 120ms ease, transform 120ms ease",
    outline: "none",
  },
  cardSelected: {
    borderColor: { default: colors.accent, ":hover": colors.accent },
    boxShadow: `0 0 0 3px ${colors.ring}`,
  },
  cardDragging: { opacity: 0.35, transform: "scale(0.98)" },
  cardTop: {
    display: "flex",
    alignItems: "center",
    gap: space.sm,
    minHeight: "22px",
  },
  cardId: {
    fontFamily: type.mono,
    fontSize: type.xs,
    color: colors.textFaint,
    letterSpacing: "0.01em",
  },
  cardTitle: {
    fontSize: type.md,
    fontWeight: 500,
    color: colors.text,
    lineHeight: 1.4,
    overflowWrap: "anywhere",
    margin: 0,
  },
  cardMeta: {
    display: "flex",
    alignItems: "center",
    gap: "5px",
    flexWrap: "wrap",
    minHeight: "22px",
  },
  emptyColumn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginInline: space.xs,
    marginTop: space.xs,
    borderRadius: radii.md,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    color: colors.textFaint,
    fontSize: type.sm,
    height: "64px",
    transition: "border-color 120ms ease, color 120ms ease, background-color 120ms ease",
  },
  emptyColumnOver: {
    borderColor: colors.accent,
    color: colors.accent,
    backgroundColor: colors.surface,
  },
  emptyColumnHint: { display: "inline-flex", alignItems: "center", gap: space.xs },
});

export const Board = ({
  rows,
  readOnly,
  canCreate,
  selectedId,
  onSelect,
  onNew,
  onMove,
}: {
  rows: readonly BoardRow[];
  /** Time travel: the past is not editable (and drags would be lies). */
  readOnly: boolean;
  /**
   * Viewers get a polite UI (no "+" buttons) but drags stay enabled on
   * purpose: the proof of enforcement is the peer's `Unauthorized` toast.
   */
  canCreate: boolean;
  selectedId: number | null;
  onSelect: (id: number) => void;
  onNew: (status: Status) => void;
  onMove: (id: number, status: Status, rank: number) => void;
}) => {
  const [dragId, setDragId] = useState<number | null>(null);
  const [overColumn, setOverColumn] = useState<Status | null>(null);

  const drop = (status: Status, before: BoardRow | undefined) => {
    if (dragId === null) return;
    const column = rows.filter((r) => r.status === status && r.id !== dragId);
    const rank =
      before === undefined
        ? rankAfter(column[column.length - 1]?.rank)
        : rankBetween(
            column[column.findIndex((r) => r.id === before.id) - 1]?.rank,
            before.rank,
          );
    onMove(dragId, status, rank);
    setDragId(null);
    setOverColumn(null);
  };

  const dragging = dragId !== null;

  return (
    <div {...stylex.props(styles.board)}>
      {STATUSES.map((status) => {
        const column = rows.filter((r) => r.status === status);
        const over = overColumn === status && dragging;
        return (
          <section
            key={status}
            aria-label={STATUS_LABELS[status]}
            {...stylex.props(styles.column, over && styles.columnOver)}
            onDragOver={(e) => {
              e.preventDefault();
              setOverColumn(status);
            }}
            onDragLeave={(e) => {
              if (e.currentTarget === e.target) setOverColumn(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              drop(status, undefined);
            }}
          >
            <header {...stylex.props(styles.columnHead)}>
              <span
                {...stylex.props(styles.columnDot)}
                style={{ backgroundColor: COLUMN_TINTS[status], color: COLUMN_TINTS[status] }}
              />
              <span {...stylex.props(styles.columnTitle)}>
                {STATUS_LABELS[status]}
              </span>
              <span {...stylex.props(styles.columnCount)}>{column.length}</span>
              <span {...stylex.props(styles.spacer)} />
              {!readOnly && canCreate && (
                <IconButton
                  icon="plus"
                  size="sm"
                  label={`New issue in ${STATUS_LABELS[status]}`}
                  onClick={() => onNew(status)}
                />
              )}
            </header>
            <div {...stylex.props(styles.cards)}>
              {column.length === 0 && (
                <div
                  {...stylex.props(styles.emptyColumn, over && styles.emptyColumnOver)}
                >
                  <span {...stylex.props(styles.emptyColumnHint)}>
                    {dragging ? (
                      <>
                        <Icon name="plus" size={13} /> Drop here
                      </>
                    ) : readOnly ? (
                      "Nothing here at this point in time"
                    ) : (
                      "No issues"
                    )}
                  </span>
                </div>
              )}
              {column.map((row) => (
                <article
                  key={row.id}
                  tabIndex={0}
                  draggable={!readOnly}
                  {...stylex.props(
                    styles.card,
                    row.id === selectedId && styles.cardSelected,
                    row.id === dragId && styles.cardDragging,
                  )}
                  onClick={() => onSelect(row.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(row.id);
                    }
                  }}
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    setDragId(row.id);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverColumn(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    drop(status, row);
                  }}
                >
                  <div {...stylex.props(styles.cardTop)}>
                    <PriorityIcon
                      level={row.priority}
                      size={14}
                      title={PRIORITIES[row.priority] ?? PRIORITIES[0]}
                    />
                    <span {...stylex.props(styles.cardId)}>#{row.id}</span>
                    <span {...stylex.props(styles.spacer)} />
                    {row.assignee !== undefined && (
                      <Avatar name={row.assignee.name} title={`Assigned to ${row.assignee.name}`} />
                    )}
                  </div>
                  <p {...stylex.props(styles.cardTitle)}>{row.title}</p>
                  {row.labels.length > 0 && (
                    <div {...stylex.props(styles.cardMeta)}>
                      {row.labels.map((label) => (
                        <LabelBadge key={label.id} name={label.name} color={label.color} />
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
};
