/**
 * @internal Service-binding source. The public surface is
 * {@link import("./Databases.ts").layer}, which auto-picks this hop when
 * the host is a Worker.
 */
import * as Effect from "effect/Effect";
import type { Server } from "./Server.ts";
import type { ServerSource } from "./Source.ts";
/** The origin the server never looks at — service-binding dispatch ignores the host. */
export declare const SERVICE_ORIGIN = "https://ramose.internal";
/** The service-binding {@link ServerSource}: `env[LogicalId].fetch`, token from env. */
export declare const makeBindingSource: (env: Record<string, any>, server: Server) => Effect.Effect<ServerSource>;
//# sourceMappingURL=ServerBinding.d.ts.map