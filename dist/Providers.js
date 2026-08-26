/**
 * The Ramose provider collection. Merge it into the stack alongside the
 * cloud provider layers.
 *
 * @example
 * ```typescript
 * import * as Alchemy from "alchemy";
 * import * as Cloudflare from "alchemy/Cloudflare";
 * import * as Ramose from "ramose";
 * import * as Layer from "effect/Layer";
 *
 * export default Alchemy.Stack("ramose", {
 *   providers: Layer.mergeAll(Cloudflare.providers(), Ramose.providers()),
 *   state: Cloudflare.state(),
 * }, Effect.gen(function* () { … }));
 * ```
 */
import * as Provider from "alchemy/Provider";
import * as Layer from "effect/Layer";
import { Database, DatabaseProvider } from "./Database.js";
import { Server, ServerProvider } from "./Server.js";
export class Providers extends Provider.ProviderCollection()("Ramose") {
}
export const providers = () => Layer.effect(Providers, Provider.collection([Server, Database])).pipe(Layer.provide(Layer.mergeAll(ServerProvider(), DatabaseProvider())), Layer.orDie);
//# sourceMappingURL=Providers.js.map