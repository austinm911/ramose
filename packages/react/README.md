# @ripple/react

React bindings for Ripple. The provider owns one `Client` per subtree —
connect on mount, close on unmount or when its options change — and the hooks
hand it back. Named imports, not a namespace:

```tsx
import { RippleProvider, useDb } from "@ripple/react";

<RippleProvider url={RIPPLE_URL} token={tokenSource}>
  <App />
</RippleProvider>;

const db = useDb("todos", Todos); // inside <App />
```

## API

- `<RippleProvider {...ClientOptions}>` — calls `Ripple.connect(options)`,
  memoised on `url` and the identity of `token` / `fetch` / `webSocket`;
  closes the previous client when they change and on unmount. StrictMode's
  mount → close → mount re-connects, so the tree never holds a closed client.
- `useRipple(): Client` — the client the nearest provider owns. Throws
  outside a provider.
- `useDb(name, catalog): Db` — `client.db(name, catalog)`, memoised on
  `[client, name, catalog]`, so a stable `Db` reference falls out for effect
  and memo deps.

## Two rules the memo imposes

- **`token` must be stable.** Build the `TokenSource` once —
  `Ripple.token.jwt(mint)` at module scope, or in a `useMemo` — and pass that.
  An Effect built inline in the render changes identity every render, and the
  provider re-connects every render.
- **Multi-tenant remount is React's `key`.** `<RippleProvider key={tenant}
  url={…}>` closes the old tenant's client and connects the new one when
  `tenant` changes.
