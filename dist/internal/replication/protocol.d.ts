import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
export declare const REPLICATION_PROTOCOL_VERSION: 1;
export declare const REPLICA_STORAGE_VERSION: 3;
export declare const INITIAL_REPLICA_BUILD_ID: "ramose-client-v1";
export declare const MAX_REPLICATION_REQUEST_BYTES = 65536;
export declare const MAX_REPLICATION_FRAME_BYTES = 1100000;
export declare const MAX_REPLICATION_PATH_SEGMENTS = 1024;
export declare const MAX_REPLICATION_STRING_BYTES = 131072;
export declare const MAX_REPLICATION_RAW_VALUE_PART_BYTES = 98304;
export declare const MAX_REPLICATION_DATOMS_PER_SNAPSHOT_CHUNK = 16;
export declare const MAX_REPLICATION_DATOMS_PER_CHANGE = 256;
export declare const MAX_REPLICATION_CHANGE_BYTES = 1048576;
export declare const REPLICATION_KEEPALIVE_INTERVAL_MS = 15000;
export declare const OpaqueReplicationId: Schema.String;
export type OpaqueReplicationId = typeof OpaqueReplicationId.Type;
export declare const ReplicationScope: Schema.Struct<{
    readonly type: Schema.Literal<"database">;
}>;
export type ReplicationScope = typeof ReplicationScope.Type;
export declare const ActivationRequest: Schema.Struct<{
    readonly type: Schema.Literal<"Activate">;
    readonly protocol: Schema.Natural;
    readonly graphPath: Schema.$Array<Schema.String>;
    readonly scope: Schema.Struct<{
        readonly type: Schema.Literal<"database">;
    }>;
    readonly readCompatibilityHash: Schema.brand<Schema.String, "ReadCompatibilityHash">;
    readonly resumeRevision: Schema.optionalKey<Schema.String>;
}>;
export type ActivationRequest = typeof ActivationRequest.Type;
export declare const ReplicationIdentity: Schema.Struct<{
    readonly version: Schema.Literal<1>;
    readonly server: Schema.String;
    readonly principal: Schema.String;
    readonly database: Schema.String;
    readonly catalog: Schema.String;
    readonly readView: Schema.String;
    readonly readCompatibilityHash: Schema.brand<Schema.String, "ReadCompatibilityHash">;
    readonly graphLineage: Schema.$Array<Schema.String>;
    readonly authenticator: Schema.String;
}>;
export type ReplicationIdentity = typeof ReplicationIdentity.Type;
export declare const SEALED_ENTITY_HANDLE_PATTERN: RegExp;
export declare const SealedEntityHandle: Schema.String;
export type SealedEntityHandle = typeof SealedEntityHandle.Type;
export declare const EntityHandleBinding: Schema.Struct<{
    readonly entity: Schema.String;
    readonly handle: Schema.String;
}>;
export type EntityHandleBinding = typeof EntityHandleBinding.Type;
export declare const SnapshotStringValuePart: Schema.Struct<{
    readonly type: Schema.Literal<"string-part">;
    readonly identity: Schema.String;
    readonly index: Schema.Natural;
    readonly chunks: Schema.Natural;
    readonly value: Schema.String;
}>;
export type SnapshotStringValuePart = typeof SnapshotStringValuePart.Type;
export declare const SnapshotBytesValuePart: Schema.Struct<{
    readonly type: Schema.Literal<"bytes-part">;
    readonly identity: Schema.String;
    readonly index: Schema.Natural;
    readonly chunks: Schema.Natural;
    readonly value: Schema.String;
}>;
export type SnapshotBytesValuePart = typeof SnapshotBytesValuePart.Type;
export declare const LogicalValue: Schema.Union<readonly [Schema.Struct<{
    readonly type: Schema.Literal<"long">;
    readonly value: Schema.Int;
}>, Schema.Struct<{
    readonly type: Schema.Literal<"double">;
    readonly value: Schema.Union<readonly [Schema.Finite, Schema.Literals<readonly ["positive-infinity", "negative-infinity"]>]>;
}>, Schema.Struct<{
    readonly type: Schema.Literal<"string">;
    readonly value: Schema.String;
}>, Schema.Struct<{
    readonly type: Schema.Literal<"boolean">;
    readonly value: Schema.Boolean;
}>, Schema.Struct<{
    readonly type: Schema.Literal<"ref">;
    readonly value: Schema.String;
}>, Schema.Struct<{
    readonly type: Schema.Literal<"uuid">;
    readonly value: Schema.String;
}>, Schema.Struct<{
    readonly type: Schema.Literal<"instant">;
    readonly value: Schema.Int;
}>, Schema.Struct<{
    readonly type: Schema.Literal<"bytes">;
    readonly value: Schema.String;
}>]>;
export type LogicalValue = typeof LogicalValue.Type;
export declare const SnapshotLogicalValue: Schema.Union<readonly [Schema.Union<readonly [Schema.Struct<{
    readonly type: Schema.Literal<"long">;
    readonly value: Schema.Int;
}>, Schema.Struct<{
    readonly type: Schema.Literal<"double">;
    readonly value: Schema.Union<readonly [Schema.Finite, Schema.Literals<readonly ["positive-infinity", "negative-infinity"]>]>;
}>, Schema.Struct<{
    readonly type: Schema.Literal<"string">;
    readonly value: Schema.String;
}>, Schema.Struct<{
    readonly type: Schema.Literal<"boolean">;
    readonly value: Schema.Boolean;
}>, Schema.Struct<{
    readonly type: Schema.Literal<"ref">;
    readonly value: Schema.String;
}>, Schema.Struct<{
    readonly type: Schema.Literal<"uuid">;
    readonly value: Schema.String;
}>, Schema.Struct<{
    readonly type: Schema.Literal<"instant">;
    readonly value: Schema.Int;
}>, Schema.Struct<{
    readonly type: Schema.Literal<"bytes">;
    readonly value: Schema.String;
}>]>, Schema.Struct<{
    readonly type: Schema.Literal<"string-part">;
    readonly identity: Schema.String;
    readonly index: Schema.Natural;
    readonly chunks: Schema.Natural;
    readonly value: Schema.String;
}>, Schema.Struct<{
    readonly type: Schema.Literal<"bytes-part">;
    readonly identity: Schema.String;
    readonly index: Schema.Natural;
    readonly chunks: Schema.Natural;
    readonly value: Schema.String;
}>]>;
export type SnapshotLogicalValue = typeof SnapshotLogicalValue.Type;
export declare const LogicalDatom: Schema.Struct<{
    readonly entity: Schema.String;
    readonly field: Schema.String;
    readonly value: Schema.Union<readonly [Schema.Struct<{
        readonly type: Schema.Literal<"long">;
        readonly value: Schema.Int;
    }>, Schema.Struct<{
        readonly type: Schema.Literal<"double">;
        readonly value: Schema.Union<readonly [Schema.Finite, Schema.Literals<readonly ["positive-infinity", "negative-infinity"]>]>;
    }>, Schema.Struct<{
        readonly type: Schema.Literal<"string">;
        readonly value: Schema.String;
    }>, Schema.Struct<{
        readonly type: Schema.Literal<"boolean">;
        readonly value: Schema.Boolean;
    }>, Schema.Struct<{
        readonly type: Schema.Literal<"ref">;
        readonly value: Schema.String;
    }>, Schema.Struct<{
        readonly type: Schema.Literal<"uuid">;
        readonly value: Schema.String;
    }>, Schema.Struct<{
        readonly type: Schema.Literal<"instant">;
        readonly value: Schema.Int;
    }>, Schema.Struct<{
        readonly type: Schema.Literal<"bytes">;
        readonly value: Schema.String;
    }>]>;
    readonly op: Schema.Literals<readonly ["add", "retract"]>;
}>;
export type LogicalDatom = typeof LogicalDatom.Type;
export declare const SnapshotDatom: Schema.Struct<{
    readonly entity: Schema.String;
    readonly field: Schema.String;
    readonly value: Schema.Union<readonly [Schema.Union<readonly [Schema.Struct<{
        readonly type: Schema.Literal<"long">;
        readonly value: Schema.Int;
    }>, Schema.Struct<{
        readonly type: Schema.Literal<"double">;
        readonly value: Schema.Union<readonly [Schema.Finite, Schema.Literals<readonly ["positive-infinity", "negative-infinity"]>]>;
    }>, Schema.Struct<{
        readonly type: Schema.Literal<"string">;
        readonly value: Schema.String;
    }>, Schema.Struct<{
        readonly type: Schema.Literal<"boolean">;
        readonly value: Schema.Boolean;
    }>, Schema.Struct<{
        readonly type: Schema.Literal<"ref">;
        readonly value: Schema.String;
    }>, Schema.Struct<{
        readonly type: Schema.Literal<"uuid">;
        readonly value: Schema.String;
    }>, Schema.Struct<{
        readonly type: Schema.Literal<"instant">;
        readonly value: Schema.Int;
    }>, Schema.Struct<{
        readonly type: Schema.Literal<"bytes">;
        readonly value: Schema.String;
    }>]>, Schema.Struct<{
        readonly type: Schema.Literal<"string-part">;
        readonly identity: Schema.String;
        readonly index: Schema.Natural;
        readonly chunks: Schema.Natural;
        readonly value: Schema.String;
    }>, Schema.Struct<{
        readonly type: Schema.Literal<"bytes-part">;
        readonly identity: Schema.String;
        readonly index: Schema.Natural;
        readonly chunks: Schema.Natural;
        readonly value: Schema.String;
    }>]>;
    readonly op: Schema.Literal<"add">;
}>;
export type SnapshotDatom = typeof SnapshotDatom.Type;
export declare const SnapshotStart: Schema.Struct<{
    readonly type: Schema.Literal<"SnapshotStart">;
    readonly protocol: Schema.Literal<1>;
    readonly identity: Schema.Struct<{
        readonly version: Schema.Literal<1>;
        readonly server: Schema.String;
        readonly principal: Schema.String;
        readonly database: Schema.String;
        readonly catalog: Schema.String;
        readonly readView: Schema.String;
        readonly readCompatibilityHash: Schema.brand<Schema.String, "ReadCompatibilityHash">;
        readonly graphLineage: Schema.$Array<Schema.String>;
        readonly authenticator: Schema.String;
    }>;
    readonly snapshot: Schema.String;
    readonly revision: Schema.String;
}>;
export type SnapshotStart = typeof SnapshotStart.Type;
export declare const SnapshotChunk: Schema.Struct<{
    readonly type: Schema.Literal<"SnapshotChunk">;
    readonly protocol: Schema.Literal<1>;
    readonly identity: Schema.Struct<{
        readonly version: Schema.Literal<1>;
        readonly server: Schema.String;
        readonly principal: Schema.String;
        readonly database: Schema.String;
        readonly catalog: Schema.String;
        readonly readView: Schema.String;
        readonly readCompatibilityHash: Schema.brand<Schema.String, "ReadCompatibilityHash">;
        readonly graphLineage: Schema.$Array<Schema.String>;
        readonly authenticator: Schema.String;
    }>;
    readonly snapshot: Schema.String;
    readonly index: Schema.Natural;
    readonly datoms: Schema.$Array<Schema.Struct<{
        readonly entity: Schema.String;
        readonly field: Schema.String;
        readonly value: Schema.Union<readonly [Schema.Union<readonly [Schema.Struct<{
            readonly type: Schema.Literal<"long">;
            readonly value: Schema.Int;
        }>, Schema.Struct<{
            readonly type: Schema.Literal<"double">;
            readonly value: Schema.Union<readonly [Schema.Finite, Schema.Literals<readonly ["positive-infinity", "negative-infinity"]>]>;
        }>, Schema.Struct<{
            readonly type: Schema.Literal<"string">;
            readonly value: Schema.String;
        }>, Schema.Struct<{
            readonly type: Schema.Literal<"boolean">;
            readonly value: Schema.Boolean;
        }>, Schema.Struct<{
            readonly type: Schema.Literal<"ref">;
            readonly value: Schema.String;
        }>, Schema.Struct<{
            readonly type: Schema.Literal<"uuid">;
            readonly value: Schema.String;
        }>, Schema.Struct<{
            readonly type: Schema.Literal<"instant">;
            readonly value: Schema.Int;
        }>, Schema.Struct<{
            readonly type: Schema.Literal<"bytes">;
            readonly value: Schema.String;
        }>]>, Schema.Struct<{
            readonly type: Schema.Literal<"string-part">;
            readonly identity: Schema.String;
            readonly index: Schema.Natural;
            readonly chunks: Schema.Natural;
            readonly value: Schema.String;
        }>, Schema.Struct<{
            readonly type: Schema.Literal<"bytes-part">;
            readonly identity: Schema.String;
            readonly index: Schema.Natural;
            readonly chunks: Schema.Natural;
            readonly value: Schema.String;
        }>]>;
        readonly op: Schema.Literal<"add">;
    }>>;
    readonly handles: Schema.$Array<Schema.Struct<{
        readonly entity: Schema.String;
        readonly handle: Schema.String;
    }>>;
}>;
export type SnapshotChunk = typeof SnapshotChunk.Type;
export declare const SnapshotCommit: Schema.Struct<{
    readonly type: Schema.Literal<"SnapshotCommit">;
    readonly protocol: Schema.Literal<1>;
    readonly identity: Schema.Struct<{
        readonly version: Schema.Literal<1>;
        readonly server: Schema.String;
        readonly principal: Schema.String;
        readonly database: Schema.String;
        readonly catalog: Schema.String;
        readonly readView: Schema.String;
        readonly readCompatibilityHash: Schema.brand<Schema.String, "ReadCompatibilityHash">;
        readonly graphLineage: Schema.$Array<Schema.String>;
        readonly authenticator: Schema.String;
    }>;
    readonly snapshot: Schema.String;
    readonly revision: Schema.String;
    readonly chunks: Schema.Natural;
}>;
export type SnapshotCommit = typeof SnapshotCommit.Type;
export declare const Change: Schema.Struct<{
    readonly type: Schema.Literal<"Change">;
    readonly protocol: Schema.Literal<1>;
    readonly identity: Schema.Struct<{
        readonly version: Schema.Literal<1>;
        readonly server: Schema.String;
        readonly principal: Schema.String;
        readonly database: Schema.String;
        readonly catalog: Schema.String;
        readonly readView: Schema.String;
        readonly readCompatibilityHash: Schema.brand<Schema.String, "ReadCompatibilityHash">;
        readonly graphLineage: Schema.$Array<Schema.String>;
        readonly authenticator: Schema.String;
    }>;
    readonly from: Schema.String;
    readonly revision: Schema.String;
    readonly datoms: Schema.$Array<Schema.Struct<{
        readonly entity: Schema.String;
        readonly field: Schema.String;
        readonly value: Schema.Union<readonly [Schema.Struct<{
            readonly type: Schema.Literal<"long">;
            readonly value: Schema.Int;
        }>, Schema.Struct<{
            readonly type: Schema.Literal<"double">;
            readonly value: Schema.Union<readonly [Schema.Finite, Schema.Literals<readonly ["positive-infinity", "negative-infinity"]>]>;
        }>, Schema.Struct<{
            readonly type: Schema.Literal<"string">;
            readonly value: Schema.String;
        }>, Schema.Struct<{
            readonly type: Schema.Literal<"boolean">;
            readonly value: Schema.Boolean;
        }>, Schema.Struct<{
            readonly type: Schema.Literal<"ref">;
            readonly value: Schema.String;
        }>, Schema.Struct<{
            readonly type: Schema.Literal<"uuid">;
            readonly value: Schema.String;
        }>, Schema.Struct<{
            readonly type: Schema.Literal<"instant">;
            readonly value: Schema.Int;
        }>, Schema.Struct<{
            readonly type: Schema.Literal<"bytes">;
            readonly value: Schema.String;
        }>]>;
        readonly op: Schema.Literals<readonly ["add", "retract"]>;
    }>>;
    readonly handles: Schema.$Array<Schema.Struct<{
        readonly entity: Schema.String;
        readonly handle: Schema.String;
    }>>;
}>;
export type Change = typeof Change.Type;
export declare const ResumeReady: Schema.Struct<{
    readonly type: Schema.Literal<"ResumeReady">;
    readonly protocol: Schema.Literal<1>;
    readonly identity: Schema.Struct<{
        readonly version: Schema.Literal<1>;
        readonly server: Schema.String;
        readonly principal: Schema.String;
        readonly database: Schema.String;
        readonly catalog: Schema.String;
        readonly readView: Schema.String;
        readonly readCompatibilityHash: Schema.brand<Schema.String, "ReadCompatibilityHash">;
        readonly graphLineage: Schema.$Array<Schema.String>;
        readonly authenticator: Schema.String;
    }>;
    readonly revision: Schema.String;
}>;
export type ResumeReady = typeof ResumeReady.Type;
export declare const Reset: Schema.Struct<{
    readonly type: Schema.Literal<"Reset">;
    readonly protocol: Schema.Literal<1>;
    readonly identity: Schema.Struct<{
        readonly version: Schema.Literal<1>;
        readonly server: Schema.String;
        readonly principal: Schema.String;
        readonly database: Schema.String;
        readonly catalog: Schema.String;
        readonly readView: Schema.String;
        readonly readCompatibilityHash: Schema.brand<Schema.String, "ReadCompatibilityHash">;
        readonly graphLineage: Schema.$Array<Schema.String>;
        readonly authenticator: Schema.String;
    }>;
}>;
export type Reset = typeof Reset.Type;
export declare const KeepAlive: Schema.Struct<{
    readonly type: Schema.Literal<"KeepAlive">;
    readonly protocol: Schema.Literal<1>;
    readonly identity: Schema.Struct<{
        readonly version: Schema.Literal<1>;
        readonly server: Schema.String;
        readonly principal: Schema.String;
        readonly database: Schema.String;
        readonly catalog: Schema.String;
        readonly readView: Schema.String;
        readonly readCompatibilityHash: Schema.brand<Schema.String, "ReadCompatibilityHash">;
        readonly graphLineage: Schema.$Array<Schema.String>;
        readonly authenticator: Schema.String;
    }>;
}>;
export type KeepAlive = typeof KeepAlive.Type;
export declare const TerminalError: Schema.Struct<{
    readonly type: Schema.Literal<"TerminalError">;
    readonly protocol: Schema.Literal<1>;
    readonly code: Schema.Literals<readonly ["incompatible-version", "update-required", "closed"]>;
    readonly identity: Schema.optionalKey<Schema.Struct<{
        readonly version: Schema.Literal<1>;
        readonly server: Schema.String;
        readonly principal: Schema.String;
        readonly database: Schema.String;
        readonly catalog: Schema.String;
        readonly readView: Schema.String;
        readonly readCompatibilityHash: Schema.brand<Schema.String, "ReadCompatibilityHash">;
        readonly graphLineage: Schema.$Array<Schema.String>;
        readonly authenticator: Schema.String;
    }>>;
}>;
export type TerminalError = typeof TerminalError.Type;
export declare const ReplicationFrame: Schema.Union<readonly [Schema.Struct<{
    readonly type: Schema.Literal<"SnapshotStart">;
    readonly protocol: Schema.Literal<1>;
    readonly identity: Schema.Struct<{
        readonly version: Schema.Literal<1>;
        readonly server: Schema.String;
        readonly principal: Schema.String;
        readonly database: Schema.String;
        readonly catalog: Schema.String;
        readonly readView: Schema.String;
        readonly readCompatibilityHash: Schema.brand<Schema.String, "ReadCompatibilityHash">;
        readonly graphLineage: Schema.$Array<Schema.String>;
        readonly authenticator: Schema.String;
    }>;
    readonly snapshot: Schema.String;
    readonly revision: Schema.String;
}>, Schema.Struct<{
    readonly type: Schema.Literal<"SnapshotChunk">;
    readonly protocol: Schema.Literal<1>;
    readonly identity: Schema.Struct<{
        readonly version: Schema.Literal<1>;
        readonly server: Schema.String;
        readonly principal: Schema.String;
        readonly database: Schema.String;
        readonly catalog: Schema.String;
        readonly readView: Schema.String;
        readonly readCompatibilityHash: Schema.brand<Schema.String, "ReadCompatibilityHash">;
        readonly graphLineage: Schema.$Array<Schema.String>;
        readonly authenticator: Schema.String;
    }>;
    readonly snapshot: Schema.String;
    readonly index: Schema.Natural;
    readonly datoms: Schema.$Array<Schema.Struct<{
        readonly entity: Schema.String;
        readonly field: Schema.String;
        readonly value: Schema.Union<readonly [Schema.Union<readonly [Schema.Struct<{
            readonly type: Schema.Literal<"long">;
            readonly value: Schema.Int;
        }>, Schema.Struct<{
            readonly type: Schema.Literal<"double">;
            readonly value: Schema.Union<readonly [Schema.Finite, Schema.Literals<readonly ["positive-infinity", "negative-infinity"]>]>;
        }>, Schema.Struct<{
            readonly type: Schema.Literal<"string">;
            readonly value: Schema.String;
        }>, Schema.Struct<{
            readonly type: Schema.Literal<"boolean">;
            readonly value: Schema.Boolean;
        }>, Schema.Struct<{
            readonly type: Schema.Literal<"ref">;
            readonly value: Schema.String;
        }>, Schema.Struct<{
            readonly type: Schema.Literal<"uuid">;
            readonly value: Schema.String;
        }>, Schema.Struct<{
            readonly type: Schema.Literal<"instant">;
            readonly value: Schema.Int;
        }>, Schema.Struct<{
            readonly type: Schema.Literal<"bytes">;
            readonly value: Schema.String;
        }>]>, Schema.Struct<{
            readonly type: Schema.Literal<"string-part">;
            readonly identity: Schema.String;
            readonly index: Schema.Natural;
            readonly chunks: Schema.Natural;
            readonly value: Schema.String;
        }>, Schema.Struct<{
            readonly type: Schema.Literal<"bytes-part">;
            readonly identity: Schema.String;
            readonly index: Schema.Natural;
            readonly chunks: Schema.Natural;
            readonly value: Schema.String;
        }>]>;
        readonly op: Schema.Literal<"add">;
    }>>;
    readonly handles: Schema.$Array<Schema.Struct<{
        readonly entity: Schema.String;
        readonly handle: Schema.String;
    }>>;
}>, Schema.Struct<{
    readonly type: Schema.Literal<"SnapshotCommit">;
    readonly protocol: Schema.Literal<1>;
    readonly identity: Schema.Struct<{
        readonly version: Schema.Literal<1>;
        readonly server: Schema.String;
        readonly principal: Schema.String;
        readonly database: Schema.String;
        readonly catalog: Schema.String;
        readonly readView: Schema.String;
        readonly readCompatibilityHash: Schema.brand<Schema.String, "ReadCompatibilityHash">;
        readonly graphLineage: Schema.$Array<Schema.String>;
        readonly authenticator: Schema.String;
    }>;
    readonly snapshot: Schema.String;
    readonly revision: Schema.String;
    readonly chunks: Schema.Natural;
}>, Schema.Struct<{
    readonly type: Schema.Literal<"Change">;
    readonly protocol: Schema.Literal<1>;
    readonly identity: Schema.Struct<{
        readonly version: Schema.Literal<1>;
        readonly server: Schema.String;
        readonly principal: Schema.String;
        readonly database: Schema.String;
        readonly catalog: Schema.String;
        readonly readView: Schema.String;
        readonly readCompatibilityHash: Schema.brand<Schema.String, "ReadCompatibilityHash">;
        readonly graphLineage: Schema.$Array<Schema.String>;
        readonly authenticator: Schema.String;
    }>;
    readonly from: Schema.String;
    readonly revision: Schema.String;
    readonly datoms: Schema.$Array<Schema.Struct<{
        readonly entity: Schema.String;
        readonly field: Schema.String;
        readonly value: Schema.Union<readonly [Schema.Struct<{
            readonly type: Schema.Literal<"long">;
            readonly value: Schema.Int;
        }>, Schema.Struct<{
            readonly type: Schema.Literal<"double">;
            readonly value: Schema.Union<readonly [Schema.Finite, Schema.Literals<readonly ["positive-infinity", "negative-infinity"]>]>;
        }>, Schema.Struct<{
            readonly type: Schema.Literal<"string">;
            readonly value: Schema.String;
        }>, Schema.Struct<{
            readonly type: Schema.Literal<"boolean">;
            readonly value: Schema.Boolean;
        }>, Schema.Struct<{
            readonly type: Schema.Literal<"ref">;
            readonly value: Schema.String;
        }>, Schema.Struct<{
            readonly type: Schema.Literal<"uuid">;
            readonly value: Schema.String;
        }>, Schema.Struct<{
            readonly type: Schema.Literal<"instant">;
            readonly value: Schema.Int;
        }>, Schema.Struct<{
            readonly type: Schema.Literal<"bytes">;
            readonly value: Schema.String;
        }>]>;
        readonly op: Schema.Literals<readonly ["add", "retract"]>;
    }>>;
    readonly handles: Schema.$Array<Schema.Struct<{
        readonly entity: Schema.String;
        readonly handle: Schema.String;
    }>>;
}>, Schema.Struct<{
    readonly type: Schema.Literal<"ResumeReady">;
    readonly protocol: Schema.Literal<1>;
    readonly identity: Schema.Struct<{
        readonly version: Schema.Literal<1>;
        readonly server: Schema.String;
        readonly principal: Schema.String;
        readonly database: Schema.String;
        readonly catalog: Schema.String;
        readonly readView: Schema.String;
        readonly readCompatibilityHash: Schema.brand<Schema.String, "ReadCompatibilityHash">;
        readonly graphLineage: Schema.$Array<Schema.String>;
        readonly authenticator: Schema.String;
    }>;
    readonly revision: Schema.String;
}>, Schema.Struct<{
    readonly type: Schema.Literal<"Reset">;
    readonly protocol: Schema.Literal<1>;
    readonly identity: Schema.Struct<{
        readonly version: Schema.Literal<1>;
        readonly server: Schema.String;
        readonly principal: Schema.String;
        readonly database: Schema.String;
        readonly catalog: Schema.String;
        readonly readView: Schema.String;
        readonly readCompatibilityHash: Schema.brand<Schema.String, "ReadCompatibilityHash">;
        readonly graphLineage: Schema.$Array<Schema.String>;
        readonly authenticator: Schema.String;
    }>;
}>, Schema.Struct<{
    readonly type: Schema.Literal<"KeepAlive">;
    readonly protocol: Schema.Literal<1>;
    readonly identity: Schema.Struct<{
        readonly version: Schema.Literal<1>;
        readonly server: Schema.String;
        readonly principal: Schema.String;
        readonly database: Schema.String;
        readonly catalog: Schema.String;
        readonly readView: Schema.String;
        readonly readCompatibilityHash: Schema.brand<Schema.String, "ReadCompatibilityHash">;
        readonly graphLineage: Schema.$Array<Schema.String>;
        readonly authenticator: Schema.String;
    }>;
}>, Schema.Struct<{
    readonly type: Schema.Literal<"TerminalError">;
    readonly protocol: Schema.Literal<1>;
    readonly code: Schema.Literals<readonly ["incompatible-version", "update-required", "closed"]>;
    readonly identity: Schema.optionalKey<Schema.Struct<{
        readonly version: Schema.Literal<1>;
        readonly server: Schema.String;
        readonly principal: Schema.String;
        readonly database: Schema.String;
        readonly catalog: Schema.String;
        readonly readView: Schema.String;
        readonly readCompatibilityHash: Schema.brand<Schema.String, "ReadCompatibilityHash">;
        readonly graphLineage: Schema.$Array<Schema.String>;
        readonly authenticator: Schema.String;
    }>>;
}>]>;
export type ReplicationFrame = typeof ReplicationFrame.Type;
declare const ReplicationProtocolError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "ReplicationProtocolError";
} & Readonly<A>;
export declare class ReplicationProtocolError extends ReplicationProtocolError_base<{
    readonly reason: "malformed" | "oversized" | "incompatible-version";
}> {
}
export declare const decodeActivationRequest: (text: string) => Result.Result<ActivationRequest, ReplicationProtocolError>;
export declare const decodeReplicationFrame: (text: string) => Result.Result<ReplicationFrame, ReplicationProtocolError>;
export declare const encodeActivationRequest: (request: ActivationRequest) => string;
export declare const replicationFrameFitsBound: (frame: ReplicationFrame) => boolean;
export declare const encodeReplicationFrame: (frame: ReplicationFrame) => string;
export {};
//# sourceMappingURL=protocol.d.ts.map