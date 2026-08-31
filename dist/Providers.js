import * as Provider from "alchemy/Provider";
import * as Layer from "effect/Layer";
import { Database, DatabaseProvider } from "./Database.js";
import { Server, ServerProvider } from "./Server.js";
export class Providers extends Provider.ProviderCollection()("Ramose") {
}
// @effect-diagnostics-next-line lazyEffect:off
export const providers = () => Layer.effect(Providers, Provider.collection([Server, Database])).pipe(Layer.provide(Layer.mergeAll(ServerProvider(), DatabaseProvider())), Layer.orDie);
//# sourceMappingURL=Providers.js.map