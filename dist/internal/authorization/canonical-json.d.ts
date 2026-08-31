import type { JsonValue } from "./json.ts";
export declare const AUTHORIZATION_CANONICAL_JSON_VERSION: "rfc8785-jcs/1";
export declare const compareCanonicalKeys: (left: string, right: string) => number;
export declare const hasLoneSurrogate: (value: string) => boolean;
export declare const canonicalizeJson: (json: JsonValue) => string;
//# sourceMappingURL=canonical-json.d.ts.map