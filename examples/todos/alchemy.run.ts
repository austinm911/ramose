/** bun alchemy dev examples/todos/alchemy.run.ts
 *  VITE_RIPPLE_URL=http://localhost:8787 bunx vite examples/todos
 */

import * as Ripple from "@ripple/alchemy";
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Server } from "./resources.ts";
import { Todos } from "./schema.ts";

/**
 * The one place the catalog is installed: `install()` as a deploy-time
 * resource, ordered after the server it names. `db.install()` is an ordinary
 * idempotent transaction, so a redeploy costs one no-op tx.
 */
export const TodosDb = Ripple.Database("todos", { server: Server, catalog: Todos });

export default Alchemy.Stack(
  "ripple-todos",
  {
    providers: Layer.mergeAll(Cloudflare.providers(), Ripple.providers()),
    state: Alchemy.localState(),
  },
  Effect.gen(function* () {
    const server = yield* Server;
    yield* TodosDb;
    return { peerUrl: server.url };
  }),
);
