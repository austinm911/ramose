/**
 * The immutability demo. The slider re-renders the whole board through
 * `db.asOf(t)` — a pure view, no snapshots, no copies — and the graveyard is
 * `db.history` minus the present: issues whose datoms exist only in the past.
 */

import * as stylex from "@stylexjs/stylex";
import { colors, radii, space, type } from "../theme/tokens.stylex";
import { Button } from "../ui.tsx";

const styles = stylex.create({
  bar: {
    display: "flex",
    alignItems: "center",
    gap: space.lg,
    marginInline: space.lg,
    marginTop: space.lg,
    paddingBlock: space.md,
    paddingInline: space.lg,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.accent,
    borderRadius: radii.md,
    flexWrap: "wrap",
  },
  label: {
    fontSize: type.sm,
    fontWeight: 700,
    color: colors.text,
    whiteSpace: "nowrap",
  },
  slider: { flexGrow: 1, minWidth: "160px", accentColor: "#5b8cff" },
  t: {
    fontFamily: type.mono,
    fontSize: type.sm,
    color: colors.text,
    whiteSpace: "nowrap",
  },
  graveyard: {
    display: "flex",
    alignItems: "center",
    gap: space.sm,
    flexBasis: "100%",
    flexWrap: "wrap",
    fontSize: type.xs,
    color: colors.textMuted,
  },
  tomb: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
    borderRadius: radii.full,
    paddingBlock: "2px",
    paddingInline: space.sm,
    textDecorationLine: "line-through",
    color: colors.textFaint,
  },
});

export const TimeTravelBar = ({
  t,
  maxT,
  deleted,
  onScrub,
  onExit,
}: {
  t: number;
  maxT: number;
  deleted: readonly { id: number; title: string }[];
  onScrub: (t: number) => void;
  onExit: () => void;
}) => (
  <div {...stylex.props(styles.bar)}>
    <span {...stylex.props(styles.label)}>⏪ Time travel</span>
    <input
      type="range"
      min={1}
      max={maxT}
      value={t}
      onChange={(e) => onScrub(Number(e.target.value))}
      {...stylex.props(styles.slider)}
    />
    <span {...stylex.props(styles.t)}>
      db.asOf({t}) / {maxT}
    </span>
    <Button size="sm" variant="primary" onClick={onExit}>
      Back to live
    </Button>
    {deleted.length > 0 && (
      <div {...stylex.props(styles.graveyard)}>
        deleted issues, still in history:
        {deleted.map((d) => (
          <span key={d.id} {...stylex.props(styles.tomb)}>
            {d.title}
          </span>
        ))}
      </div>
    )}
  </div>
);
