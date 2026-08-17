/**
 * The immutability demo. The slider re-renders the whole board through
 * `db.asOf(t)` — a pure view, no snapshots, no copies — and the graveyard is
 * `db.history` minus the present: issues whose datoms exist only in the past.
 */

import * as stylex from "@stylexjs/stylex";
import { colors, radii, space, type } from "../theme/tokens.stylex";
import { Button, Icon } from "../ui.tsx";

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
    boxShadow: `0 0 0 4px color-mix(in srgb, ${colors.accent} 8%, transparent)`,
  },
  label: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    fontSize: type.sm,
    fontWeight: 700,
    color: colors.text,
    whiteSpace: "nowrap",
  },
  sliderWrap: {
    flexGrow: 1,
    minWidth: "200px",
    display: "flex",
    alignItems: "center",
    gap: space.sm,
  },
  slider: {
    flexGrow: 1,
    accentColor: colors.accent,
    cursor: "pointer",
    height: "20px",
    outline: "none",
    borderRadius: radii.full,
    boxShadow: { default: "none", ":focus-visible": `0 0 0 3px ${colors.ring}` },
  },
  bound: {
    fontFamily: type.mono,
    fontSize: type.xs,
    color: colors.textFaint,
    fontVariantNumeric: "tabular-nums",
  },
  t: {
    fontFamily: type.mono,
    fontSize: type.sm,
    fontWeight: 500,
    color: colors.text,
    whiteSpace: "nowrap",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingBlock: "3px",
    paddingInline: space.sm,
    fontVariantNumeric: "tabular-nums",
  },
  tDim: { color: colors.textFaint },
  graveyard: {
    display: "flex",
    alignItems: "center",
    gap: space.sm,
    flexBasis: "100%",
    flexWrap: "wrap",
    fontSize: type.xs,
    color: colors.textMuted,
  },
  graveyardLabel: { display: "inline-flex", alignItems: "center", gap: "5px", fontWeight: 600 },
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
  <div {...stylex.props(styles.bar)} role="region" aria-label="Time travel">
    <span {...stylex.props(styles.label)}>
      <Icon name="history" size={15} /> Time travel
    </span>
    <div {...stylex.props(styles.sliderWrap)}>
      <span {...stylex.props(styles.bound)}>t=1</span>
      <input
        type="range"
        min={1}
        max={maxT}
        value={t}
        aria-label="Basis transaction"
        onChange={(e) => onScrub(Number(e.target.value))}
        {...stylex.props(styles.slider)}
      />
      <span {...stylex.props(styles.bound)}>t={maxT}</span>
    </div>
    <span {...stylex.props(styles.t)}>
      db.asOf(<strong>{t}</strong>)
      <span {...stylex.props(styles.tDim)}> / {maxT}</span>
    </span>
    <Button size="sm" variant="primary" onClick={onExit}>
      <Icon name="bolt" size={12} /> Back to live
    </Button>
    {deleted.length > 0 && (
      <div {...stylex.props(styles.graveyard)}>
        <span {...stylex.props(styles.graveyardLabel)}>
          <Icon name="trash" size={12} /> Deleted, still in history:
        </span>
        {deleted.map((d) => (
          <span key={d.id} {...stylex.props(styles.tomb)}>
            {d.title}
          </span>
        ))}
      </div>
    )}
  </div>
);
