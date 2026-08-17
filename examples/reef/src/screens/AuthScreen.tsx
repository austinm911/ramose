/** Email + password sign in / sign up against the Better Auth Worker. */

import * as stylex from "@stylexjs/stylex";
import { useState } from "react";
import { authClient } from "../auth.ts";
import { colors, radii, space, type } from "../theme/tokens.stylex";
import { Button, Field, Input, Spinner, useToast } from "../ui.tsx";

const styles = stylex.create({
  page: {
    flexGrow: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: space.xl,
  },
  card: {
    width: "min(400px, 100%)",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
    borderRadius: radii.lg,
    boxShadow: colors.shadowSm,
    padding: space.xxl,
  },
  brand: {
    display: "flex",
    alignItems: "baseline",
    gap: space.sm,
    marginBottom: space.xs,
  },
  logo: {
    fontSize: type.xxl,
    fontWeight: 800,
    letterSpacing: "-0.02em",
    color: colors.text,
    margin: 0,
  },
  wave: { fontSize: type.xl },
  tagline: {
    margin: 0,
    marginBottom: space.xl,
    color: colors.textMuted,
    fontSize: type.sm,
    lineHeight: 1.5,
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
    background: "none",
    borderWidth: 0,
    padding: 0,
    color: colors.accent,
    cursor: "pointer",
    fontSize: type.sm,
    fontWeight: 600,
  },
  // grid stretches its one child to the full card width
  submitRow: { display: "grid", marginTop: space.xl },
});

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
      <form
        {...stylex.props(styles.card)}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div {...stylex.props(styles.brand)}>
          <h1 {...stylex.props(styles.logo)}>Reef</h1>
          <span {...stylex.props(styles.wave)}>🌊</span>
        </div>
        <p {...stylex.props(styles.tagline)}>
          A live, multi-tenant issue tracker where every workspace is its own
          Ripple database — reactive queries, per-datom auth, and time travel
          included.
        </p>
        {mode === "up" && (
          <Field label="Name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ada Lovelace"
              autoComplete="name"
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
            {busy ? <Spinner /> : mode === "up" ? "Create account" : "Sign in"}
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
      </form>
    </div>
  );
};
