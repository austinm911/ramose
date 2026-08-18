/** Email + password sign in / sign up against the Better Auth Worker. */

import * as stylex from "@stylexjs/stylex";
import { useState } from "react";
import { ThemeToggle } from "../App.tsx";
import { authClient } from "../auth.ts";
import { colors, radii, space, type } from "../theme/tokens.stylex";
import {
  Button,
  Field,
  Icon,
  Input,
  Logo,
  Spinner,
  useToast,
  type IconName,
} from "../ui.tsx";

const styles = stylex.create({
  page: {
    position: "relative",
    flexGrow: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: space.xl,
    overflow: "hidden",
  },
  // Two soft radial glows behind the card; purely decorative. Gradients
  // rather than `filter: blur` — Chrome clips blurred layers to a hard rect.
  glow: {
    position: "absolute",
    pointerEvents: "none",
  },
  glowA: {
    width: "820px",
    height: "820px",
    top: "-300px",
    left: "calc(50% - 640px)",
    backgroundImage: `radial-gradient(closest-side, ${colors.glowA}, transparent)`,
  },
  glowB: {
    width: "720px",
    height: "720px",
    bottom: "-300px",
    right: "calc(50% - 600px)",
    backgroundImage: `radial-gradient(closest-side, ${colors.glowB}, transparent)`,
  },
  themeCorner: { position: "absolute", top: space.lg, right: space.lg },
  card: {
    position: "relative",
    width: "min(420px, 100%)",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
    borderRadius: radii.xl,
    boxShadow: colors.shadow,
    padding: space.xxl,
  },
  brand: { marginBottom: space.lg },
  heading: {
    margin: 0,
    marginTop: space.lg,
    fontSize: type.xl,
    fontWeight: 700,
    letterSpacing: "-0.01em",
    color: colors.text,
  },
  tagline: {
    margin: 0,
    marginTop: space.xs,
    marginBottom: space.xl,
    color: colors.textMuted,
    fontSize: type.sm,
    lineHeight: 1.55,
  },
  switchRow: {
    marginTop: space.lg,
    fontSize: type.sm,
    color: colors.textMuted,
    display: "flex",
    gap: space.xs,
    justifyContent: "center",
  },
  link: {
    backgroundColor: "transparent",
    backgroundImage: "none",
    borderWidth: 0,
    padding: 0,
    color: { default: colors.accent, ":hover": colors.accentHover },
    cursor: "pointer",
    fontSize: type.sm,
    fontWeight: 600,
    textDecorationLine: { default: "none", ":hover": "underline" },
    outline: "none",
    borderRadius: radii.xs,
    boxShadow: { default: "none", ":focus-visible": `0 0 0 3px ${colors.ring}` },
  },
  // grid stretches its one child to the full card width
  submitRow: { display: "grid", marginTop: space.xl },
  features: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: space.sm,
    marginTop: space.xl,
    paddingTop: space.lg,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: colors.border,
  },
  feature: {
    display: "flex",
    flexDirection: "column",
    gap: "3px",
    fontSize: type.xs,
    color: colors.textFaint,
    lineHeight: 1.4,
  },
  featureHead: {
    display: "flex",
    alignItems: "center",
    gap: "5px",
    color: colors.textMuted,
    fontWeight: 600,
    fontSize: type.xs,
  },
});

const FEATURES: readonly { icon: IconName; title: string; body: string }[] = [
  { icon: "bolt", title: "Live", body: "db.live streams every board." },
  { icon: "database", title: "Multi-tenant", body: "One database per workspace." },
  { icon: "history", title: "Time travel", body: "db.asOf(t) — nothing copied." },
];

export const AuthScreen = () => {
  const [mode, setMode] = useState<"in" | "up">("up");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const submit = async () => {
    setBusy(true);
    try {
      const result =
        mode === "up"
          ? await authClient.signUp.email({ name, email, password })
          : await authClient.signIn.email({ email, password });
      if (result.error) {
        toast("error", result.error.message ?? "authentication failed");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div {...stylex.props(styles.page)}>
      <div {...stylex.props(styles.glow, styles.glowA)} />
      <div {...stylex.props(styles.glow, styles.glowB)} />
      <div {...stylex.props(styles.themeCorner)}>
        <ThemeToggle />
      </div>
      <form
        {...stylex.props(styles.card)}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div {...stylex.props(styles.brand)}>
          <Logo size={34} />
        </div>
        <h1 {...stylex.props(styles.heading)}>
          {mode === "up" ? "Create your account" : "Welcome back"}
        </h1>
        <p {...stylex.props(styles.tagline)}>
          A live, multi-tenant issue tracker where every workspace is its own
          Ramose database.
        </p>
        {mode === "up" && (
          <Field label="Name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ada Lovelace"
              autoComplete="name"
              autoFocus
              required
            />
          </Field>
        )}
        <Field label="Email">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ada@example.com"
            autoComplete="email"
            required
          />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="at least 8 characters"
            autoComplete={mode === "up" ? "new-password" : "current-password"}
            minLength={8}
            required
          />
        </Field>
        <div {...stylex.props(styles.submitRow)}>
          <Button variant="primary" type="submit" disabled={busy}>
            {busy ? (
              <Spinner onAccent />
            ) : (
              <>
                {mode === "up" ? "Create account" : "Sign in"}
                <Icon name="arrowRight" size={14} />
              </>
            )}
          </Button>
        </div>
        <div {...stylex.props(styles.switchRow)}>
          {mode === "up" ? "Already have an account?" : "New here?"}
          <button
            type="button"
            {...stylex.props(styles.link)}
            onClick={() => setMode(mode === "up" ? "in" : "up")}
          >
            {mode === "up" ? "Sign in" : "Create one"}
          </button>
        </div>
        <div {...stylex.props(styles.features)}>
          {FEATURES.map((f) => (
            <div key={f.title} {...stylex.props(styles.feature)}>
              <span {...stylex.props(styles.featureHead)}>
                <Icon name={f.icon} size={12} />
                {f.title}
              </span>
              {f.body}
            </div>
          ))}
        </div>
      </form>
    </div>
  );
};
