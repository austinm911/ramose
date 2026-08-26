/**
 * Focus-namespace membership for query stages.
 *
 * The constraint is membership in the focus's stamped field map — the
 * idents of `N.fields` (plus `:db/id`) — not ident-namespace-prefix
 * equality. A future traits layer can stamp `Issue.tags` with ident
 * `:taggable/tags` and still belong to `Issue`.
 */
export {};
//# sourceMappingURL=focus.js.map