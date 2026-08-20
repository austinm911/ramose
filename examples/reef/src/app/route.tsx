/**
 * Path-based SPA routes so refresh, back/forward and a shared URL land on the
 * same page. History API only — no router library. The auth Worker already
 * serves unknown paths as `index.html` (`notFoundHandling:
 * "single-page-application"`); Vite does the same in dev.
 *
 *   /                      workspace picker
 *   /:slug                 that workspace's board
 *   /:slug/issues/:id      board with the issue panel open
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from "react";
import { isWorkspaceSlug } from "../domain/shared.ts";

export type Route =
  | { readonly kind: "home" }
  | { readonly kind: "board"; readonly slug: string; readonly issueId?: number };

export const parsePath = (pathname: string): Route => {
  const parts = pathname.split("/").filter((p) => p !== "");
  if (parts.length === 0) return { kind: "home" };
  const slug = parts[0]!;
  if (!isWorkspaceSlug(slug)) return { kind: "home" };
  if (
    parts.length === 3 &&
    parts[1] === "issues" &&
    /^[1-9]\d*$/.test(parts[2]!)
  ) {
    return { kind: "board", slug, issueId: Number(parts[2]) };
  }
  return { kind: "board", slug };
};

export const hrefOf = (route: Route): string => {
  if (route.kind === "home") return "/";
  return route.issueId === undefined
    ? `/${route.slug}`
    : `/${route.slug}/issues/${route.issueId}`;
};

export type Navigate = (to: Route, options?: { replace?: boolean }) => void;

const RouteContext = createContext<{
  route: Route;
  navigate: Navigate;
}>({
  route: { kind: "home" },
  navigate: () => {},
});

export const useRoute = () => useContext(RouteContext);

const pathNow = (): string =>
  typeof window === "undefined" ? "/" : window.location.pathname;

export const RouteProvider = ({ children }: { children: ReactNode }) => {
  const [path, setPath] = useState(pathNow);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback<Navigate>((to, options) => {
    const href = hrefOf(to);
    if (href === window.location.pathname) {
      setPath(href);
      return;
    }
    if (options?.replace) history.replaceState(null, "", href);
    else history.pushState(null, "", href);
    setPath(href);
  }, []);

  useEffect(() => {
    const canonical = hrefOf(parsePath(path));
    if (canonical === path) return;
    history.replaceState(null, "", canonical);
    setPath(canonical);
  }, [path]);

  return (
    <RouteContext.Provider value={{ route: parsePath(path), navigate }}>
      {children}
    </RouteContext.Provider>
  );
};

/**
 * The selected issue is the URL. First open pushes so Back returns to the
 * board; switching or closing replaces, so Back does not replay the panel.
 */
export const useBoardSelection = (
  slug: string,
): [number | null, (id: number | null) => void] => {
  const { route, navigate } = useRoute();
  const selected =
    route.kind === "board" && route.slug === slug ? (route.issueId ?? null) : null;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const setSelected = useCallback(
    (id: number | null) => {
      navigate(
        { kind: "board", slug, issueId: id ?? undefined },
        { replace: selectedRef.current !== null || id === null },
      );
    },
    [navigate, slug],
  );
  return [selected, setSelected];
};

export const Link = ({
  to,
  children,
  onClick,
  ...rest
}: { to: Route } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) => {
  const { navigate } = useRoute();
  return (
    <a
      href={hrefOf(to)}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(e);
        if (e.defaultPrevented) return;
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
          return;
        }
        e.preventDefault();
        navigate(to);
      }}
      {...rest}
    >
      {children}
    </a>
  );
};
