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
import { STATUSES, STATUS_LABELS, type Status } from "../../schema.ts";
import { colors, radii, space, type } from "../theme/tokens.stylex";
import { Avatar, LabelBadge } from "../ui.tsx";

const COLUMN_TINTS: Record<Status, string> = {
  backlog: "#8b93a3",
  todo: "#5b8cff",
  doing: "#f5a524",
  done: "#3fb970",
};

export const PRIORITY_GLYPHS = ["—", "▁", "▂", "▄", "█"] as const;
export const PRIORITY_TINTS = [
  "#5e6879",
  "#8b93a3",
  "#5b8cff",
  "#f5a524",
  "#ef5f6b",
] as const;

const styles = stylex.create({
  board: {
    display: "flex",
    gap: space.md,
    alignItems: "stretch",
    flexGrow: 1,
    overflowX: "auto",
    padding: space.lg,
  },
  column: {
    display: "flex",
    flexDirection: "column",
    width: "290px",
    minWidth: "250px",
    flexShrink: 0,
    backgroundColor: colors.bgRaised,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
    borderRadius: radii.lg,
  },
  columnOver: {
    borderColor: colors.accent,
    backgroundColor: colors.surface,
  },
  columnHead: {
    display: "flex",
    alignItems: "center",
    gap: space.sm,
    paddingBlock: space.md,
    paddingInline: space.lg,
  },
  columnDot: { width: "8px", height: "8px", borderRadius: radii.full },
  columnTitle: {
    fontSize: type.sm,
    fontWeight: 700,
    color: colors.text,
    flexGrow: 1,
  },
  columnCount: {
    fontSize: type.xs,
    color: colors.textFaint,
    fontFamily: type.mono,
  },
  addButton: {
    background: "none",
    borderWidth: 0,
    color: { default: colors.textFaint, ":hover": colors.text },
    cursor: "pointer",
    fontSize: type.lg,
    lineHeight: 1,
    padding: 0,
  },
  cards: {
    display: "flex",
    flexDirection: "column",
    gap: space.sm,
    paddingBlock: space.xs,
    paddingInline: space.sm,
    overflowY: "auto",
    flexGrow: 1,
    minHeight: "60px",
  },
  card: {
    backgroundColor: { default: colors.surface, ":hover": colors.surfaceHover },
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: space.md,
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    gap: space.sm,
    boxShadow: colors.shadowSm,
  },
  cardSelected: { borderColor: colors.accent },
  cardDragging: { opacity: 0.4 },
  cardTitleRow: { display: "flex", gap: space.sm, alignItems: "flex-start" },
  priority: {
    fontSize: type.xs,
    fontFamily: type.mono,
    lineHeight: 1.6,
    flexShrink: 0,
  },
  cardTitle: {
    fontSize: type.sm,
    fontWeight: 600,
    color: colors.text,
    lineHeight: 1.4,
    overflowWrap: "anywhere",
  },
  cardMeta: {
    display: "flex",
    alignItems: "center",
    gap: space.xs,
    flexWrap: "wrap",
  },
  spacer: { flexGrow: 1 },
});

export const Board = ({
  rows,
  readOnly,
  selectedId,
  onSelect,
  onNew,
  onMove,
}: {
  rows: readonly BoardRow[];
  /** Time travel: the past is not editable (and drags would be lies). */
  readOnly: boolean;
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

  return (
    <div {...stylex.props(styles.board)}>
      {STATUSES.map((status) => {
        const column = rows.filter((r) => r.status === status);
        return (
          <section
            key={status}
            {...stylex.props(
              styles.column,
              overColumn === status && dragId !== null && styles.columnOver,
            )}
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
                style={{ backgroundColor: COLUMN_TINTS[status] }}
              />
              <span {...stylex.props(styles.columnTitle)}>
                {STATUS_LABELS[status]}
              </span>
              <span {...stylex.props(styles.columnCount)}>{column.length}</span>
              {!readOnly && (
                <button
                  {...stylex.props(styles.addButton)}
                  title={`New issue in ${STATUS_LABELS[status]}`}
                  onClick={() => onNew(status)}
                >
                  +
                </button>
              )}
            </header>
            <div {...stylex.props(styles.cards)}>
              {column.map((row) => (
                <article
                  key={row.id}
                  draggable={!readOnly}
                  {...stylex.props(
                    styles.card,
                    row.id === selectedId && styles.cardSelected,
                    row.id === dragId && styles.cardDragging,
                  )}
                  onClick={() => onSelect(row.id)}
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
                  <div {...stylex.props(styles.cardTitleRow)}>
                    <span
                      {...stylex.props(styles.priority)}
                      title={`priority ${row.priority}`}
                      style={{ color: PRIORITY_TINTS[row.priority] ?? PRIORITY_TINTS[0] }}
                    >
                      {PRIORITY_GLYPHS[row.priority] ?? "—"}
                    </span>
                    <span {...stylex.props(styles.cardTitle)}>{row.title}</span>
                  </div>
                  {(row.labels.length > 0 || row.assignee !== undefined) && (
                    <div {...stylex.props(styles.cardMeta)}>
                      {row.labels.map((label) => (
                        <LabelBadge key={label.id} name={label.name} color={label.color} />
                      ))}
                      <span {...stylex.props(styles.spacer)} />
                      {row.assignee !== undefined && (
                        <Avatar name={row.assignee.name} />
                      )}
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
