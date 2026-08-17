/** Shared primitives — every style is StyleX, themed by the token vars. */

import * as stylex from "@stylexjs/stylex";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { colors, radii, space, type } from "./theme/tokens.stylex";

// ── button ───────────────────────────────────────────────────────────────────

const button = stylex.create({
  base: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "transparent",
    borderRadius: radii.sm,
    paddingBlock: "6px",
    paddingInline: space.md,
    fontSize: type.sm,
    fontWeight: 600,
    lineHeight: 1.3,
    cursor: { default: "pointer", ":disabled": "not-allowed" },
    opacity: { default: 1, ":disabled": 0.45 },
    transition: "background-color 120ms ease, border-color 120ms ease",
    whiteSpace: "nowrap",
    userSelect: "none",
  },
  primary: {
    backgroundColor: { default: colors.accent, ":hover": colors.accentHover },
    color: colors.accentText,
  },
  ghost: {
    backgroundColor: { default: "transparent", ":hover": colors.surfaceHover },
    borderColor: colors.border,
    color: colors.text,
  },
  subtle: {
    backgroundColor: { default: "transparent", ":hover": colors.surfaceHover },
    color: colors.textMuted,
  },
  danger: {
    backgroundColor: { default: colors.dangerSoft, ":hover": colors.danger },
    color: { default: colors.danger, ":hover": "#fff" },
  },
  sm: {
    paddingBlock: "3px",
    paddingInline: space.sm,
    fontSize: type.xs,
  },
});

export const Button = ({
  variant = "ghost",
  size,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "subtle" | "danger";
  size?: "sm";
}) => (
  <button
    type="button"
    {...props}
    {...stylex.props(button.base, button[variant], size === "sm" && button.sm)}
  />
);

// ── inputs ───────────────────────────────────────────────────────────────────

const field = stylex.create({
  base: {
    width: "100%",
    backgroundColor: colors.bgRaised,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: { default: colors.border, ":focus": colors.accent },
    borderRadius: radii.sm,
    paddingBlock: "7px",
    paddingInline: space.md,
    fontSize: type.md,
    color: colors.text,
    outline: "none",
    "::placeholder": { color: colors.textFaint },
  },
  textarea: {
    resize: "vertical",
    minHeight: "70px",
    fontFamily: type.family,
  },
  label: {
    display: "block",
    fontSize: type.xs,
    fontWeight: 600,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: colors.textMuted,
    marginBottom: space.xs,
  },
  group: { marginBottom: space.lg },
});

export const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div {...stylex.props(field.group)}>
    <label {...stylex.props(field.label)}>{label}</label>
    {children}
  </div>
);

export const Input = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input {...props} {...stylex.props(field.base)} />
);

export const TextArea = (
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) => <textarea {...props} {...stylex.props(field.base, field.textarea)} />;

export const Select = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...props} {...stylex.props(field.base)} />
);

// ── dialog ───────────────────────────────────────────────────────────────────

const dialog = stylex.create({
  overlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: colors.overlay,
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    paddingTop: "12vh",
    zIndex: 50,
  },
  panel: {
    width: "min(480px, calc(100vw - 32px))",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.borderStrong,
    borderRadius: radii.lg,
    boxShadow: colors.shadow,
    padding: space.xl,
  },
  title: {
    margin: 0,
    marginBottom: space.lg,
    fontSize: type.lg,
    fontWeight: 700,
    color: colors.text,
  },
});

export const Dialog = ({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) =>
  createPortal(
    <div
      {...stylex.props(dialog.overlay)}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div {...stylex.props(dialog.panel)} role="dialog" aria-label={title}>
        <h2 {...stylex.props(dialog.title)}>{title}</h2>
        {children}
      </div>
    </div>,
    document.body,
  );

// ── badges & avatars ─────────────────────────────────────────────────────────

const badge = stylex.create({
  base: {
    display: "inline-flex",
    alignItems: "center",
    gap: space.xs,
    borderRadius: radii.full,
    paddingBlock: "1px",
    paddingInline: space.sm,
    fontSize: type.xs,
    fontWeight: 600,
    lineHeight: 1.6,
  },
  dot: {
    width: "7px",
    height: "7px",
    borderRadius: radii.full,
    flexShrink: 0,
  },
});

/** Data-driven color, so the swatch itself is an inline style. */
export const LabelBadge = ({ name, color }: { name: string; color: string }) => (
  <span
    {...stylex.props(badge.base)}
    style={{ backgroundColor: `${color}22`, color }}
  >
    <span {...stylex.props(badge.dot)} style={{ backgroundColor: color }} />
    {name}
  </span>
);

const AVATAR_HUES = [212, 262, 152, 22, 330, 190, 52];

const avatar = stylex.create({
  base: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "22px",
    height: "22px",
    borderRadius: radii.full,
    fontSize: "10px",
    fontWeight: 700,
    color: "#fff",
    flexShrink: 0,
  },
});

export const Avatar = ({ name, title }: { name: string; title?: string }) => {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.codePointAt(0)!) | 0;
  const hue = AVATAR_HUES[Math.abs(hash) % AVATAR_HUES.length];
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span
      {...stylex.props(avatar.base)}
      title={title ?? name}
      style={{ backgroundColor: `hsl(${hue} 48% 44%)` }}
    >
      {initials}
    </span>
  );
};

// ── toasts ───────────────────────────────────────────────────────────────────

interface Toast {
  readonly id: number;
  readonly kind: "info" | "error";
  readonly message: string;
}

const ToastContext = createContext<(kind: Toast["kind"], message: string) => void>(
  () => {},
);

export const useToast = () => useContext(ToastContext);

const toastStyles = stylex.create({
  stack: {
    position: "fixed",
    bottom: space.xl,
    left: "50%",
    transform: "translateX(-50%)",
    display: "flex",
    flexDirection: "column",
    gap: space.sm,
    zIndex: 100,
    alignItems: "center",
  },
  toast: {
    display: "flex",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.borderStrong,
    borderRadius: radii.md,
    boxShadow: colors.shadow,
    paddingBlock: space.sm,
    paddingInline: space.lg,
    fontSize: type.sm,
    color: colors.text,
    maxWidth: "min(520px, calc(100vw - 32px))",
  },
  error: {
    borderColor: colors.danger,
    color: colors.danger,
  },
});

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<readonly Toast[]>([]);
  const nextId = useRef(1);
  const push = useCallback((kind: Toast["kind"], message: string) => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      {toasts.length > 0 &&
        createPortal(
          <div {...stylex.props(toastStyles.stack)}>
            {toasts.map((t) => (
              <div
                key={t.id}
                {...stylex.props(toastStyles.toast, t.kind === "error" && toastStyles.error)}
              >
                {t.kind === "error" ? "⛔" : "✓"} {t.message}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
};

// ── misc ─────────────────────────────────────────────────────────────────────

const misc = stylex.create({
  spinner: {
    display: "inline-block",
    width: "16px",
    height: "16px",
    borderRadius: radii.full,
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: colors.border,
    borderTopColor: colors.accent,
    animationName: stylex.keyframes({
      from: { transform: "rotate(0deg)" },
      to: { transform: "rotate(360deg)" },
    }),
    animationDuration: "0.8s",
    animationIterationCount: "infinite",
    animationTimingFunction: "linear",
  },
  center: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    minHeight: "40vh",
    color: colors.textMuted,
    fontSize: type.md,
  },
});

export const Spinner = () => <span {...stylex.props(misc.spinner)} />;

export const Loading = ({ text = "loading…" }: { text?: string }) => (
  <div {...stylex.props(misc.center)}>
    <Spinner /> {text}
  </div>
);

/** Small helper for keyboard-dismissable overlays. */
export const useEscape = (onEscape: () => void) => {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEscape();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onEscape]);
};
