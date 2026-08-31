import * as Output from "alchemy/Output";
import * as Effect from "effect/Effect";
import type { Server } from "./Server.ts";
export declare const envKeys: (server: Pick<Server, "LogicalId">) => {
    service: string;
    url: string;
};
export declare const bindOutput: <A>(key: string, output: Output.Output<A>) => Effect.Effect<Effect.Effect<A>>;
export declare const required: (key: string, accessor: Effect.Effect<string>) => Effect.Effect<string>;
//# sourceMappingURL=ServerRuntime.d.ts.map