/**
 * Pick, create or join a workspace. Creating one is the multi-tenancy demo:
 * a Better Auth org + `db.install()` on a brand-new database name — no
 * provisioning, no deploy, ready in one round trip.
 */

import * as stylex from "@stylexjs/stylex";
import { useEffect, useState } from "react";
import {
  acceptInvitation,
  authClient,
  createWorkspace,
  listMyInvitations,
  listWorkspaces,
  type Invitation,
  type OrgSummary,
  type SessionUser,
} from "../auth.ts";
import { SLUG_RE, slugify } from "../../shared.ts";
import { colors, radii, space, type } from "../theme/tokens.stylex";
import { Button, Field, Input, Loading, Spinner, useToast } from "../ui.tsx";

const styles = stylex.create({
  page: {
    flexGrow: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    paddingTop: "10vh",
    paddingInline: space.xl,
    gap: space.xl,
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: space.md,
    width: "min(560px, 100%)",
    justifyContent: "space-between",
  },
  headerText: { display: "flex", flexDirection: "column", gap: space.xxs },
  hello: { margin: 0, fontSize: type.xl, fontWeight: 700 },
  sub: { margin: 0, color: colors.textMuted, fontSize: type.sm },
  card: {
    width: "min(560px, 100%)",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: space.xl,
  },
  cardTitle: {
    margin: 0,
    marginBottom: space.md,
    fontSize: type.sm,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: colors.textMuted,
  },
  list: { display: "flex", flexDirection: "column", gap: space.sm },
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
    paddingBlock: space.sm,
    paddingInline: space.md,
    borderRadius: radii.md,
    backgroundColor: { default: colors.bgRaised, ":hover": colors.surfaceHover },
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
  },
  rowName: { fontWeight: 600 },
  rowSlug: {
    color: colors.textFaint,
    fontFamily: type.mono,
    fontSize: type.xs,
  },
  empty: { color: colors.textFaint, fontSize: type.sm, margin: 0 },
  createRow: { display: "flex", gap: space.md, alignItems: "flex-end" },
  grow: { flexGrow: 1 },
  slugPreview: {
    marginTop: space.xs,
    fontSize: type.xs,
    color: colors.textFaint,
    fontFamily: type.mono,
  },
});

export const WorkspacesScreen = ({
  user,
  opening,
  onOpen,
  onCreate,
}: {
  user: SessionUser;
  opening: string | null;
  onOpen: (slug: string) => void;
  onCreate: (slug: string) => void;
}) => {
  const toast = useToast();
  const [orgs, setOrgs] = useState<readonly OrgSummary[] | null>(null);
  const [invites, setInvites] = useState<readonly Invitation[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const slug = slugify(name);

  const refresh = async () => {
    // Invitations are best-effort: some Better Auth configurations gate the
    // route (e.g. unverified email → 403) and that must not block the picker.
    const [os, is] = await Promise.all([
      listWorkspaces(),
      listMyInvitations().catch(() => [] as readonly Invitation[]),
    ]);
    setOrgs(os);
    setInvites(is.filter((i) => i.status === "pending"));
  };

  useEffect(() => {
    refresh().catch((err) =>
      toast("error", err instanceof Error ? err.message : String(err)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = async () => {
    if (!SLUG_RE.test(slug)) {
      toast("error", "workspace names need at least two letters or digits");
      return;
    }
    setBusy(true);
    try {
      await createWorkspace(name.trim(), slug);
      onCreate(slug);
    } catch (err) {
      toast("error", err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  const accept = async (invite: Invitation) => {
    setBusy(true);
    try {
      await acceptInvitation(invite.id);
      const all = await listWorkspaces();
      setOrgs(all);
      const org = all.find((o) => o.id === invite.organizationId);
      if (org) onOpen(org.slug);
      else await refresh();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (orgs === null) return <Loading text="loading workspaces…" />;

  return (
    <div {...stylex.props(styles.page)}>
      <div {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.headerText)}>
          <h1 {...stylex.props(styles.hello)}>Hi, {user.name} 👋</h1>
          <p {...stylex.props(styles.sub)}>
            Every workspace below is its own Ripple database.
          </p>
        </div>
        <Button variant="subtle" onClick={() => void authClient.signOut()}>
          Sign out
        </Button>
      </div>

      {invites.length > 0 && (
        <section {...stylex.props(styles.card)}>
          <h2 {...stylex.props(styles.cardTitle)}>Invitations</h2>
          <div {...stylex.props(styles.list)}>
            {invites.map((invite) => (
              <div key={invite.id} {...stylex.props(styles.row)}>
                <span {...stylex.props(styles.rowName)}>
                  {invite.organizationName ?? invite.organizationId}
                  <span {...stylex.props(styles.rowSlug)}> as {invite.role}</span>
                </span>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={busy}
                  onClick={() => void accept(invite)}
                >
                  Accept &amp; open
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section {...stylex.props(styles.card)}>
        <h2 {...stylex.props(styles.cardTitle)}>Your workspaces</h2>
        {orgs.length === 0 ? (
          <p {...stylex.props(styles.empty)}>
            None yet — create one below. It takes one transaction.
          </p>
        ) : (
          <div {...stylex.props(styles.list)}>
            {orgs.map((org) => (
              <div key={org.id} {...stylex.props(styles.row)}>
                <span {...stylex.props(styles.rowName)}>
                  {org.name}{" "}
                  <span {...stylex.props(styles.rowSlug)}>db/{org.slug}</span>
                </span>
                <Button
                  size="sm"
                  disabled={opening !== null}
                  onClick={() => onOpen(org.slug)}
                >
                  {opening === org.slug ? <Spinner /> : "Open"}
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section {...stylex.props(styles.card)}>
        <h2 {...stylex.props(styles.cardTitle)}>New workspace</h2>
        <form
          {...stylex.props(styles.createRow)}
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <div {...stylex.props(styles.grow)}>
            <Field label="Name">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Coral Team"
                required
              />
            </Field>
            {slug !== "" && (
              <div {...stylex.props(styles.slugPreview)}>
                → ripple.db(&quot;{slug}&quot;) + install()
              </div>
            )}
          </div>
          <Field label="&nbsp;">
            <Button variant="primary" type="submit" disabled={busy || opening !== null}>
              {busy ? <Spinner /> : "Create"}
            </Button>
          </Field>
        </form>
      </section>
    </div>
  );
};
