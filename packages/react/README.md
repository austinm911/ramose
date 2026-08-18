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
- `useTransact(options?): Transact` — one hook for running writes (any
  Effect with `R = never`, really) from event handlers:

  ```tsx
  const tx = useTransact({ onError: (e) => toast(errorMessage(e)) });

  <button
    disabled={tx.pending}
    onClick={() => void tx.run(db.transact([{ ":todo/title": title }]))}
  />;
  ```

  `run` resolves to the `Exit` instead of throwing, so handlers stay
  `void`-safe; `pending` is true while any run is in flight; `error` holds
  the last failure's error (not the cause) for inline rendering, clears on
  the next successful run or `clearError()`, and `onError` fires per
  failure. It takes no `db` argument — it runs whatever Effect the caller
  built, so it composes with a module-singleton `Db` just as well as with
  `useDb`, and works without a provider. An effect settling after unmount
  touches no state.
- `errorMessage(error): string` — `e.message ?? e._tag ?? String(e)`, the
  one-liner every toast wants. Every `DbError` carries a `message`, so a
  policy denial (`Unauthorized`) toasts its server-written message; bare
  tagged errors fall back to the tag.

## Two rules the memo imposes

- **`token` must be stable.** Build the `TokenSource` once —
  `Ripple.token.jwt(mint)` at module scope, or in a `useMemo` — and pass that.
  An Effect built inline in the render changes identity every render, and the
  provider re-connects every render.
- **Multi-tenant remount is React's `key`.** `<RippleProvider key={tenant}
  url={…}>` closes the old tenant's client and connects the new one when
  `tenant` changes.
