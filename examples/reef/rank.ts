/**
 * Fractional ranking for drag-and-drop: an issue's position inside a column
 * is one double, and a move writes one datom (`:issue/rank`). Midpoints halve
 * the gap; the initial spacing keeps thousands of moves away from precision
 * trouble for a demo's lifetime.
 */

export const RANK_GAP = 1024;

/** The rank for appending after `last` (or the first rank of an empty list). */
export const rankAfter = (last: number | undefined): number =>
  last === undefined ? RANK_GAP : last + RANK_GAP;

/** A rank strictly between two neighbours (either side may be open). */
export const rankBetween = (
  before: number | undefined,
  after: number | undefined,
): number => {
  if (before === undefined && after === undefined) return RANK_GAP;
  if (before === undefined) return (after as number) - RANK_GAP;
  if (after === undefined) return before + RANK_GAP;
  return (before + after) / 2;
};

/**
 * Where a card lands when dropped at `index` among `ranks` (the target
 * column's current ranks, ascending, with the dragged card already removed).
 */
export const rankAt = (ranks: readonly number[], index: number): number =>
  rankBetween(ranks[index - 1], ranks[index]);
