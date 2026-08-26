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
declare const Providers_base: Provider.ProviderCollection<Providers, "Ramose">;
export declare class Providers extends Providers_base {
}
export declare const providers: () => Layer.Layer<Providers, never, import("alchemy").AlchemyContext>;
export {};
//# sourceMappingURL=Providers.d.ts.map