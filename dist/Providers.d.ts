import * as Provider from "alchemy/Provider";
import * as Layer from "effect/Layer";
declare const Providers_base: Provider.ProviderCollection<Providers, "Ramose">;
export declare class Providers extends Providers_base {
}
export declare const providers: () => Layer.Layer<Providers, never, import("alchemy").AlchemyContext>;
export {};
//# sourceMappingURL=Providers.d.ts.map