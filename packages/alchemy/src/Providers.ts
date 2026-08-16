/**
 * The Ripple provider collection. Merge it into the stack alongside the
 * cloud provider layers.
 *
 * @example
 * ```typescript
 * import * as Alchemy from "alchemy";
 * import * as Cloudflare from "alchemy/Cloudflare";
 * import * as Ripple from "@ripple/alchemy";
 * import * as Layer from "effect/Layer";
 *
 * export default Alchemy.Stack("ripple", {
 *   providers: Layer.mergeAll(Cloudflare.providers(), Ripple.providers()),
 *   state: Cloudflare.state(),
 * }, Effect.gen(function* () { … }));
 * ```
 */

import * as Provider from "alchemy/Provider";
import * as Layer from "effect/Layer";
import { System, SystemProvider } from "./System.ts";

export class Providers extends Provider.ProviderCollection<Providers>()(
  "Ripple",
) {}

export type ProviderRequirements = Layer.Services<ReturnType<typeof providers>>;

export const providers = () =>
  Layer.effect(Providers, Provider.collection([System])).pipe(
    Layer.provide(SystemProvider()),
    Layer.orDie,
  );
